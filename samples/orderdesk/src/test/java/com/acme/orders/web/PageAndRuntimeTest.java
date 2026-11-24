package com.acme.orders.web;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

/** The page, its assets and the runtime badge it shows. */
@SpringBootTest
@AutoConfigureMockMvc
class PageAndRuntimeTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void thePageIsServed() throws Exception {
        mvc.perform(get("/index.html")).andExpect(status().isOk()).andExpect(content().string(containsString("Order Desk")));
    }

    @Test
    void theStylesheetAndScriptsAreServed() throws Exception {
        mvc.perform(get("/css/app.css")).andExpect(status().isOk());
        mvc.perform(get("/js/app.js")).andExpect(status().isOk()).andExpect(content().string(containsString("api.orders")));
        mvc.perform(get("/js/api.js")).andExpect(status().isOk()).andExpect(content().string(containsString("/api/orders")));
    }

    @Test
    void runtimeReportsTheRealJavaVersion() throws Exception {
        mvc.perform(get("/api/runtime"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.java").value(System.getProperty("java.version")))
            .andExpect(jsonPath("$.springBoot").isNotEmpty())
            .andExpect(jsonPath("$.namespace").isNotEmpty());
    }
}
