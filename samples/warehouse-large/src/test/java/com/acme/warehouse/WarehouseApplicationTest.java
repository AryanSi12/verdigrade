package com.acme.warehouse;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WarehouseApplicationTest {

  @Autowired
  private MockMvc mvc;

  @Test
  void contextLoadsAndEveryResponseCarriesARequestId() throws Exception {
    mvc.perform(get("/api/warehouses")).andExpect(status().isOk()).andExpect(header().exists("X-Request-Id"));
  }

  @Test
  void corsPreflightIsAnswered() throws Exception {
    mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options("/api/products")
        .header("Origin", "http://localhost:3000").header("Access-Control-Request-Method", "POST"))
        .andExpect(status().isOk());
  }
}
