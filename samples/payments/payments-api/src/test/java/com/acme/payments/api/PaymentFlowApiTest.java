package com.acme.payments.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.acme.payments.common.Money;
import com.acme.payments.entity.Payment;
import com.acme.payments.service.PaymentProcessor;
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
class PaymentFlowApiTest {

  @Autowired
  private MockMvc mvc;

  @Autowired
  private PaymentProcessor processor;

  @Test
  void captureThenRefundOverTheApi() throws Exception {
    Payment payment = processor.authorize("API-FLOW-1", 1L, Money.of("250.00", "INR"));
    mvc.perform(post("/api/payment-flow/" + payment.getId() + "/capture"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("CAPTURED"))
        .andExpect(header().exists("X-Request-Id"));
    mvc.perform(post("/api/payment-flow/" + payment.getId() + "/refund").contentType(MediaType.APPLICATION_JSON)
        .content("{\"reference\": \"API-RF-1\", \"amount\": 50.00, \"reason\": \"test\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.reference").value("API-RF-1"));
  }

  @Test
  void refundingAnUncapturedPaymentIsAConflict() throws Exception {
    Payment payment = processor.authorize("API-FLOW-2", 1L, Money.of("10.00", "INR"));
    mvc.perform(post("/api/payment-flow/" + payment.getId() + "/refund").contentType(MediaType.APPLICATION_JSON)
        .content("{\"reference\": \"API-RF-2\", \"amount\": 5.00}"))
        .andExpect(status().isConflict());
  }

  @Test
  void invalidRefundBodyIsABadRequest() throws Exception {
    mvc.perform(post("/api/payment-flow/1/refund").contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isBadRequest());
  }
}
