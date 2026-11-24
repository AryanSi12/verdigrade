package com.acme.portal.claims;

import com.acme.portal.security.RequiresRole;
import com.acme.portal.security.Roles;
import com.acme.portal.web.AbstractSecuredController;
import java.util.List;
import javax.servlet.http.HttpServletRequest;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ClaimController extends AbstractSecuredController {

    private final ClaimService claims;

    public ClaimController(ClaimService claims) {
        this.claims = claims;
    }

    @PostMapping("/api/claims")
    @ResponseStatus(HttpStatus.CREATED)
    public Claim submit(@Valid @RequestBody ClaimRequest request, HttpServletRequest http) {
        return claims.submit(currentUser(http), request);
    }

    @GetMapping("/api/claims")
    public List<Claim> list(HttpServletRequest http) {
        return claims.visibleTo(currentUser(http));
    }

    @GetMapping("/api/claims/{id}")
    public Claim get(@PathVariable long id, HttpServletRequest http) {
        return claims.get(currentUser(http), id);
    }

    @PostMapping("/api/claims/{id}/approve")
    @RequiresRole(Roles.ADJUSTER)
    public Claim approve(@PathVariable long id, HttpServletRequest http) {
        return claims.approve(id, currentUser(http));
    }

    @PostMapping("/api/claims/{id}/reject")
    @RequiresRole(Roles.ADJUSTER)
    public Claim reject(@PathVariable long id, HttpServletRequest http) {
        return claims.reject(id, currentUser(http));
    }
}
