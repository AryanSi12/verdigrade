package com.acme.desk.config;

import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurerAdapter;

/**
 * In-house web base class every desk configuration extends: CORS for the old admin UI and the legacy header.
 * Subclasses call {@link #desk()} so they all see the same settings.
 */
public abstract class LegacyWebSupport extends WebMvcConfigurerAdapter {

  protected static final String UI_ORIGIN = "http://localhost:3000";

  protected String desk() {
    return "support-desk";
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry.addMapping("/api/**").allowedOrigins(UI_ORIGIN).allowedMethods("GET", "POST");
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry.addInterceptor(new LegacyHeaderInterceptor(desk())).addPathPatterns("/api/**");
  }
}
