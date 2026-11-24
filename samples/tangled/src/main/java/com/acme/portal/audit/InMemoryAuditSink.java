package com.acme.portal.audit;

import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;
import org.springframework.stereotype.Component;

/** Keeps the last 200 events. */
@Component
public class InMemoryAuditSink implements AuditSink {

    static final int LIMIT = 200;

    private final LinkedList<AuditEvent> events = new LinkedList<AuditEvent>();

    @Override
    public synchronized void record(AuditEvent event) {
        events.addLast(event);
        while (events.size() > LIMIT) {
            events.removeFirst();
        }
    }

    @Override
    public synchronized List<AuditEvent> recent() {
        return new ArrayList<AuditEvent>(events);
    }
}
