package com.acme.portal.security;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class SessionSecurityContextBridge implements SecurityContextBridge {

    public static final String LOGIN_AT = "portal.login.at";

    @Override
    public void establish(HttpServletRequest request, Authentication authentication) {
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        // The filter chain stores the context in this session when the request ends.
        HttpSession session = request.getSession(true);
        session.setAttribute(LOGIN_AT, Instant.now().toString());
    }

    @Override
    public Optional<PortalPrincipal> current(HttpServletRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof PortalPrincipal) {
            return Optional.of((PortalPrincipal) authentication.getPrincipal());
        }
        return Optional.empty();
    }

    @Override
    public Set<String> roles(HttpServletRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            return Collections.emptySet();
        }
        Set<String> roles = new LinkedHashSet<String>();
        for (GrantedAuthority authority : authentication.getAuthorities()) {
            roles.add(Roles.strip(authority.getAuthority()));
        }
        return roles;
    }

    @Override
    public void clear(HttpServletRequest request) {
        SecurityContextHolder.clearContext();
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
    }
}
