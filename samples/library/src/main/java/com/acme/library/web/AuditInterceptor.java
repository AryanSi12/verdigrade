package com.acme.library.web;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.handler.HandlerInterceptorAdapter;

/** HandlerInterceptorAdapter was removed in Spring Framework 6. */
@Component
public class AuditInterceptor extends HandlerInterceptorAdapter {

  private final AuditLogger auditLogger;

  public AuditInterceptor(AuditLogger auditLogger) {
    this.auditLogger = auditLogger;
  }

  @Override
  public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
    if (!"GET".equals(request.getMethod())) {
      String actor = request.getUserPrincipal() == null ? "anonymous" : request.getUserPrincipal().getName();
      auditLogger.record(actor, request.getMethod(), request.getRequestURI() + " -> " + response.getStatus());
    }
  }
}
