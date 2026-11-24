import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runPipeline, type Fixer } from "../bot/lib/pipeline.js";

// Opt-in (needs JDK 21, Maven and network): LEAPFROG_E2E=1 npx vitest run test/pagecheck-e2e.test.ts
// Runs the webapp sample twice with the real OpenRewrite step, the real jar and the real page check. No AI is involved:
// the "AI" below is a script that makes the edits a reviewer would, so this tests the pipeline's page-check loop, not a model.
const samples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples");

const edit = (file: string, from: string | RegExp, to: string) => {
  const text = readFileSync(file, "utf8");
  const next = text.replace(from, to);
  if (next === text) throw new Error(`no change in ${file}`);
  writeFileSync(file, next);
};
const calls: string[] = [];
let migrated = "";
const fixer: Fixer = async (ctx) => {
  calls.push(`${ctx.phase}/${ctx.reason ?? ""}/${ctx.round}: ${ctx.failure.split("\n").length} line(s)`);
  const w = ctx.workPath;
  if (ctx.phase === "upgrade") {
    for (const sub of ["src", "pom.xml"]) rmSync(path.join(w, sub), { recursive: true, force: true });
    cpSync(path.join(migrated, "src"), path.join(w, "src"), { recursive: true });
    cpSync(path.join(migrated, "pom.xml"), path.join(w, "pom.xml"));
    return { status: "finished", note: "scripted upgrade", sessionId: null, usage: { tokensIn: 100, tokensOut: 10 } as never };
  }
  if (ctx.reason === "page") {
    const js = path.join(w, "src/main/resources/static/js/api.js");
    if (ctx.round === 1) {
      let text = readFileSync(js, "utf8");
      text = text.replace(/'\/api\/tasks\/stats\/'/, "'/api/tasks/stats'").replace(/'\/api\/tasks\/' \+ query/, "'/api/tasks' + query").replace(/request\('POST', '\/api\/tasks\/', task\)/, "request('POST', '/api/tasks', task)").replace(/'\/complete\/'/, "'/complete'").replace(/'\/api\/tasks\/' \+ id \+ '\/'/, "'/api/tasks/' + id");
      writeFileSync(js, text);
    } else {
      const dir = path.join(w, "src/main/java/com/acme/board");
      writeFileSync(path.join(dir, "config/SpaCsrfTokenRequestHandler.java"), `package com.acme.board.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.function.Supplier;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.CsrfTokenRequestHandler;
import org.springframework.security.web.csrf.XorCsrfTokenRequestAttributeHandler;
import org.springframework.util.StringUtils;

final class SpaCsrfTokenRequestHandler implements CsrfTokenRequestHandler {
    private final CsrfTokenRequestHandler plain = new CsrfTokenRequestAttributeHandler();
    private final CsrfTokenRequestHandler xor = new XorCsrfTokenRequestAttributeHandler();

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, Supplier<CsrfToken> csrfToken) {
        this.xor.handle(request, response, csrfToken);
        csrfToken.get();
    }

    @Override
    public String resolveCsrfTokenValue(HttpServletRequest request, CsrfToken csrfToken) {
        String headerValue = request.getHeader(csrfToken.getHeaderName());
        return (StringUtils.hasText(headerValue) ? this.plain : this.xor).resolveCsrfTokenValue(request, csrfToken);
    }
}
`);
      writeFileSync(path.join(dir, "config/CsrfCookieFilter.java"), `package com.acme.board.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.filter.OncePerRequestFilter;

final class CsrfCookieFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        CsrfToken token = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        if (token != null) {
            token.getToken();
        }
        chain.doFilter(request, response);
    }
}
`);
      const sec = path.join(dir, "config/SecurityConfig.java");
      edit(sec, "csrf.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()))", "csrf.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()).csrfTokenRequestHandler(new SpaCsrfTokenRequestHandler()))\n            .addFilterAfter(new CsrfCookieFilter(), BasicAuthenticationFilter.class)");
      edit(sec, "import org.springframework.security.web.csrf.CookieCsrfTokenRepository;", "import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;\nimport org.springframework.security.web.csrf.CookieCsrfTokenRepository;");
      const resp = path.join(dir, "dto/TaskResponse.java");
      edit(resp, "    public Integer getETA()", '    @JsonProperty("eta")\n    public Integer getETA()');
      edit(resp, "    public String getURL()", '    @JsonProperty("url")\n    public String getURL()');
      edit(resp, "import com.acme.board.task.Priority;", "import com.acme.board.task.Priority;\nimport com.fasterxml.jackson.annotation.JsonProperty;");
    }
    return { status: "finished", note: "scripted page fix round " + ctx.round, sessionId: null };
  }
  return { status: "finished", note: "nothing", sessionId: null };
};

describe.skipIf(!process.env.LEAPFROG_E2E)("page check, end to end (webapp sample)", () => {
  it("a free-step-only run is green but its page is broken; a fixer that repairs the page gets it to zero problems", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "leapfrog-e2e-"));
    process.env.LEAPFROG_ROOTS = [samples, root].join(path.delimiter);
    const repo = path.join(root, "webapp");
    cpSync(path.join(samples, "webapp"), repo, { recursive: true });
    rmSync(path.join(repo, "target"), { recursive: true, force: true });
    const common = { repoPath: repo, dryRun: true, targetJava: "21", targetBoot: "4.0.x" };
    try {
      const classic = await runPipeline({ ...common, runId: "e2e-classic", engine: "classic", artifactsDir: path.join(root, "art-classic") });
      expect(classic.status).toBe("passed");
      expect(classic.tests?.ok).toBe(true);
      expect(classic.pageCheck?.ran).toBe(true);
      expect(classic.pageCheck?.fixAttempted).toBe(false);
      expect(classic.pageCheck?.problems.length).toBeGreaterThanOrEqual(4);
      expect(classic.pageCheck?.problems.map((problem) => problem.kind)).toEqual(expect.arrayContaining(["http", "csrf", "field"]));
      expect(classic.steps.checks.summary).toMatch(/page check: \d+ problems/);
      migrated = classic.workPath;

      const ai = await runPipeline({ ...common, runId: "e2e-ai", engine: "ai", fixer, artifactsDir: path.join(root, "art-ai") });
      expect(ai.status).toBe("passed");
      expect(calls.filter((call) => call.startsWith("fix/page"))).toHaveLength(2);
      expect(ai.pageCheck).toMatchObject({ ran: true, fixAttempted: true, rounds: 2, problems: [] });
      expect(ai.pageCheck?.initialProblems).toBeGreaterThanOrEqual(4);
      expect(ai.checks.find((check) => check.id === "page-check")?.ok).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }, 30 * 60_000);
});
