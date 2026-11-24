package com.acme.portal.claims;

import com.acme.portal.security.PortalPrincipal;
import java.util.ArrayList;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

@Service
public class ClaimService {

    private final ClaimRepository repository;

    public ClaimService(ClaimRepository repository) {
        this.repository = repository;
    }

    public Claim submit(PortalPrincipal who, ClaimRequest request) {
        return repository.create(who.getUsername(), request.getDescription(), request.getAmountCents());
    }

    /** Staff see every claim, claimants only their own. */
    public List<Claim> visibleTo(PortalPrincipal who) {
        List<Claim> visible = new ArrayList<Claim>();
        for (Claim claim : repository.all()) {
            if (who.isStaff() || claim.getOwner().equals(who.getUsername())) {
                visible.add(claim);
            }
        }
        return visible;
    }

    /** A claimant asking for somebody else's claim gets the same answer as for one that does not exist. */
    public Claim get(PortalPrincipal who, long id) {
        Claim claim = repository.find(id);
        if (claim == null || !(who.isStaff() || claim.getOwner().equals(who.getUsername()))) {
            throw new ClaimNotFoundException(id);
        }
        return claim;
    }

    @PreAuthorize("hasAnyRole('ADJUSTER','ADMIN')")
    public Claim approve(long id, PortalPrincipal who) {
        return decide(id, ClaimStatus.APPROVED, who);
    }

    @PreAuthorize("hasAnyRole('ADJUSTER','ADMIN')")
    public Claim reject(long id, PortalPrincipal who) {
        return decide(id, ClaimStatus.REJECTED, who);
    }

    private Claim decide(long id, ClaimStatus outcome, PortalPrincipal who) {
        Claim claim = repository.find(id);
        if (claim == null) {
            throw new ClaimNotFoundException(id);
        }
        claim.decide(outcome, who.getUsername());
        return claim;
    }
}
