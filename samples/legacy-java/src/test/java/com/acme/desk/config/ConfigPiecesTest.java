package com.acme.desk.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

class ConfigPiecesTest {

  @AfterEach
  void clear() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void theRightKeyAuthenticatesTheAgent() throws Exception {
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tickets");
    request.addHeader("X-Api-Key", "k1");
    new ApiKeyFilter("k1").doFilter(request, new MockHttpServletResponse(), new MockFilterChain());
    assertNotNull(SecurityContextHolder.getContext().getAuthentication());
    assertEquals("desk-agent", SecurityContextHolder.getContext().getAuthentication().getName());
  }

  @Test
  void aWrongKeyLeavesTheRequestAnonymous() throws Exception {
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tickets");
    request.addHeader("X-Api-Key", "other");
    new ApiKeyFilter("k1").doFilter(request, new MockHttpServletResponse(), new MockFilterChain());
    assertNull(SecurityContextHolder.getContext().getAuthentication());
  }

  @Test
  void theLegacyHeaderIsStamped() {
    MockHttpServletResponse response = new MockHttpServletResponse();
    assertTrue(new LegacyHeaderInterceptor("d1").preHandle(new MockHttpServletRequest(), response, new Object()));
    assertEquals("d1", response.getHeader("X-Legacy-Desk"));
  }
}
