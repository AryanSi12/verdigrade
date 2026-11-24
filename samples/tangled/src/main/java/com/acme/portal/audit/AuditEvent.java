package com.acme.portal.audit;

import java.time.Instant;

public class AuditEvent {

    private final String actor;
    private final String method;
    private final String path;
    private final int status;
    private final Instant at;

    public AuditEvent(String actor, String method, String path, int status) {
        this.actor = actor;
        this.method = method;
        this.path = path;
        this.status = status;
        this.at = Instant.now();
    }

    public String getActor() {
        return actor;
    }

    public String getMethod() {
        return method;
    }

    public String getPath() {
        return path;
    }

    public int getStatus() {
        return status;
    }

    public Instant getAt() {
        return at;
    }
}
