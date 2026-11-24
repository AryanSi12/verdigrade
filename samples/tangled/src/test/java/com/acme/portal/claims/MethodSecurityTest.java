package com.acme.portal.claims;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.acme.portal.admin.AdminService;
import com.acme.portal.security.PortalPrincipal;
import java.util.Collections;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.test.context.support.WithMockUser;

@SpringBootTest
class MethodSecurityTest {

    @Autowired
    private ClaimService claims;

    @Autowired
    private AdminService admin;

    private final PortalPrincipal owner = new PortalPrincipal("casey", "Casey", Collections.singleton("CLAIMANT"));

    @Test
    @WithMockUser(roles = "ADMIN")
    void adminMayPurge() {
        assertTrue(admin.purgeClaims() >= 0);
    }

    @Test
    @WithMockUser(roles = "ADJUSTER")
    void adjusterMayNotPurge() {
        assertThrows(AccessDeniedException.class, () -> admin.purgeClaims());
    }

    @Test
    @WithMockUser(roles = "CLAIMANT")
    void claimantMayNotApprove() {
        Claim claim = claims.submit(owner, request("Own claim", 500));
        assertThrows(AccessDeniedException.class, () -> claims.approve(claim.getId(), owner));
    }

    @Test
    @WithMockUser(roles = "ADJUSTER")
    void adjusterMayApprove() {
        Claim claim = claims.submit(owner, request("Approve me", 500));
        assertEquals(ClaimStatus.APPROVED, claims.approve(claim.getId(), owner).getStatus());
    }

    @Test
    void anonymousMayNotReject() {
        Claim claim = claims.submit(owner, request("Nobody", 500));
        assertThrows(org.springframework.security.core.AuthenticationException.class, () -> claims.reject(claim.getId(), owner));
    }

    private static ClaimRequest request(String description, long cents) {
        ClaimRequest request = new ClaimRequest();
        request.setDescription(description);
        request.setAmountCents(cents);
        return request;
    }
}
