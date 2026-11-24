package com.acme.portal.web;

import com.acme.portal.audit.AuditSink;
import com.acme.portal.security.SecurityContextBridge;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;

@Configuration
public class PortalWebConfig extends SecuredWebConfigurer {

    public PortalWebConfig(SecurityContextBridge bridge, AuditSink auditSink) {
        super(bridge, auditSink);
    }

    @Override
    protected void registerSecured(InterceptorRegistry registry) {
        registry.addInterceptor(new RoleInterceptor(bridge)).addPathPatterns("/api/**").excludePathPatterns("/api/health");
    }
}
