package com.acme.portal.web;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class ErrorBodiesTest {

    @Test
    void jsonWithDetail() {
        assertEquals("{\"error\":\"forbidden\",\"detail\":\"requires ADJUSTER\"}", ErrorBodies.json("forbidden", "requires ADJUSTER"));
    }

    @Test
    void jsonWithoutDetail() {
        assertEquals("{\"error\":\"x\"}", ErrorBodies.json("x", null));
    }

    @Test
    void quotesAndNewlinesAreEscaped() {
        assertEquals("a\\\"b\\nc", ErrorBodies.escape("a\"b\nc"));
    }

    @Test
    void bodyKeepsOrder() {
        assertEquals("[error, detail]", ErrorBodies.body("e", "d").keySet().toString());
    }
}
