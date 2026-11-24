package com.acme.portal.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.acme.portal.SecuredApiTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;

class LoginFlowTest extends SecuredApiTestBase {

    @Test
    void sessionSurvivesToTheNextRequest() throws Exception {
        MockHttpSession session = login("casey");
        mvc.perform(get("/api/me").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("casey"))
            .andExpect(jsonPath("$.roles[0]").value("CLAIMANT"));
    }

    @Test
    void loginAnswersWithTheUser() throws Exception {
        MockHttpSession session = new MockHttpSession();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/session").session(session)
                .contentType("application/json").content("{\"username\":\"alex\",\"password\":\"demo-pass-not-a-secret\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.displayName").value("Alex Adjuster"));
    }

    @Test
    void wrongPasswordIsUnauthorized() throws Exception {
        login("casey", "nope", 401);
    }

    @Test
    void unknownUserIsUnauthorized() throws Exception {
        login("nobody", "whatever", 401);
    }

    @Test
    void meWithoutLoginIsUnauthorizedJson() throws Exception {
        mvc.perform(get("/api/me"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("unauthorized"));
    }

    @Test
    void logoutEndsTheSession() throws Exception {
        MockHttpSession session = login("casey");
        mvc.perform(delete("/api/logout").session(session)).andExpect(status().isNoContent());
        mvc.perform(get("/api/me").session(session)).andExpect(status().isUnauthorized());
    }

    @Test
    void healthIsPublic() throws Exception {
        mvc.perform(get("/api/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    void blankLoginIsABadRequest() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/session")
                .contentType("application/json").content("{\"username\":\"\",\"password\":\"\"}"))
            .andExpect(status().isBadRequest());
    }
}
