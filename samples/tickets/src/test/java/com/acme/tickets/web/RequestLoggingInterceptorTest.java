package com.acme.tickets.web;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RequestLoggingInterceptorTest {

  @Test
  void preHandleLetsTheRequestContinue() {
    RequestLoggingInterceptor interceptor = new RequestLoggingInterceptor();
    assertTrue(interceptor.preHandle(new MockHttpServletRequest("GET", "/api/events"), new MockHttpServletResponse(), new Object()));
  }
}
