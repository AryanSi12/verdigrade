import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tempDir } from "./helpers.js";
import { describe, expect, it } from "vitest";
import { loadModernizerRules } from "../bot/lib/matrix.js";
import {
  applyRules,
  mergeRules,
  removePropertiesKey,
  removeYamlKey,
  renameGradleDependency,
  renamePomDependency,
  renamePropertiesKey,
  renameYamlKey,
} from "../bot/lib/rules.js";

const pom = `<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-webflux</artifactId>
    </dependency>
    <dependency>
      <groupId>com.acme</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
  </dependencies>
</project>`;

describe("dependency renames", () => {
  it("renames only the exact Boot web starter and is idempotent", () => {
    const once = renamePomDependency(pom, "org.springframework.boot", "spring-boot-starter-web", "spring-boot-starter-webmvc");
    expect(once.changed).toBe(true);
    expect(once.text).toContain("<artifactId>spring-boot-starter-webmvc</artifactId>");
    expect(once.text).toContain("<artifactId>spring-boot-starter-webflux</artifactId>");
    expect(once.text).toContain("<groupId>com.acme</groupId>\n      <artifactId>spring-boot-starter-web</artifactId>");
    const twice = renamePomDependency(once.text, "org.springframework.boot", "spring-boot-starter-web", "spring-boot-starter-webmvc");
    expect(twice.changed).toBe(false);
    expect(twice.text).toBe(once.text);
    expect(twice.text).not.toContain("webmvcmvc");
  });

  it("does not rename an exclusion inside another dependency", () => {
    const text = `<dependency>
  <groupId>com.acme</groupId>
  <artifactId>lib</artifactId>
  <exclusions><exclusion><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></exclusion></exclusions>
</dependency>`;
    expect(renamePomDependency(text, "org.springframework.boot", "spring-boot-starter-web", "spring-boot-starter-webmvc").changed).toBe(false);
  });

  it("renames Gradle coordinates", () => {
    const text = `implementation 'org.springframework.boot:spring-boot-starter-web'\nimplementation("org.springframework.boot:spring-boot-starter-webflux")\n`;
    const result = renameGradleDependency(text, "org.springframework.boot", "spring-boot-starter-web", "spring-boot-starter-webmvc");
    expect(result.text).toBe(`implementation 'org.springframework.boot:spring-boot-starter-webmvc'\nimplementation("org.springframework.boot:spring-boot-starter-webflux")\n`);
  });
});

describe("properties", () => {
  it("renames whole keys with any separator and never a prefix", () => {
    const text = "logging.file=a.log\nlogging.file.name=keep\nlogging.file.max-size=10MB\n#logging.file=comment\nlogging.file : b\nlogging.file    c\n";
    const result = renamePropertiesKey(text.replace("logging.file.name=keep\n", ""), "logging.file", "logging.file.name");
    expect(result.text).toBe("logging.file.name=a.log\nlogging.file.max-size=10MB\n#logging.file=comment\nlogging.file.name : b\nlogging.file.name    c\n");
    expect(renamePropertiesKey(result.text, "logging.file", "logging.file.name").changed).toBe(false);
  });

  it("refuses to rename when the target key already exists", () => {
    const result = renamePropertiesKey("logging.file=a\nlogging.file.name=b\n", "logging.file", "logging.file.name");
    expect(result.changed).toBe(false);
    expect(result.notes[0]).toMatch(/both/);
  });

  it("removes whole keys including continuation lines", () => {
    const result = removePropertiesKey("a=1\nacme.legacy.boot2-mode=true \\\n  more\nacme.legacy.boot2-mode-x=keep\n", "acme.legacy.boot2-mode");
    expect(result.text).toBe("a=1\nacme.legacy.boot2-mode-x=keep\n");
  });

  it("keeps CRLF line endings", () => {
    expect(renamePropertiesKey("logging.file=a\r\nx=1\r\n", "logging.file", "logging.file.name").text).toBe("logging.file.name=a\r\nx=1\r\n");
  });
});

describe("yaml", () => {
  it("renames a nested key within its parent and is idempotent", () => {
    const text = "logging:\n  file: logs/app.log\n  level:\n    root: INFO\n";
    const once = renameYamlKey(text, "logging.file", "logging.file.name");
    expect(once.text).toBe("logging:\n  file.name: logs/app.log\n  level:\n    root: INFO\n");
    expect(renameYamlKey(once.text, "logging.file", "logging.file.name").changed).toBe(false);
  });

  it("does not touch a key that is already a mapping", () => {
    const text = "logging:\n  file:\n    name: logs/app.log\n";
    expect(renameYamlKey(text, "logging.file", "logging.file.name").changed).toBe(false);
  });

  it("moves a key to another parent and prunes the emptied parents", () => {
    const text = "spring:\n  http:\n    encoding:\n      charset: UTF-8\n  application:\n    name: demo\n";
    const result = renameYamlKey(text, "spring.http.encoding.charset", "server.servlet.encoding.charset");
    expect(result.text).toBe("spring:\n  application:\n    name: demo\nserver.servlet.encoding.charset: UTF-8\n");
  });

  it("handles dotted keys, comments and multiple documents", () => {
    const text = "# main\nspring.resources.static-locations: classpath:/a/ # inline\n---\nspring:\n  config:\n    activate:\n      on-profile: prod\n  resources:\n    static-locations: classpath:/b/\n";
    const result = renameYamlKey(text, "spring.resources.static-locations", "spring.web.resources.static-locations");
    expect(result.text).toBe(
      "# main\nspring.web.resources.static-locations: classpath:/a/ # inline\n---\nspring:\n  web.resources.static-locations: classpath:/b/\n  config:\n    activate:\n      on-profile: prod\n",
    );
  });

  it("ignores block scalar content and sequences", () => {
    const text = "description: |\n  logging:\n    file: not-a-key\nitems:\n  - logging.file: x\n";
    expect(renameYamlKey(text, "logging.file", "logging.file.name").changed).toBe(false);
  });

  it("removes a YAML key and its empty parents", () => {
    const text = "acme:\n  legacy:\n    boot2-mode: true\nserver:\n  port: 8080\n";
    expect(removeYamlKey(text, "acme.legacy.boot2-mode").text).toBe("server:\n  port: 8080\n");
  });
});

describe("applyRules on a project", () => {
  it("edits pom and every application*.properties|yml, then is a no-op the second time", () => {
    const dir = tempDir("leapfrog-rules-");
    mkdirSync(path.join(dir, "src", "main", "resources"), { recursive: true });
    writeFileSync(path.join(dir, "pom.xml"), pom);
    writeFileSync(path.join(dir, "src/main/resources/application.properties"), "logging.file=a.log\nacme.legacy.boot2-mode=true\n");
    writeFileSync(path.join(dir, "src/main/resources/application-prod.yml"), "spring:\n  resources:\n    static-locations: classpath:/p/\n");
    const rules = mergeRules([loadModernizerRules("boot4"), loadModernizerRules("acme-samples")]);
    const first = applyRules(dir, rules);
    expect(first.filter((edit) => edit.applied).map((edit) => `${edit.file}:${edit.rule}`)).toEqual([
      "pom.xml:dependencyRename",
      "src/main/resources/application-prod.yml:propertyRename",
      "src/main/resources/application.properties:propertyRename",
      "src/main/resources/application.properties:removeProperty",
    ]);
    expect(readFileSync(path.join(dir, "src/main/resources/application.properties"), "utf8")).toBe("logging.file.name=a.log\n");
    expect(readFileSync(path.join(dir, "src/main/resources/application-prod.yml"), "utf8")).toBe("spring:\n  web.resources.static-locations: classpath:/p/\n");
    expect(applyRules(dir, rules)).toEqual([]);
  });

  it("reports without writing when write is false", () => {
    const dir = tempDir("leapfrog-rules-");
    mkdirSync(path.join(dir, "src", "main", "resources"), { recursive: true });
    writeFileSync(path.join(dir, "src/main/resources/application.properties"), "logging.file=a.log\n");
    const edits = applyRules(dir, loadModernizerRules("boot4"), { write: false });
    expect(edits).toHaveLength(1);
    expect(readFileSync(path.join(dir, "src/main/resources/application.properties"), "utf8")).toBe("logging.file=a.log\n");
  });
});
