package com.acme.portal.web;

import com.acme.portal.security.PortalPrincipal;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.servlet.http.HttpServletRequest;
import javax.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SessionController extends AbstractSecuredController {

    @PostMapping("/api/session")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest login, HttpServletRequest request) {
        return describe(signIn(request, login.getUsername(), login.getPassword()));
    }

    @GetMapping("/api/me")
    public Map<String, Object> me(HttpServletRequest request) {
        return describe(currentUser(request));
    }

    static Map<String, Object> describe(PortalPrincipal principal) {
        Map<String, Object> body = new LinkedHashMap<String, Object>();
        body.put("username", principal.getUsername());
        body.put("displayName", principal.getDisplayName());
        body.put("roles", principal.getRoles());
        return body;
    }
}
