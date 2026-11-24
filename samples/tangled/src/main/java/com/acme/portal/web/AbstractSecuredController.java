package com.acme.portal.web;

import com.acme.portal.security.PortalPrincipal;
import com.acme.portal.security.SecurityContextBridge;
import javax.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;

/** Base of every portal controller: who is calling, and how a user signs in (signing out is handled by the security configuration). */
public abstract class AbstractSecuredController {

    @Autowired
    protected SecurityContextBridge bridge;

    @Autowired
    protected AuthenticationManager authenticationManager;

    protected PortalPrincipal currentUser(HttpServletRequest request) {
        return bridge.current(request).orElseThrow(() -> new AccessDeniedException("Not logged in"));
    }

    protected PortalPrincipal signIn(HttpServletRequest request, String username, String password) {
        Authentication authentication = authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(username, password));
        bridge.establish(request, authentication);
        return (PortalPrincipal) authentication.getPrincipal();
    }
}
