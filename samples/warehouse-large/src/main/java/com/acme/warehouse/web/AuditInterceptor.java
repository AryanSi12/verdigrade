package com.acme.warehouse.web;

import java.util.concurrent.atomic.AtomicLong;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class AuditInterceptor implements HandlerInterceptor {

  private static final Logger LOG = LoggerFactory.getLogger(AuditInterceptor.class);

  private final AtomicLong seen = new AtomicLong();

  @Override
  public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
    long n = seen.incrementAndGet();
    LOG.debug("api call #{} {} {}", n, request.getMethod(), request.getRequestURI());
    return true;
  }

  public long count() {
    return seen.get();
  }
}
