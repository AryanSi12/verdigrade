package com.acme.portal.audit;

import java.util.List;

public interface AuditSink {

    void record(AuditEvent event);

    List<AuditEvent> recent();
}
