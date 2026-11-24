package com.acme.board.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestStatsInterceptorTest {

    @Test
    void countsEveryCallAndSetsTheHeaders() {
        RequestStatsInterceptor interceptor = new RequestStatsInterceptor();
        MockHttpServletResponse first = new MockHttpServletResponse();
        MockHttpServletResponse second = new MockHttpServletResponse();
        assertTrue(interceptor.preHandle(new MockHttpServletRequest(), first, new Object()));
        assertTrue(interceptor.preHandle(new MockHttpServletRequest(), second, new Object()));
        assertEquals("1", first.getHeader(RequestStatsInterceptor.COUNT_HEADER));
        assertEquals("2", second.getHeader(RequestStatsInterceptor.COUNT_HEADER));
        assertEquals(2, interceptor.count());
    }

}
