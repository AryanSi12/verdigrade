package com.acme.warehouse.controller;

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
class SupplierControllerTest {

  private static final String VALID = "{\"name\": \"Test Supplies Ltd\", \"email\": \"orders@test-supplies.example\", \"phone\": \"+91 20 5550 0100\", \"rating\": 4}";

  @Autowired
  private MockMvc mvc;

  @Test
  void createReturns201WithAnId() throws Exception {
    mvc.perform(post("/api/suppliers").contentType(MediaType.APPLICATION_JSON).content(VALID))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").isNumber());
  }

  @Test
  void duplicateReturns409() throws Exception {
    mvc.perform(post("/api/suppliers").contentType(MediaType.APPLICATION_JSON).content(VALID)).andExpect(status().isCreated());
    mvc.perform(post("/api/suppliers").contentType(MediaType.APPLICATION_JSON).content(VALID)).andExpect(status().isConflict());
  }

  @Test
  void emptyBodyReturns400() throws Exception {
    mvc.perform(post("/api/suppliers").contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.message").value("Validation failed"));
  }

  @Test
  void unknownIdReturns404() throws Exception {
    mvc.perform(get("/api/suppliers/987654")).andExpect(status().isNotFound());
  }

  @Test
  void listReturnsAnArray() throws Exception {
    mvc.perform(get("/api/suppliers")).andExpect(status().isOk()).andExpect(jsonPath("$").isArray());
  }
}
