package com.acme.payments.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import javax.servlet.ServletException;
import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestIdFilterTest {

  private final RequestIdFilter filter = new RequestIdFilter();

  @Test
  void generatesAnIdWhenNoneIsSent() throws IOException, ServletException {
    MockHttpServletResponse response = new MockHttpServletResponse();
    filter.doFilter(new MockHttpServletRequest("GET", "/api/x"), response, new MockFilterChain());
    assertNotNull(response.getHeader(RequestIdFilter.HEADER));
  }

  @Test
  void keepsTheCallersId() throws IOException, ServletException {
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/x");
    request.addHeader(RequestIdFilter.HEADER, "abc-123");
    MockHttpServletResponse response = new MockHttpServletResponse();
    filter.doFilter(request, response, new MockFilterChain());
    assertEquals("abc-123", response.getHeader(RequestIdFilter.HEADER));
  }
}
