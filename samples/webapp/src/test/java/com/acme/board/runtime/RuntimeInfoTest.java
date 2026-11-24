package com.acme.board.runtime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;
import org.springframework.util.ClassUtils;

class RuntimeInfoTest {

    private final RuntimeInfo info = RuntimeInfo.read(getClass().getClassLoader());

    @Test
    void javaVersionIsTheOneThisProcessRunsOn() {
        assertEquals(System.getProperty("java.version"), info.getJava());
    }

    @Test
    void frameworkVersionsAreRead() {
        assertNotNull(info.getSpringBoot());
        assertFalse(info.getSpringBoot().isEmpty());
        assertNotNull(info.getSpringSecurity());
        assertFalse(info.getSpringSecurity().isEmpty());
    }

    @Test
    void namespaceFollowsTheServletApiOnTheClassPath() {
        boolean jakarta = ClassUtils.isPresent("jakarta.servlet.http.HttpServletRequest", getClass().getClassLoader());
        assertEquals(jakarta ? "jakarta" : "javax", info.getNamespace());
    }
}
