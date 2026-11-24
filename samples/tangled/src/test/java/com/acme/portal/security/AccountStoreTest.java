package com.acme.portal.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class AccountStoreTest {

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private final AccountStore store = new AccountStore(encoder);

    @Test
    void knowsTheDemoUsers() {
        assertEquals(4, store.usernames().size());
        assertNotNull(store.find("alex"));
        assertNull(store.find("nobody"));
        assertNull(store.find(null));
    }

    @Test
    void passwordsAreHashed() {
        assertTrue(encoder.matches(AccountStore.DEMO_PASSWORD, store.find("casey").getPasswordHash()));
    }

    @Test
    void providerReturnsAPortalPrincipalWithRoleAuthorities() {
        PortalAuthenticationProvider provider = new PortalAuthenticationProvider(store, encoder);
        Authentication result = provider.authenticate(new UsernamePasswordAuthenticationToken("alex", AccountStore.DEMO_PASSWORD));
        assertTrue(result.getPrincipal() instanceof PortalPrincipal);
        assertEquals("ROLE_ADJUSTER", result.getAuthorities().iterator().next().getAuthority());
    }

    @Test
    void providerRejectsBadPasswords() {
        PortalAuthenticationProvider provider = new PortalAuthenticationProvider(store, encoder);
        assertThrows(BadCredentialsException.class, () -> provider.authenticate(new UsernamePasswordAuthenticationToken("alex", "wrong")));
    }

    @Test
    void providerSupportsOnlyUsernamePasswordTokens() {
        PortalAuthenticationProvider provider = new PortalAuthenticationProvider(store, encoder);
        assertTrue(provider.supports(UsernamePasswordAuthenticationToken.class));
    }
}
