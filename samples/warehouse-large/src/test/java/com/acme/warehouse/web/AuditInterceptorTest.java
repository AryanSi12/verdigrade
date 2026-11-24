package com.acme.warehouse.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class AuditInterceptorTest {

  @Test
  void countsEveryCallAndLetsItThrough() {
    AuditInterceptor interceptor = new AuditInterceptor();
    assertTrue(interceptor.preHandle(new MockHttpServletRequest("GET", "/api/products"), new MockHttpServletResponse(), new Object()));
    assertTrue(interceptor.preHandle(new MockHttpServletRequest("POST", "/api/products"), new MockHttpServletResponse(), new Object()));
    assertEquals(2, interceptor.count());
  }
}
