import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./helpers.js";
import { describe, expect, it } from "vitest";
import { classifyJavax, gradleFacts, gradleModules, scanJavax, scanProject } from "../bot/lib/scanner.js";

const samples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples");

function project(files: Record<string, string>): string {
  const dir = tempDir("leapfrog-scan-");
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

describe("classifyJavax", () => {
  it("separates Jakarta EE packages from JDK-owned javax", () => {
    expect(classifyJavax("javax.servlet.http.HttpServletRequest")).toBe("javax.servlet");
    expect(classifyJavax("javax.persistence.Entity")).toBe("javax.persistence");
    expect(classifyJavax("javax.annotation.PostConstruct")).toBe("javax.annotation");
    expect(classifyJavax("javax.transaction.Transactional")).toBe("javax.transaction");
    for (const jdk of ["javax.crypto.Cipher", "javax.sql.DataSource", "javax.naming.Context", "javax.net.ssl.SSLContext", "javax.xml.parsers.DocumentBuilder", "javax.annotation.processing.Processor", "javax.transaction.xa.XAResource", "javax.annotation.Nonnull", "javax.xml.validation.Schema"]) {
      expect(classifyJavax(jdk), jdk).toBeNull();
    }
  });
});

describe("scanJavax", () => {
  it("scans every file (no 80-file sample), XML and services files included", () => {
    const files: Record<string, string> = {};
    for (let index = 0; index < 120; index += 1) {
      files[`src/main/java/p/C${index}.java`] = index % 2 ? "import javax.servlet.Filter;" : "import javax.crypto.Cipher;";
    }
    files["src/main/resources/META-INF/persistence.xml"] = '<persistence xmlns="http://xmlns.jcp.org/xml/ns/persistence"><provider>x</provider><properties><property name="javax.persistence.jdbc.url" value="x"/></properties></persistence>';
    files["src/main/resources/META-INF/services/javax.servlet.ServletContainerInitializer"] = "com.acme.Init\n";
    files["src/main/java/p/Jakarta.java"] = "import jakarta.validation.Valid;";
    const result = scanJavax(project(files));
    expect(result.javaxFiles).toHaveLength(62);
    expect(result.jdkJavaxFiles).toHaveLength(60);
    expect(result.jakartaFiles).toEqual(["src/main/java/p/Jakarta.java"]);
    expect(result.javaxPackageCounts["javax.servlet"]).toBe(61);
    expect(result.javaxPackageCounts["javax.persistence"]).toBe(1);
  });
});

describe("scanProject", () => {
  it("reads the shipping sample", () => {
    const scan = scanProject(path.join(samples, "shipping"));
    expect(scan.buildTool).toBe("maven");
    expect(scan.javaVersion).toBe("1.8");
    expect(scan.springBootVersion).toBe("2.7.18");
    expect(scan.classicSpring).toBe(false);
    expect(scan.javaxFiles.length).toBeGreaterThan(0);
  });

  it("walks Maven modules, local parents and ${property} indirection", () => {
    const dir = project({
      "pom.xml": `<project><artifactId>root</artifactId>
        <parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>2.7.18</version><relativePath/></parent>
        <properties><java.version>11</java.version><maven.compiler.release>\${java.version}</maven.compiler.release></properties>
        <modules><module>api</module><module>core</module></modules></project>`,
      "api/pom.xml": `<project><parent><artifactId>root</artifactId></parent><artifactId>api</artifactId></project>`,
      "core/pom.xml": `<project><parent><artifactId>root</artifactId></parent><artifactId>core</artifactId>
        <!-- <properties><java.version>21</java.version></properties> -->
        <build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId><configuration><release>8</release></configuration></plugin></plugins></build></project>`,
      "api/src/main/webapp/WEB-INF/web.xml": "<web-app/>",
    });
    const scan = scanProject(dir);
    expect(scan.modules.map((item) => item.path)).toEqual(["", "api", "core"]);
    expect(scan.modules[0].javaVersion).toBe("11");
    expect(scan.modules[1].springBootVersion).toBe("2.7.18");
    expect(scan.modules[2].javaVersion).toBe("8");
    expect(scan.javaVersion).toBe("8");
    expect(scan.webXmlFiles).toEqual(["api/src/main/webapp/WEB-INF/web.xml"]);
  });

  it("detects Gradle Boot plugin, version catalog and subprojects", () => {
    const dir = project({
      "settings.gradle.kts": 'rootProject.name = "x"\ninclude(":app", ":lib:util")\n',
      "build.gradle.kts": 'plugins { alias(libs.plugins.spring.boot) }\njava { toolchain { languageVersion = JavaLanguageVersion.of(17) } }\n',
      "gradle/libs.versions.toml": '[versions]\nspring-boot = "3.2.5"\n',
      "app/build.gradle.kts": "plugins { java }\n",
      "lib/util/build.gradle": "sourceCompatibility = JavaVersion.VERSION_11\n",
    });
    expect(gradleModules(dir)).toEqual(["", "app", "lib/util"]);
    const scan = scanProject(dir);
    expect(scan.buildTool).toBe("gradle");
    expect(scan.springBootVersion).toBe("3.2.5");
    expect(scan.classicSpring).toBe(false);
    expect(scan.versionCatalog).toBe("gradle/libs.versions.toml");
    expect(scan.javaVersion).toBe("11");
  });

  it("parses Groovy Gradle plugin syntax", () => {
    expect(gradleFacts("plugins {\n id 'org.springframework.boot' version '2.6.3'\n}\nsourceCompatibility = '1.8'", "", "")).toEqual({
      java: "1.8",
      boot: "2.6.3",
      spring: null,
    });
  });
});
