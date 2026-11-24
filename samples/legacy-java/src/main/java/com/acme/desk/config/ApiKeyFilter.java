package com.acme.desk.config;

import java.io.IOException;
import java.util.Collections;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** In-house auth: a request carrying the shared X-Api-Key header is treated as the "desk-agent" user. */
public class ApiKeyFilter extends OncePerRequestFilter {

  public static final String HEADER = "X-Api-Key";

  private final String apiKey;

  public ApiKeyFilter(String apiKey) {
    this.apiKey = apiKey;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
    String sent = request.getHeader(HEADER);
    if (sent != null && sent.equals(apiKey)) {
      SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
          "desk-agent", null, Collections.singletonList(new SimpleGrantedAuthority("ROLE_AGENT"))));
    }
    chain.doFilter(request, response);
  }
}
