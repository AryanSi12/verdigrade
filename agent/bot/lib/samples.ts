import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { samplesRoot } from "./config.js";
import { scanNodeProject } from "./adapters/nodeScan.js";
import { isPythonProject, scanPythonProject } from "./adapters/pythonScan.js";
import { pomFacts } from "./scanner.js";
import type { Ecosystem } from "./types.js";

export type SampleInfo = {
  name: string;
  path: string;
  ecosystem: Ecosystem;
  /** Java samples; "" for other ecosystems. */
  java: string;
  boot: string;
  /** Node samples; "" for other ecosystems. */
  node: string;
  typescript: string;
  express: string;
  /** Python samples; "" for other ecosystems. */
  python: string;
  django: string;
  flask: string;
  /** One-line "from" summary, e.g. "Java 1.8 · Boot 2.7.18" or "Node 18 · TypeScript 4.9 · Express 4". */
  fromLabel: string;
  blurb: string;
};

const knownBlurbs: Record<string, string> = {
  shipping: "Labels with javax servlet + legacy logging props",
  loyalty: "Points ledger needing webmvc + property renames",
  warehouse: "Java 11 → 21 and Boot 2.5 → 4.0 hop",
  reservations: "Booking API with full modernizer checklist",
  fleet: "Vehicles with static-locations + boot2-mode flag",
  "node-orders": "Express 4 API on Node 18 + TypeScript 4.9",
  "python-inventory": "Flask 2.0 stock API on Python 3.8, removed stdlib calls",
  orderdesk: "Refactor showcase: orders dashboard with a page, old-style code for the refactor quiz",
};

function blurbFor(name: string, readme: string): string {
  if (knownBlurbs[name]) return knownBlurbs[name];
  const fromReadme = readme
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  if (fromReadme) return fromReadme.replace(/[*_`]/g, "").slice(0, 140);
  return `Pre-migration sample "${name}"`;
}

export function listSamples(): SampleInfo[] {
  if (!existsSync(samplesRoot)) return [];
  const samples: SampleInfo[] = [];
  for (const entry of readdirSync(samplesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const dir = path.join(samplesRoot, entry.name);
    const pomPath = path.join(dir, "pom.xml");
    const isJava = existsSync(pomPath);
    const isPython = !isJava && isPythonProject(dir);
    if (!isJava && !isPython && !existsSync(path.join(dir, "package.json"))) continue;
    let readme = "";
    try {
      readme = readFileSync(path.join(dir, "README.md"), "utf8");
    } catch {
      /* optional */
    }
    if (isJava) {
      const facts = pomFacts(pomPath);
      const java = facts.java ?? "unknown";
      const boot = facts.boot ?? "none";
      samples.push({
        name: entry.name,
        path: dir,
        ecosystem: "java",
        java,
        boot,
        node: "",
        typescript: "",
        express: "",
        python: "",
        django: "",
        flask: "",
        fromLabel: `Java ${java} · Boot ${boot}`,
        blurb: blurbFor(entry.name, readme),
      });
      continue;
    }
    if (isPython) {
      try {
        const scan = scanPythonProject(dir);
        const python = scan.pythonVersion ?? "unknown";
        const django = scan.djangoVersion ?? "";
        const flask = scan.flaskVersion ?? "";
        samples.push({
          name: entry.name,
          path: dir,
          ecosystem: "python",
          java: "",
          boot: "",
          node: "",
          typescript: "",
          express: "",
          python,
          django,
          flask,
          fromLabel: [`Python ${python}`, django ? `Django ${django}` : "", flask ? `Flask ${flask}` : ""].filter(Boolean).join(" · "),
          blurb: blurbFor(entry.name, readme),
        });
      } catch {
        /* unreadable metadata: not offered as a sample */
      }
      continue;
    }
    try {
      const scan = scanNodeProject(dir);
      const node = scan.nodeVersion ?? "unknown";
      const typescript = scan.typescriptVersion ?? "";
      const express = scan.expressMajor != null ? String(scan.expressMajor) : "";
      samples.push({
        name: entry.name,
        path: dir,
        ecosystem: "node",
        java: "",
        boot: "",
        node,
        typescript,
        express,
        python: "",
        django: "",
        flask: "",
        fromLabel: [`Node ${node}`, typescript ? `TypeScript ${typescript}` : "", express ? `Express ${express}` : ""].filter(Boolean).join(" · "),
        blurb: blurbFor(entry.name, readme),
      });
    } catch {
      /* unreadable package.json: not offered as a sample */
    }
  }
  return samples.sort((a, b) => a.name.localeCompare(b.name));
}

export function samplesRootPath(): string {
  return samplesRoot;
}
