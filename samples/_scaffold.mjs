import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Regenerates the sample apps in place (pre-migration state). samples/README.md is maintained by hand.
const root = dirname(fileURLToPath(import.meta.url));

const projects = [
  {
    id: "shipping",
    boot: "2.7.18",
    java: "1.8",
    pkg: "com.acme.shipping",
    title: "Shipping labels",
    entity: "Shipment",
    path: "shipments",
    field: "tracking",
    sample: "ACME-1001",
    props: {
      "server.port": "8081",
      "logging.file": "logs/shipping.log",
      "spring.resources.static-locations": "classpath:/public/",
      "spring.http.encoding.charset": "UTF-8",
      "acme.legacy.boot2-mode": "true",
    },
  },
  {
    id: "loyalty",
    boot: "2.6.15",
    java: "1.8",
    pkg: "com.acme.loyalty",
    title: "Loyalty points",
    entity: "Member",
    path: "members",
    field: "memberId",
    sample: "M-42",
    props: {
      "server.port": "8082",
      "logging.file": "logs/loyalty.log",
      "spring.resources.static-locations": "classpath:/static/",
      "acme.legacy.boot2-mode": "enabled",
    },
  },
  {
    id: "warehouse",
    boot: "2.5.15",
    java: "11",
    pkg: "com.acme.warehouse",
    title: "Warehouse bins",
    entity: "Bin",
    path: "bins",
    field: "sku",
    sample: "BIN-7",
    props: {
      "server.port": "8083",
      "logging.file": "logs/warehouse.log",
      "spring.http.encoding.charset": "UTF-8",
      "acme.legacy.boot2-mode": "1",
    },
  },
  {
    id: "reservations",
    boot: "2.7.18",
    java: "1.8",
    pkg: "com.acme.reservations",
    title: "Room reservations",
    entity: "Reservation",
    path: "reservations",
    field: "guest",
    sample: "Ada",
    props: {
      "server.port": "8084",
      "logging.file": "logs/reservations.log",
      "spring.resources.static-locations": "classpath:/assets/",
      "spring.http.encoding.charset": "UTF-8",
      "acme.legacy.boot2-mode": "true",
    },
  },
  {
    id: "fleet",
    boot: "2.6.15",
    java: "1.8",
    pkg: "com.acme.fleet",
    title: "Fleet vehicles",
    entity: "Vehicle",
    path: "vehicles",
    field: "plate",
    sample: "KA-01-AB-1234",
    props: {
      "server.port": "8085",
      "logging.file": "logs/fleet.log",
      "spring.resources.static-locations": "classpath:/public/",
      "acme.legacy.boot2-mode": "legacy",
    },
  },
];

function pom(p) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>${p.boot}</version>
    <relativePath/>
  </parent>

  <groupId>com.acme</groupId>
  <artifactId>${p.id}</artifactId>
  <version>1.0.0</version>
  <name>${p.id}</name>
  <description>${p.title} — pre-migration sample for Verdigrade</description>

  <properties>
    <java.version>${p.java}</java.version>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
`;
}

function properties(p) {
  return Object.entries(p.props)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")
    .concat("\n");
}

function writeProject(p) {
  const base = join(root, p.id);
  const pkgPath = p.pkg.replace(/\./g, "/");
  const main = join(base, "src/main/java", pkgPath);
  const test = join(base, "src/test/java", pkgPath);
  const resources = join(base, "src/main/resources");
  mkdirSync(main, { recursive: true });
  mkdirSync(test, { recursive: true });
  mkdirSync(resources, { recursive: true });

  const appName = `${p.entity}sApplication`.replace(/ssA/, "sA");
  const appClass =
    p.id === "shipping"
      ? "ShippingApplication"
      : p.id === "loyalty"
        ? "LoyaltyApplication"
        : p.id === "warehouse"
          ? "WarehouseApplication"
          : p.id === "reservations"
            ? "ReservationsApplication"
            : "FleetApplication";
  const serviceClass =
    p.id === "shipping"
      ? "ShippingService"
      : p.id === "loyalty"
        ? "LoyaltyService"
        : p.id === "warehouse"
          ? "WarehouseService"
          : p.id === "reservations"
            ? "ReservationService"
            : "FleetService";
  const controllerClass =
    p.id === "shipping"
      ? "ShippingController"
      : p.id === "loyalty"
        ? "LoyaltyController"
        : p.id === "warehouse"
          ? "WarehouseController"
          : p.id === "reservations"
            ? "ReservationController"
            : "FleetController";
  const requestClass = `${p.entity}Request`;
  const testClass = `${serviceClass}Test`;

  writeFileSync(join(base, "pom.xml"), pom(p));
  writeFileSync(join(resources, "application.properties"), properties(p));
  writeFileSync(join(base, ".leapfrog.json"), `{\n  "$comment": "Per-repository Verdigrade settings. See docs/adoption.md.",\n  "extraRulePacks": ["acme-samples"]\n}\n`);

  writeFileSync(
    join(main, `${appClass}.java`),
    `package ${p.pkg};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ${appClass} {

  public static void main(String[] args) {
    SpringApplication.run(${appClass}.class, args);
  }
}
`,
  );

  writeFileSync(
    join(main, `${requestClass}.java`),
    `package ${p.pkg};

import javax.validation.constraints.NotBlank;

public class ${requestClass} {

  @NotBlank
  private String ${p.field};

  public String get${p.field[0].toUpperCase()}${p.field.slice(1)}() {
    return ${p.field};
  }

  public void set${p.field[0].toUpperCase()}${p.field.slice(1)}(String ${p.field}) {
    this.${p.field} = ${p.field};
  }
}
`,
  );

  writeFileSync(
    join(main, `${serviceClass}.java`),
    `package ${p.pkg};

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.springframework.stereotype.Service;

@Service
public class ${serviceClass} {

  private final List<String> items = new ArrayList<String>();

  public List<String> list() {
    return Collections.unmodifiableList(items);
  }

  public void add(String value) {
    items.add(value);
  }
}
`,
  );

  writeFileSync(
    join(main, `${controllerClass}.java`),
    `package ${p.pkg};

import java.util.List;

import javax.servlet.http.HttpServletRequest;
import javax.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ${controllerClass} {

  private final ${serviceClass} service;

  public ${controllerClass}(${serviceClass} service) {
    this.service = service;
  }

  @GetMapping("/${p.path}")
  public List<String> list(HttpServletRequest request) {
    request.getHeader("X-Trace");
    return service.list();
  }

  @PostMapping("/${p.path}")
  public void add(@Valid @RequestBody ${requestClass} body) {
    service.add(body.get${p.field[0].toUpperCase()}${p.field.slice(1)}());
  }
}
`,
  );

  writeFileSync(
    join(test, `${testClass}.java`),
    `package ${p.pkg};

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class ${testClass} {

  @Test
  void addKeepsTheValue() {
    ${serviceClass} service = new ${serviceClass}();
    service.add("${p.sample}");
    assertEquals("${p.sample}", service.list().get(0));
  }
}
`,
  );

  writeFileSync(
    join(base, "README.md"),
    `# ${p.id}

${p.title} sample for **Verdigrade**.

| Before | Value |
| --- | --- |
| Java | ${p.java} |
| Spring Boot | ${p.boot} |
| Web starter | \`spring-boot-starter-web\` |
| Validation | \`javax.validation\` |
| Servlet | \`javax.servlet\` |
| Legacy props | logging.file, static-locations / encoding, acme.legacy.boot2-mode |

Migrate with the control plane → New migration → pick this folder.
`,
  );

  console.log("wrote", p.id);
}

for (const project of projects) {
  writeProject(project);
}

console.log("done");
