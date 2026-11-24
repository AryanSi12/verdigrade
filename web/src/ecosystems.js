// Display metadata for the language adapters the agent ships (agent/bot/lib/adapters/*).
// The server stays the source of truth for labels, targets and step names (GET /config, /matrix).
export const ecosystemMeta = {
  java: {
    id: "java",
    label: "Java / Spring Boot",
    short: "Java",
    build: "Maven · Gradle",
    engine: "OpenRewrite recipes",
    files: "pom.xml · build.gradle",
    blurb: "Java 8–17 to Java 17 or 21, Spring Boot 2.x to 3.5 or 4.0, javax to jakarta.",
  },
  node: {
    id: "node",
    label: "Node.js / TypeScript",
    short: "Node",
    build: "npm",
    engine: "Codemods",
    files: "package.json · tsconfig.json",
    blurb: "Node 14–24 to Node 22, 24 or 26 LTS, TypeScript to 5.9 or 6.0, Express 4 to 5 with the official codemod.",
  },
  python: {
    id: "python",
    label: "Python / Django · Flask",
    short: "Python",
    build: "pip · venv",
    engine: "Codemods",
    files: "pyproject.toml · requirements.txt",
    blurb: "Python 3.8–3.14 to Python 3.13, 3.14 or 3.15, Django to 5.2 LTS or 6.1, Flask 2 to 3.1, with pyupgrade and django-upgrade.",
  },
};

export const roadmap = [".NET"];

export function ecosystemOf(value) {
  return ecosystemMeta[value] ?? ecosystemMeta.java;
}

/** Severity → tone/icon used by plan items everywhere. */
export const severityRank = { high: 3, medium: 2, low: 1, info: 0 };
