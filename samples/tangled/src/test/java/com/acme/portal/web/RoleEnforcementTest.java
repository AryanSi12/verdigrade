package com.acme.portal.web;

import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.acme.portal.SecuredApiTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;

class RoleEnforcementTest extends SecuredApiTestBase {

    @Test
    void claimantCannotApprove() throws Exception {
        MockHttpSession casey = login("casey");
        long id = submitClaim(casey, "Cracked phone", 12000);
        mvc.perform(post("/api/claims/" + id + "/approve").session(casey))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").value("forbidden"))
            .andExpect(jsonPath("$.detail").value("requires ADJUSTER"));
    }

    @Test
    void adjusterCanApprove() throws Exception {
        long id = submitClaim(login("casey"), "Bike theft", 54000);
        mvc.perform(post("/api/claims/" + id + "/approve").session(login("alex")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("APPROVED"))
            .andExpect(jsonPath("$.decidedBy").value("alex"));
    }

    @Test
    void adminPassesEveryRoleCheck() throws Exception {
        long id = submitClaim(login("jordan"), "Water damage", 90000);
        mvc.perform(post("/api/claims/" + id + "/reject").session(login("root")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("REJECTED"));
    }

    @Test
    void claimantCannotReachAdminArea() throws Exception {
        mvc.perform(get("/api/admin/users").session(login("casey")))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").value("forbidden"));
    }

    @Test
    void adjusterCannotReachAdminArea() throws Exception {
        mvc.perform(get("/api/admin/users").session(login("alex"))).andExpect(status().isForbidden());
    }

    @Test
    void adminListsUsers() throws Exception {
        mvc.perform(get("/api/admin/users").session(login("root")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0]").value("casey"));
    }

    @Test
    void anonymousIsTurnedAwayBeforeTheInterceptor() throws Exception {
        mvc.perform(post("/api/claims/1/approve")).andExpect(status().isUnauthorized());
    }

    @Test
    void deniedRequestsAreAuditedWithTheActor() throws Exception {
        MockHttpSession casey = login("casey");
        long id = submitClaim(casey, "Laptop", 80000);
        mvc.perform(post("/api/claims/" + id + "/approve").session(casey)).andExpect(status().isForbidden());
        verify(auditSink, atLeastOnce()).record(argThat(event ->
            "casey".equals(event.getActor()) && event.getStatus() == 403 && event.getPath().endsWith("/approve")));
    }
}
