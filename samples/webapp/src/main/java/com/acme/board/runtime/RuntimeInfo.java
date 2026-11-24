package com.acme.board.runtime;

import org.springframework.boot.SpringBootVersion;
import org.springframework.security.core.SpringSecurityCoreVersion;
import org.springframework.util.ClassUtils;

/**
 * What this process is really running on, read at runtime (never written down): the page shows it so a
 * before/after comparison cannot be faked. The namespace is whichever servlet API is on the class path.
 */
public class RuntimeInfo {

    private final String java;
    private final String springBoot;
    private final String springSecurity;
    private final String namespace;

    public RuntimeInfo(String java, String springBoot, String springSecurity, String namespace) {
        this.java = java;
        this.springBoot = springBoot;
        this.springSecurity = springSecurity;
        this.namespace = namespace;
    }

    public static RuntimeInfo read(ClassLoader loader) {
        boolean jakarta = ClassUtils.isPresent("jakarta.servlet.http.HttpServletRequest", loader);
        return new RuntimeInfo(
            System.getProperty("java.version"),
            SpringBootVersion.getVersion(),
            SpringSecurityCoreVersion.getVersion(),
            jakarta ? "jakarta" : "javax");
    }

    public String getJava() {
        return java;
    }

    public String getSpringBoot() {
        return springBoot;
    }

    public String getSpringSecurity() {
        return springSecurity;
    }

    public String getNamespace() {
        return namespace;
    }
}
