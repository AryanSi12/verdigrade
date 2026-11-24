package com.acme.desk.config;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.springframework.web.servlet.HandlerInterceptor;

public class LegacyHeaderInterceptor implements HandlerInterceptor {

  public static final String HEADER = "X-Legacy-Desk";

  private final String desk;

  public LegacyHeaderInterceptor(String desk) {
    this.desk = desk;
  }

  @Override
  public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
    response.setHeader(HEADER, desk);
    return true;
  }
}
