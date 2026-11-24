package com.acme.portal.admin;

import com.acme.portal.claims.ClaimRepository;
import org.springframework.security.access.annotation.Secured;
import org.springframework.stereotype.Service;

@Service
public class AdminService {

    private final ClaimRepository repository;

    public AdminService(ClaimRepository repository) {
        this.repository = repository;
    }

    @Secured("ROLE_ADMIN")
    public int purgeClaims() {
        return repository.deleteAll();
    }
}
