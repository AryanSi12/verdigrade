import { describe, expect, it } from "vitest";
import {
  allowedRecipePairs,
  loadMatrix,
  normalizeBoot,
  normalizeBootTarget,
  normalizeJava,
  resolveRoute,
  validateProfiles,
  matrixSchema,
  loadModernizerRules,
} from "../bot/lib/matrix.js";

describe("matrix validation", () => {
  it("accepts the shipped matrix and every rules pack", () => {
    const result = validateProfiles();
    expect(result.problems).toEqual([]);
    expect(result.packs).toEqual(expect.arrayContaining(["boot3", "boot4", "none", "acme-samples"]));
  });

  it("resolves artifact keys to pinned coordinates (single source of truth)", () => {
    const matrix = loadMatrix();
    for (const route of matrix.routes) {
      for (const step of route.recipes) expect(step.artifact).toMatch(/^[\w.-]+:[\w.-]+:\d[\w.-]*$/);
    }
  });

  it("rejects a malformed matrix with readable issues", () => {
    const parsed = matrixSchema.safeParse({ schemaVersion: 2, plugin: "nope", routes: [] });
    expect(parsed.success).toBe(false);
  });

  it("fails loudly on an unknown rules pack instead of falling back to none", () => {
    expect(() => loadModernizerRules("does-not-exist")).toThrow(/does not exist/);
  });

  it("keeps the sample-only acme rule out of the org packs", () => {
    expect(loadModernizerRules("boot4").removeProperties).not.toContain("acme.legacy.boot2-mode");
    expect(loadModernizerRules("boot3").removeProperties).not.toContain("acme.legacy.boot2-mode");
    expect(loadModernizerRules("acme-samples").removeProperties).toContain("acme.legacy.boot2-mode");
  });
});

describe("normalizers", () => {
  it("normalizes Java levels", () => {
    expect(normalizeJava("1.8")).toBe("8");
    expect(normalizeJava("11.0.2")).toBe("11");
    expect(normalizeJava("21")).toBe("21");
    expect(normalizeJava("${java.version}")).toBe("unknown");
    expect(normalizeJava("")).toBe("unknown");
  });

  it("maps Boot versions to families and keeps unknown distinct from none", () => {
    expect(normalizeBoot("2.7.18")).toBe("2.x");
    expect(normalizeBoot("1.5.22.RELEASE")).toBe("1.x");
    expect(normalizeBoot("")).toBe("unknown");
    expect(normalizeBoot(undefined)).toBe("unknown");
    expect(normalizeBoot("none")).toBe("none");
  });

  it("maps 3.x targets to the configured supported line, with a note", () => {
    expect(normalizeBootTarget("3.3.x").id).toBe("3.5.x");
    expect(normalizeBootTarget("3.3.x").note).toMatch(/3\.5\.x/);
    expect(normalizeBootTarget("3.5.2").id).toBe("3.5.x");
    expect(normalizeBootTarget("4.0.x")).toEqual({ id: "4.0.x", note: null });
    expect(normalizeBootTarget("5.0.x").id).toBe("5.0.x");
  });
});

describe("resolveRoute", () => {
  it("resolves the default route", () => {
    const result = resolveRoute({ targetJava: "21", targetBoot: "4.0.x", fromJava: "1.8", fromBoot: "2.7.18" });
    expect(result.ok && result.route.id).toBe("to-java21-boot4");
  });

  it("uses matrix defaults when targets are missing", () => {
    const result = resolveRoute({});
    expect(result.ok && result.route.id).toBe("to-java21-boot4");
  });

  it("rejects Boot 1.x as an unsupported From instead of treating it as no Boot", () => {
    const result = resolveRoute({ targetJava: "21", targetBoot: "4.0.x", fromBoot: "1.5.22.RELEASE" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/From Boot 1\.x/);
  });

  it("rejects an unsupported From Java", () => {
    const result = resolveRoute({ targetJava: "17", targetBoot: "none", fromJava: "21" });
    expect(result.ok).toBe(false);
  });

  it("rejects unsupported targets", () => {
    expect(resolveRoute({ targetJava: "25", targetBoot: "4.0.x" }).ok).toBe(false);
    expect(resolveRoute({ targetJava: "21", targetBoot: "5.0.x" }).ok).toBe(false);
  });

  it("allows only matrix/rules-pack recipe pairs", () => {
    const pairs = allowedRecipePairs();
    expect(pairs.some((pair) => pair.recipe === "org.openrewrite.java.spring.boot4.UpgradeSpringBoot_4_0")).toBe(true);
    expect(pairs.every((pair) => !/LATEST|RELEASE/.test(pair.artifact))).toBe(true);
  });
});
