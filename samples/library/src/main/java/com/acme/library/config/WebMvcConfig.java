package com.acme.library.config;

import com.acme.library.web.AuditInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurerAdapter;

/** WebMvcConfigurerAdapter was deprecated in Spring 5 and removed in Spring 6. */
@Configuration
public class WebMvcConfig extends WebMvcConfigurerAdapter {

  private final AuditInterceptor auditInterceptor;

  public WebMvcConfig(AuditInterceptor auditInterceptor) {
    this.auditInterceptor = auditInterceptor;
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry.addInterceptor(auditInterceptor).addPathPatterns("/api/**");
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry.addMapping("/api/**").allowedOrigins("http://localhost:3000").allowedMethods("GET", "POST", "PUT", "DELETE");
  }
}
