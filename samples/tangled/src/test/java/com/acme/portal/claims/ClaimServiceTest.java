package com.acme.portal.claims;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.acme.portal.security.PortalPrincipal;
import java.util.Arrays;
import java.util.Collections;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ClaimServiceTest {

    private ClaimService service;
    private final PortalPrincipal casey = new PortalPrincipal("casey", "Casey", Collections.singleton("CLAIMANT"));
    private final PortalPrincipal jordan = new PortalPrincipal("jordan", "Jordan", Collections.singleton("CLAIMANT"));
    private final PortalPrincipal alex = new PortalPrincipal("alex", "Alex", Collections.singleton("ADJUSTER"));

    @BeforeEach
    void setUp() {
        service = new ClaimService(new ClaimRepository());
    }

    private static ClaimRequest request(String description, long cents) {
        ClaimRequest request = new ClaimRequest();
        request.setDescription(description);
        request.setAmountCents(cents);
        return request;
    }

    @Test
    void submitAssignsIdsInOrder() {
        assertEquals(1, service.submit(casey, request("a", 1)).getId());
        assertEquals(2, service.submit(casey, request("b", 1)).getId());
    }

    @Test
    void visibleToFiltersForClaimants() {
        service.submit(casey, request("a", 1));
        service.submit(jordan, request("b", 1));
        assertEquals(1, service.visibleTo(casey).size());
        assertEquals(2, service.visibleTo(alex).size());
    }

    @Test
    void getHidesForeignClaims() {
        Claim claim = service.submit(jordan, request("b", 1));
        assertThrows(ClaimNotFoundException.class, () -> service.get(casey, claim.getId()));
        assertEquals("jordan", service.get(alex, claim.getId()).getOwner());
    }

    @Test
    void approveRecordsTheDecider() {
        Claim claim = service.submit(casey, request("a", 1));
        service.approve(claim.getId(), alex);
        assertEquals(ClaimStatus.APPROVED, claim.getStatus());
        assertEquals("alex", claim.getDecidedBy());
    }

    @Test
    void secondDecisionFails() {
        Claim claim = service.submit(casey, request("a", 1));
        service.reject(claim.getId(), alex);
        assertThrows(IllegalStateException.class, () -> service.approve(claim.getId(), alex));
    }

    @Test
    void unknownClaimFails() {
        assertThrows(ClaimNotFoundException.class, () -> service.approve(42, alex));
    }

    @Test
    void staffFlagFollowsRoles() {
        assertTrue(alex.isStaff());
        assertTrue(new PortalPrincipal("r", "R", new java.util.HashSet<String>(Arrays.asList("ADMIN"))).isStaff());
    }
}
