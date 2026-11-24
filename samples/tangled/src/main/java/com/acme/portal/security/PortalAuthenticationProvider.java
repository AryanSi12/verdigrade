package com.acme.portal.security;

import java.util.ArrayList;
import java.util.List;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Checks the password and returns a token whose principal is a PortalPrincipal (the rest of the portal relies on that). */
@Component
public class PortalAuthenticationProvider implements AuthenticationProvider {

    private final AccountStore accounts;
    private final PasswordEncoder encoder;

    public PortalAuthenticationProvider(AccountStore accounts, PasswordEncoder encoder) {
        this.accounts = accounts;
        this.encoder = encoder;
    }

    @Override
    public Authentication authenticate(Authentication authentication) throws AuthenticationException {
        String username = String.valueOf(authentication.getPrincipal());
        String password = authentication.getCredentials() == null ? "" : authentication.getCredentials().toString();
        Account account = accounts.find(username);
        if (account == null || !encoder.matches(password, account.getPasswordHash())) {
            throw new BadCredentialsException("Bad credentials");
        }
        PortalPrincipal principal = account.toPrincipal();
        List<GrantedAuthority> authorities = new ArrayList<GrantedAuthority>();
        for (String role : principal.getRoles()) {
            authorities.add(new SimpleGrantedAuthority(Roles.authority(role)));
        }
        return new UsernamePasswordAuthenticationToken(principal, null, authorities);
    }

    @Override
    public boolean supports(Class<?> authentication) {
        return UsernamePasswordAuthenticationToken.class.isAssignableFrom(authentication);
    }
}
