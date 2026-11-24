package com.acme.portal.claims;

public class Claim {

    private final long id;
    private final String owner;
    private final String description;
    private final long amountCents;
    private ClaimStatus status = ClaimStatus.SUBMITTED;
    private String decidedBy;

    public Claim(long id, String owner, String description, long amountCents) {
        this.id = id;
        this.owner = owner;
        this.description = description;
        this.amountCents = amountCents;
    }

    public long getId() {
        return id;
    }

    public String getOwner() {
        return owner;
    }

    public String getDescription() {
        return description;
    }

    public long getAmountCents() {
        return amountCents;
    }

    public ClaimStatus getStatus() {
        return status;
    }

    public String getDecidedBy() {
        return decidedBy;
    }

    void decide(ClaimStatus outcome, String by) {
        if (status != ClaimStatus.SUBMITTED) {
            throw new IllegalStateException("Claim " + id + " is already " + status);
        }
        this.status = outcome;
        this.decidedBy = by;
    }
}
