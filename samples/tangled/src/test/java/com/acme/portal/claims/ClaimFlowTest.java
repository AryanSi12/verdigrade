package com.acme.portal.claims;

import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.acme.portal.SecuredApiTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;

class ClaimFlowTest extends SecuredApiTestBase {

    @Test
    void submittedClaimBelongsToTheCaller() throws Exception {
        MockHttpSession casey = login("casey");
        long id = submitClaim(casey, "Hail damage", 25000);
        mvc.perform(get("/api/claims/" + id).session(casey))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.owner").value("casey"))
            .andExpect(jsonPath("$.status").value("SUBMITTED"));
    }

    @Test
    void invalidClaimIsABadRequest() throws Exception {
        mvc.perform(post("/api/claims").session(login("casey")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"description\":\"\",\"amountCents\":0}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid"));
    }

    @Test
    void claimantsOnlySeeTheirOwnClaims() throws Exception {
        MockHttpSession casey = login("casey");
        MockHttpSession jordan = login("jordan");
        long mine = submitClaim(casey, "Casey claim", 1000);
        long theirs = submitClaim(jordan, "Jordan claim", 2000);
        mvc.perform(get("/api/claims").session(casey))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.id==" + mine + ")]").exists())
            .andExpect(jsonPath("$[?(@.id==" + theirs + ")]").doesNotExist());
    }

    @Test
    void anotherClaimantsClaimLooksMissing() throws Exception {
        long theirs = submitClaim(login("jordan"), "Jordan private", 3000);
        mvc.perform(get("/api/claims/" + theirs).session(login("casey")))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("not_found"));
    }

    @Test
    void adjusterSeesEveryClaim() throws Exception {
        long a = submitClaim(login("casey"), "A", 100);
        long b = submitClaim(login("jordan"), "B", 200);
        mvc.perform(get("/api/claims").session(login("alex")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.id==" + a + ")]").exists())
            .andExpect(jsonPath("$[?(@.id==" + b + ")]").exists());
    }

    @Test
    void decidingTwiceIsAConflict() throws Exception {
        long id = submitClaim(login("casey"), "Twice", 4000);
        MockHttpSession alex = login("alex");
        mvc.perform(post("/api/claims/" + id + "/approve").session(alex)).andExpect(status().isOk());
        mvc.perform(post("/api/claims/" + id + "/reject").session(alex))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value("conflict"));
    }

    @Test
    void unknownClaimIsNotFound() throws Exception {
        mvc.perform(post("/api/claims/999999/approve").session(login("alex"))).andExpect(status().isNotFound());
    }

    @Test
    void approvalIsAuditedWithTheAdjuster() throws Exception {
        long id = submitClaim(login("casey"), "Audit me", 7000);
        mvc.perform(post("/api/claims/" + id + "/approve").session(login("alex"))).andExpect(status().isOk());
        verify(auditSink, atLeastOnce()).record(argThat(event ->
            "alex".equals(event.getActor()) && event.getStatus() == 200 && event.getPath().equals("/api/claims/" + id + "/approve")));
    }

    @Test
    void loginIsAuditedWithTheNewUser() throws Exception {
        login("jordan");
        verify(auditSink, atLeastOnce()).record(argThat(event ->
            "jordan".equals(event.getActor()) && event.getMethod().equals("POST") && event.getPath().equals("/api/session")));
    }
}
