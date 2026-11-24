package com.acme.portal.claims;

public class ClaimNotFoundException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ClaimNotFoundException(long id) {
        super("No claim " + id);
    }
}
