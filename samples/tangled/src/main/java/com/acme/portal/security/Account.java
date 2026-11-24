package com.acme.portal.security;

import java.util.Set;

public class Account {

    private final String username;
    private final String passwordHash;
    private final String displayName;
    private final Set<String> roles;

    public Account(String username, String passwordHash, String displayName, Set<String> roles) {
        this.username = username;
        this.passwordHash = passwordHash;
        this.displayName = displayName;
        this.roles = roles;
    }

    public String getUsername() {
        return username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getDisplayName() {
        return displayName;
    }

    public Set<String> getRoles() {
        return roles;
    }

    public PortalPrincipal toPrincipal() {
        return new PortalPrincipal(username, displayName, roles);
    }
}
