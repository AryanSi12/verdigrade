package com.acme.board.web;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** Real security chain, interceptor and controllers; requests use the canonical paths (no trailing slash). Reads are open, changes carry a CSRF token. */
@SpringBootTest
@AutoConfigureMockMvc
class BoardApiTest {

    @Autowired
    private MockMvc mvc;

    private long createTask(String title) throws Exception {
        String body = mvc.perform(post("/api/tasks").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"" + title + "\",\"priority\":\"MEDIUM\"}"))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.id")).longValue();
    }

    @Test
    void theBoardPageIsServedWithoutALogin() throws Exception {
        mvc.perform(get("/index.html")).andExpect(status().isOk()).andExpect(content().string(containsString("Team Task Board")));
    }

    @Test
    void theStylesheetAndScriptsArePublic() throws Exception {
        mvc.perform(get("/css/app.css")).andExpect(status().isOk());
        mvc.perform(get("/js/app.js")).andExpect(status().isOk());
    }

    @Test
    void runtimeIsPublicAndReportsTheRealVersions() throws Exception {
        mvc.perform(get("/api/runtime"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.java").value(System.getProperty("java.version")))
            .andExpect(jsonPath("$.springBoot").isNotEmpty())
            .andExpect(jsonPath("$.springSecurity").isNotEmpty())
            .andExpect(jsonPath("$.namespace").isNotEmpty());
    }

    @Test
    void tasksCanBeReadWithoutALogin() throws Exception {
        mvc.perform(get("/api/tasks")).andExpect(status().isOk()).andExpect(jsonPath("$[0].title").isNotEmpty());
    }

    @Test
    void thereIsNoLoginEndpoint() throws Exception {
        mvc.perform(get("/api/me")).andExpect(status().isNotFound());
    }

    @Test
    void listCarriesTheRequestCountHeaders() throws Exception {
        mvc.perform(get("/api/tasks"))
            .andExpect(status().isOk())
            .andExpect(header().exists("X-Request-Count"))
            .andExpect(header().exists("X-Uptime-Seconds"))
            .andExpect(jsonPath("$.length()", greaterThanOrEqualTo(1)));
    }

    @Test
    void changesWithoutACsrfTokenAreRejected() throws Exception {
        mvc.perform(post("/api/tasks").contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"No token\",\"priority\":\"LOW\"}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void createAddsATaskThatShowsUpInTheList() throws Exception {
        long id = createTask("Show up in list");
        mvc.perform(get("/api/tasks")).andExpect(jsonPath("$[*].id", hasItem((int) id)));
    }

    @Test
    void createReportsEveryInvalidField() throws Exception {
        mvc.perform(post("/api/tasks").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"\",\"dueDate\":\"2001-01-01\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors[*].field", hasItem("title")))
            .andExpect(jsonPath("$.errors[*].field", hasItem("priority")))
            .andExpect(jsonPath("$.errors[*].field", hasItem("dueDate")));
    }

    @Test
    void anUnknownPriorityIsABadRequest() throws Exception {
        mvc.perform(post("/api/tasks").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"x\",\"priority\":\"URGENT\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void completeMarksTheTaskDone() throws Exception {
        long id = createTask("Finish me");
        mvc.perform(post("/api/tasks/" + id + "/complete").with(csrf()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.done").value(true));
        mvc.perform(get("/api/tasks?status=done")).andExpect(jsonPath("$[*].id", hasItem((int) id)));
        mvc.perform(get("/api/tasks?status=open")).andExpect(jsonPath("$[*].id", not(hasItem((int) id))));
    }

    @Test
    void completingAMissingTaskIsNotFound() throws Exception {
        mvc.perform(post("/api/tasks/987654/complete").with(csrf()))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.message").value("Task 987654 does not exist"));
    }

    @Test
    void deleteRemovesTheTask() throws Exception {
        long id = createTask("Delete me");
        mvc.perform(delete("/api/tasks/" + id).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/tasks")).andExpect(jsonPath("$[*].id", not(hasItem((int) id))));
    }

    @Test
    void statsReportTheCounts() throws Exception {
        mvc.perform(get("/api/tasks/stats"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total", greaterThanOrEqualTo(1)))
            .andExpect(jsonPath("$.openByPriority.HIGH").isNumber());
    }
}
