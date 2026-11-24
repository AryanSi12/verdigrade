package com.acme.portal.web;

import com.acme.portal.audit.AuditEvent;
import com.acme.portal.audit.AuditSink;
import com.acme.portal.security.PortalPrincipal;
import com.acme.portal.security.SecurityContextBridge;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.springframework.web.method.HandlerMethod;

/** Records who called what and how it ended, including requests the role check turned away. */
public class AuditInterceptor extends AbstractSecuredInterceptor {

    private final AuditSink sink;

    public AuditInterceptor(SecurityContextBridge bridge, AuditSink sink) {
        super(bridge);
        this.sink = sink;
    }

    @Override
    protected boolean authorize(HttpServletRequest request, HttpServletResponse response, HandlerMethod handler) {
        return true;
    }

    @Override
    protected void onComplete(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        PortalPrincipal who = bridge.current(request).orElse(null);
        sink.record(new AuditEvent(who == null ? "anonymous" : who.getUsername(), request.getMethod(), request.getRequestURI(), response.getStatus()));
    }
}
