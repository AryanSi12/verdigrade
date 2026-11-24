package com.acme.warehouse.web;

import java.io.IOException;
import java.util.UUID;
import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** Adds an X-Request-Id header to every response (reuses the caller's id when one is sent). */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter implements Filter {

  public static final String HEADER = "X-Request-Id";

  @Override
  public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
    String id = ((HttpServletRequest) request).getHeader(HEADER);
    if (id == null || id.trim().isEmpty()) {
      id = UUID.randomUUID().toString();
    }
    ((HttpServletResponse) response).setHeader(HEADER, id);
    chain.doFilter(request, response);
  }
}
