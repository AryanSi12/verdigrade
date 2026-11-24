/**
 * Every finding kind an adapter can produce. A finding's `kind` keys its
 * plain-language explanation in profiles/explanations/<ecosystem>.json (or
 * common.json). `finding()` only accepts these, and test/explanations.test.ts
 * fails when a kind has no catalogue entry, so a new check cannot ship without
 * its explanation.
 */

/** Shared by every ecosystem (findings.ts). Explained in explanations/common.json. */
export const commonKinds = ["secrets.file", "secrets.example", "inline-secret", "db-migration", "native-code.dir", "container", "ci", "tests.none", "tests.few"] as const;

/** Java / Spring Boot (javaPlan.ts). Explained in explanations/java.json. */
export const javaKinds = [
  "recipe.java",
  "recipe.boot",
  "recipe.jakarta",
  "recipe.other",
  "rules.config",
  "rules.build",
  "property-conflict",
  "api.security-config",
  "api.mvc-adapter",
  "api.commons-multipart",
  "api.mockbean",
  "api.jackson2",
  "api.jackson2-spring-bridge",
  "api.dao-auth-provider",
  "api.security-and",
  "api.global-method-security",
  "api.hibernate-type",
  "api.error-path",
  "api.jdk-internal",
  "api.security-manager",
  "api.boxed-constructor",
  "api.finalize",
  "spring-factories",
  "reflection",
  "javax-string",
  "generated-code",
  "native-method",
  "dependency.no-jakarta",
  "dependency.lombok",
  "generator-plugin",
  "custom-build.plugin",
  "custom-build.buildsrc",
  "build-plugin",
  "jvm-flags",
  "web-xml",
  "classic-spring",
  "build-config.java-level",
] as const;

/** Node.js / TypeScript (node.ts). Explained in explanations/node.json. */
export const nodeKinds = [
  "codemod.express5",
  "express-api.codemod",
  "rules.package-json",
  "rules.tsconfig",
  "rules.nvmrc",
  "rules.other",
  "install",
  "node-api.removed",
  "node-api.deprecated",
  "express-routing",
  "express-api.req-query",
  "native-addon",
  "native-addon.node-sass",
  "dependency.request",
  "dependency.ts-node",
  "dependency.ts-jest",
  "dependency.manual",
  "tsconfig.manual",
  "tsconfig.extends",
  "tests.no-script",
  "package-manager",
] as const;

/** Python / Django / Flask (python.ts). Explained in explanations/python.json. */
export const pythonKinds = [
  "codemod.pyupgrade",
  "codemod.django-upgrade",
  "django-api.codemod",
  "rules.requirements",
  "rules.pyproject",
  "rules.python-version",
  "rules.stdlib",
  "rules.flask-imports",
  "rules.flask-json-config",
  "install.venv",
  "install.none",
  "python-module.removed",
  "python-api.removed",
  "python-api.deprecated",
  "flask-api.removed",
  "flask-api.deprecated",
  "werkzeug-api.removed",
  "django-api.removed",
  "django.default-auto-field",
  "django.use-tz",
  "dependency.pydantic-v1",
  "dependency.native-wheel",
  "dependency.manual",
  "tests.pytest-undeclared",
  "package-manager.python",
] as const;

export type CommonKind = (typeof commonKinds)[number];
export type JavaKind = (typeof javaKinds)[number];
export type NodeKind = (typeof nodeKinds)[number];
export type PythonKind = (typeof pythonKinds)[number];
export type FindingKind = CommonKind | JavaKind | NodeKind | PythonKind;

export const kindsByEcosystem = { java: [...commonKinds, ...javaKinds], node: [...commonKinds, ...nodeKinds], python: [...commonKinds, ...pythonKinds] } as const;
