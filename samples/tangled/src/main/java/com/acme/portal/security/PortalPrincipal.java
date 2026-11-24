package com.acme.portal.security;

import java.io.Serializable;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

public class PortalPrincipal implements Serializable {

    private static final long serialVersionUID = 1L;

    private final String username;
    private final String displayName;
    private final Set<String> roles;

    public PortalPrincipal(String username, String displayName, Set<String> roles) {
        this.username = username;
        this.displayName = displayName;
        this.roles = Collections.unmodifiableSet(new LinkedHashSet<String>(roles));
    }

    public String getUsername() {
        return username;
    }

    public String getDisplayName() {
        return displayName;
    }

    public Set<String> getRoles() {
        return roles;
    }

    public boolean hasRole(String role) {
        return roles.contains(role);
    }

    public boolean isStaff() {
        return roles.contains(Roles.ADJUSTER) || roles.contains(Roles.ADMIN);
    }

    @Override
    public String toString() {
        return username;
    }
}
