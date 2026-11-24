package com.acme.orders.runtime;

import org.springframework.boot.SpringBootVersion;
import org.springframework.util.ClassUtils;

/** What this process is really running on, read at runtime, so Before and After cannot be faked. */
public class RuntimeInfo {

    private final String java;
    private final String springBoot;
    private final String namespace;

    public RuntimeInfo(String java, String springBoot, String namespace) {
        this.java = java;
        this.springBoot = springBoot;
        this.namespace = namespace;
    }

    public static RuntimeInfo read(ClassLoader loader) {
        boolean jakarta = ClassUtils.isPresent("jakarta.servlet.http.HttpServletRequest", loader);
        return new RuntimeInfo(System.getProperty("java.version"), SpringBootVersion.getVersion(), jakarta ? "jakarta" : "javax");
    }

    public String getJava() {
        return java;
    }

    public String getSpringBoot() {
        return springBoot;
    }

    public String getNamespace() {
        return namespace;
    }
}
