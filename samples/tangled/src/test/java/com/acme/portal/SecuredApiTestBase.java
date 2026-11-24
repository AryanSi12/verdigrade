package com.acme.portal;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.acme.portal.audit.AuditSink;
import com.acme.portal.security.AccountStore;
import com.jayway.jsonpath.JsonPath;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

/** Full-stack base: real filter chain, interceptors and controllers; only the audit sink is mocked so tests can verify it. */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class SecuredApiTestBase {

    @Autowired
    protected MockMvc mvc;

    @MockBean
    protected AuditSink auditSink;

    protected MockHttpSession login(String username) throws Exception {
        return login(username, AccountStore.DEMO_PASSWORD, 200);
    }

    protected MockHttpSession login(String username, String password, int expectedStatus) throws Exception {
        MockHttpSession session = new MockHttpSession();
        mvc.perform(post("/api/session").session(session).contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
            .andExpect(status().is(expectedStatus));
        return session;
    }

    protected long submitClaim(MockHttpSession session, String description, long amountCents) throws Exception {
        String body = mvc.perform(post("/api/claims").session(session).contentType(MediaType.APPLICATION_JSON)
                .content("{\"description\":\"" + description + "\",\"amountCents\":" + amountCents + "}"))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.id")).longValue();
    }
}
