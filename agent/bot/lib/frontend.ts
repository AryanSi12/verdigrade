import { listRepoFiles, readText } from "./adapters/findings.js";
import { lockTargets, type MigrationPlan, type PlanItem } from "./plan.js";

/**
 * Is the page that ships inside the app (static HTML / JavaScript) tied to what the AI items change? (Java only)
 *
 * Hybrid's AI is handed the item files and the test output, so it never reads `src/main/resources/static`. When that
 * page calls API paths the items cover, or uses the CSRF or login mechanism an item configures, the Java can be fixed
 * and pass its tests while the page stays broken. Full AI reads the whole repository. The signal only looks at what
 * the sources say; it does not claim the page will break.
 */
export type FrontendCoupling = {
  /** Static HTML / JS / CSS files found (the ones that call the API are counted in `callers`). */
  files: number;
  /** Files that call an API path. */
  callers: number;
  /** Distinct API paths the page calls that an AI item's file also names (for example /api/** in a security config). */
  calls: number;
  /** Calls whose path ends in "/" (Spring Framework 6 no longer matches /x/ to /x). */
  trailingSlash: string[];
  /** The page sends a CSRF token (cookie to header) and an item configures CSRF (Spring Security 6 loads and checks it differently). */
  csrf: boolean;
  /** The page sends credentials (Authorization header, cookies) and an item configures login or the session. */
  login: boolean;
  coupled: boolean;
  /** High when the page uses a mechanism Spring 6 / Security 6 changed (CSRF, trailing slash); medium when only paths overlap. */
  strength: "high" | "medium" | "none";
  /** Short labels for the reasons text. */
  patterns: string[];
};

export const noFrontend: FrontendCoupling = { files: 0, callers: 0, calls: 0, trailingSlash: [], csrf: false, login: false, coupled: false, strength: "none", patterns: [] };

type Source = { file: string; text: string };

const frontendFile = /(^|\/)src\/main\/(resources\/(static|public|templates)|webapp)\/.+\.(js|mjs|html|htm)$/i;
const stripJsComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|(^|[^:"'`\\])\/\/.*$/gm, "$1");
const stripJavaComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
const assetPath = /\.(?:js|mjs|css|png|jpe?g|gif|svg|ico|html?|map|woff2?|ttf|json)$/i;

function pathLiterals(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/(['"`])(\/[A-Za-z0-9_\-./{}$:?=&%]*)\1/g)) {
    let path = match[2].split("?")[0];
    if (path.length < 2 || path.startsWith("//") || !/[A-Za-z]/.test(path) || assetPath.test(path)) continue;
    path = path.replace(/\$\{[^}]*\}/g, "{id}");
    out.add(path);
  }
  return [...out];
}

/** Paths an item file names ("/api/**" becomes "/api"); asset folders are left out. */
function backendPrefixes(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/"(\/[A-Za-z0-9_\-./*{}]*)"/g)) {
    const prefix = match[1].replace(/\/\*+$/, "").replace(/\/$/, "");
    if (prefix.length < 2 || /^\/(css|js|img|images|static|assets|webjars)\b/.test(prefix) || assetPath.test(prefix)) continue;
    out.add(prefix);
  }
  return [...out];
}

const covers = (prefix: string, call: string) => call === prefix || call.startsWith(`${prefix}/`);

/** Pure core: the frontend files and the AI items' Java files, as text. */
export function analyzeFrontend(frontend: Source[], itemFiles: Source[]): FrontendCoupling {
  if (!frontend.length || !itemFiles.length) return { ...noFrontend, files: frontend.length };
  const prefixes = new Set<string>();
  let backendCsrf = false;
  let backendLogin = false;
  for (const file of itemFiles) {
    const text = stripJavaComments(file.text);
    for (const prefix of backendPrefixes(text)) prefixes.add(prefix);
    backendCsrf ||= /csrf|XSRF/i.test(text);
    backendLogin ||= /httpBasic|formLogin|SecurityContext|HttpSession|rememberMe|oauth2Login|JSESSIONID|authenticationEntryPoint/.test(text);
  }
  const calls = new Set<string>();
  const covered = new Set<string>();
  const trailing = new Set<string>();
  const callers = new Set<string>();
  let frontendCsrf = false;
  let frontendLogin = false;
  for (const file of frontend) {
    if (!/\.(js|mjs|html?)$/i.test(file.file)) continue;
    const text = stripJsComments(file.text);
    const found = pathLiterals(text).filter((path) => /\/api\b|\/rest\b|\/v\d+\//.test(path) || [...prefixes].some((prefix) => covers(prefix, path)));
    for (const path of found) {
      calls.add(path);
      callers.add(file.file);
      if ([...prefixes].some((prefix) => covers(prefix, path))) covered.add(path);
      if (path.length > 1 && path.endsWith("/") && path.split("/").filter(Boolean).length >= 2) trailing.add(path);
    }
    frontendCsrf ||= /XSRF-TOKEN|X-XSRF|X-CSRF|_csrf|csrfToken|csrf-token/i.test(text);
    frontendLogin ||= /Authorization|credentials\s*:\s*['"]include['"]|withCredentials|JSESSIONID/.test(text);
  }
  const csrf = frontendCsrf && backendCsrf;
  const login = frontendLogin && backendLogin;
  const patterns: string[] = [];
  if (trailing.size) patterns.push(`${trailing.size} API ${trailing.size === 1 ? "path ends" : "paths end"} in "/" (Spring Framework 6 no longer matches a trailing slash)`);
  if (csrf) patterns.push("the page sends the CSRF cookie back as a header (Spring Security 6 loads and checks the token differently)");
  if (login) patterns.push("the page handles login itself (Authorization header or session cookie)");
  const coupled = covered.size > 0 || csrf || login;
  const strength = !coupled ? "none" : csrf || trailing.size ? "high" : "medium";
  return { files: frontend.length, callers: callers.size, calls: covered.size, trailingSlash: [...trailing].sort(), csrf, login, coupled, strength, patterns };
}

export function frontendCoupling(plan: MigrationPlan, aiItems: PlanItem[]): FrontendCoupling {
  if (plan.ecosystem !== "java" || !aiItems.length) return noFrontend;
  try {
    const all = listRepoFiles(plan.repoPath);
    const frontend = all.filter((file) => frontendFile.test(file)).map((file) => ({ file, text: readText(plan.repoPath, file) }));
    if (!frontend.length) return noFrontend;
    const itemFiles = [...new Set(aiItems.flatMap((item) => lockTargets(item)))].filter((file) => file.endsWith(".java")).map((file) => ({ file, text: readText(plan.repoPath, file) }));
    return analyzeFrontend(frontend, itemFiles);
  } catch {
    return noFrontend;
  }
}
