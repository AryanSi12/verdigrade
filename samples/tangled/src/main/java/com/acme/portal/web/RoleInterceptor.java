package com.acme.portal.web;

import com.acme.portal.security.RequiresRole;
import com.acme.portal.security.Roles;
import com.acme.portal.security.SecurityContextBridge;
import java.util.Set;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.AnnotationUtils;
import org.springframework.web.method.HandlerMethod;

/** Enforces @RequiresRole on controller methods (ADMIN passes everything). */
public class RoleInterceptor extends AbstractSecuredInterceptor {

    public RoleInterceptor(SecurityContextBridge bridge) {
        super(bridge);
    }

    @Override
    protected boolean authorize(HttpServletRequest request, HttpServletResponse response, HandlerMethod handler) throws Exception {
        RequiresRole required = handler.getMethodAnnotation(RequiresRole.class);
        if (required == null) {
            required = AnnotationUtils.findAnnotation(handler.getBeanType(), RequiresRole.class);
        }
        if (required == null) {
            return true;
        }
        Set<String> roles = bridge.roles(request);
        if (roles.contains(required.value()) || roles.contains(Roles.ADMIN)) {
            return true;
        }
        ErrorBodies.write(response, HttpServletResponse.SC_FORBIDDEN, "forbidden", "requires " + required.value());
        return false;
    }
}
