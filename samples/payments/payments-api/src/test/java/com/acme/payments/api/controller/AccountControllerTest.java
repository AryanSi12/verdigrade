package com.acme.payments.api.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AccountControllerTest {

  private static final String VALID = "{\"accountNumber\": \"ACC-TEST-0001\", \"holderName\": \"Test Holder\", \"currency\": \"INR\"}";

  @Autowired
  private MockMvc mvc;

  @Test
  void createReturns201WithAnId() throws Exception {
    mvc.perform(post("/api/accounts").contentType(MediaType.APPLICATION_JSON).content(VALID))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").isNumber());
  }

  @Test
  void duplicateReturns409() throws Exception {
    mvc.perform(post("/api/accounts").contentType(MediaType.APPLICATION_JSON).content(VALID)).andExpect(status().isCreated());
    mvc.perform(post("/api/accounts").contentType(MediaType.APPLICATION_JSON).content(VALID)).andExpect(status().isConflict());
  }

  @Test
  void emptyBodyReturns400() throws Exception {
    mvc.perform(post("/api/accounts").contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.message").value("Validation failed"));
  }

  @Test
  void unknownIdReturns404() throws Exception {
    mvc.perform(get("/api/accounts/987654")).andExpect(status().isNotFound());
  }

  @Test
  void listReturnsAnArray() throws Exception {
    mvc.perform(get("/api/accounts")).andExpect(status().isOk()).andExpect(jsonPath("$").isArray());
  }
}
