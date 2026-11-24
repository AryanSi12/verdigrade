package com.acme.board.web;

import java.util.concurrent.atomic.AtomicLong;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.handler.HandlerInterceptorAdapter;

/** Counts API calls and tells the caller, in two headers the page shows in its footer. */
@Component
public class RequestStatsInterceptor extends HandlerInterceptorAdapter {

    public static final String COUNT_HEADER = "X-Request-Count";
    public static final String UPTIME_HEADER = "X-Uptime-Seconds";

    private final AtomicLong count = new AtomicLong();
    private final long startedAt = System.currentTimeMillis();

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        response.setHeader(COUNT_HEADER, String.valueOf(count.incrementAndGet()));
        response.setHeader(UPTIME_HEADER, String.valueOf((System.currentTimeMillis() - startedAt) / 1000));
        return true;
    }

    public long count() {
        return count.get();
    }
}
