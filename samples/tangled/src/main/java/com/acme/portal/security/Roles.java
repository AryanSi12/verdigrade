package com.acme.portal.security;

/** Role names without the Spring "ROLE_" prefix. The whole portal speaks in these. */
public final class Roles {

    public static final String CLAIMANT = "CLAIMANT";
    public static final String ADJUSTER = "ADJUSTER";
    public static final String ADMIN = "ADMIN";

    private Roles() {
    }

    public static String authority(String role) {
        return "ROLE_" + role;
    }

    public static String strip(String authority) {
        return authority != null && authority.startsWith("ROLE_") ? authority.substring(5) : authority;
    }
}
