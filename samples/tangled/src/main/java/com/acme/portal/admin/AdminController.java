package com.acme.portal.admin;

import com.acme.portal.audit.AuditEvent;
import com.acme.portal.audit.AuditSink;
import com.acme.portal.security.AccountStore;
import com.acme.portal.security.RequiresRole;
import com.acme.portal.security.Roles;
import com.acme.portal.web.AbstractSecuredController;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AdminController extends AbstractSecuredController {

    private final AccountStore accounts;
    private final AdminService admin;
    private final AuditSink audit;

    public AdminController(AccountStore accounts, AdminService admin, AuditSink audit) {
        this.accounts = accounts;
        this.admin = admin;
        this.audit = audit;
    }

    @GetMapping("/api/admin/users")
    public List<String> users() {
        return accounts.usernames();
    }

    @GetMapping("/api/admin/audit")
    public List<AuditEvent> audit() {
        return audit.recent();
    }

    @PostMapping("/api/admin/purge")
    @RequiresRole(Roles.ADMIN)
    public Map<String, Integer> purge() {
        return Collections.singletonMap("deleted", admin.purgeClaims());
    }
}
