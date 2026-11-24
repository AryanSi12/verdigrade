package com.acme.portal.security;

import java.util.Optional;
import java.util.Set;
import javax.servlet.http.HttpServletRequest;
import org.springframework.security.core.Authentication;

/**
 * The portal's single door to "who is logged in". Controllers, interceptors and the audit trail all go through it,
 * so nothing else touches the SecurityContextHolder or the HTTP session directly.
 */
public interface SecurityContextBridge {

    /** Make this authentication the current user and keep it for the following requests of the session. */
    void establish(HttpServletRequest request, Authentication authentication);

    Optional<PortalPrincipal> current(HttpServletRequest request);

    Set<String> roles(HttpServletRequest request);

    void clear(HttpServletRequest request);
}
