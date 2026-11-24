package com.acme.portal.web;

import com.acme.portal.audit.AuditSink;
import com.acme.portal.security.SecurityContextBridge;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurerAdapter;

/** Base MVC configuration: audit first, then whatever the subclass registers. */
public abstract class SecuredWebConfigurer extends WebMvcConfigurerAdapter {

    protected final SecurityContextBridge bridge;
    protected final AuditSink auditSink;

    protected SecuredWebConfigurer(SecurityContextBridge bridge, AuditSink auditSink) {
        this.bridge = bridge;
        this.auditSink = auditSink;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        super.addInterceptors(registry);
        registry.addInterceptor(new AuditInterceptor(bridge, auditSink)).addPathPatterns("/api/**");
        registerSecured(registry);
    }

    protected abstract void registerSecured(InterceptorRegistry registry);

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        super.addCorsMappings(registry);
        registry.addMapping("/api/health").allowedOrigins("*").allowedMethods("GET");
    }
}
