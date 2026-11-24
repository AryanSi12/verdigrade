package com.acme.portal.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Collections;
import org.junit.jupiter.api.Test;

class RolesTest {

    @Test
    void authorityAddsThePrefix() {
        assertEquals("ROLE_ADMIN", Roles.authority(Roles.ADMIN));
    }

    @Test
    void stripRemovesThePrefixOnlyOnce() {
        assertEquals("ADMIN", Roles.strip("ROLE_ADMIN"));
        assertEquals("OTHER", Roles.strip("OTHER"));
        assertNull(Roles.strip(null));
    }

    @Test
    void principalRolesAreReadOnly() {
        PortalPrincipal principal = new PortalPrincipal("u", "U", Collections.singleton("CLAIMANT"));
        assertTrue(principal.hasRole("CLAIMANT"));
        try {
            principal.getRoles().add("ADMIN");
        } catch (UnsupportedOperationException expected) {
            return;
        }
        throw new AssertionError("roles must not be modifiable");
    }
}
