package com.acme.library.security;

import java.io.IOException;
import java.util.UUID;
import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** Plain javax.servlet.Filter: the package becomes jakarta.servlet in Boot 3+. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter implements Filter {

  public static final String HEADER = "X-Request-Id";

  @Override
  public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
    String id = UUID.randomUUID().toString();
    MDC.put("requestId", id);
    try {
      if (response instanceof HttpServletResponse) {
        ((HttpServletResponse) response).setHeader(HEADER, id);
      }
      chain.doFilter(request, response);
    } finally {
      MDC.remove("requestId");
    }
  }
}
