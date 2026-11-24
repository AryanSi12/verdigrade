package com.acme.portal.audit;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class InMemoryAuditSinkTest {

    @Test
    void keepsOnlyTheLastEvents() {
        InMemoryAuditSink sink = new InMemoryAuditSink();
        for (int i = 0; i < InMemoryAuditSink.LIMIT + 5; i++) {
            sink.record(new AuditEvent("u", "GET", "/p" + i, 200));
        }
        assertEquals(InMemoryAuditSink.LIMIT, sink.recent().size());
        assertEquals("/p5", sink.recent().get(0).getPath());
    }

    @Test
    void recentIsACopy() {
        InMemoryAuditSink sink = new InMemoryAuditSink();
        sink.record(new AuditEvent("u", "GET", "/a", 200));
        sink.recent().clear();
        assertEquals(1, sink.recent().size());
    }
}
