package com.acme.tickets;

import java.time.LocalDateTime;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TicketsApiIntegrationTest {

  @Autowired private MockMvc mvc;

  private long create(String url, String body) throws Exception {
    String response = mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content(body))
        .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    return ((Number) JsonPath.read(response, "$.id")).longValue();
  }

  private long newVenue(int capacity) throws Exception {
    return create("/api/venues", "{\"name\":\"Test Hall " + System.nanoTime() + "\",\"city\":\"Nashik\",\"capacity\":" + capacity + "}");
  }

  private long newEvent(long venueId, int capacity, String price) throws Exception {
    String startsAt = LocalDateTime.now().plusDays(7).withNano(0).toString();
    return create("/api/events", "{\"title\":\"Gig\",\"startsAt\":\"" + startsAt + "\",\"venueId\":" + venueId
        + ",\"ticketPrice\":" + price + ",\"capacity\":" + capacity + "}");
  }

  private long newCustomer() throws Exception {
    return create("/api/customers", "{\"name\":\"Tess Buyer\",\"email\":\"tess" + System.nanoTime() + "@example.org\"}");
  }

  @Test
  void seededEventsAreListed() throws Exception {
    mvc.perform(get("/api/events")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(org.hamcrest.Matchers.greaterThanOrEqualTo(3)));
    mvc.perform(get("/api/events").param("city", "pune")).andExpect(status().isOk()).andExpect(jsonPath("$[0].city").value("Pune"));
    mvc.perform(get("/api/events").param("onSale", "true")).andExpect(status().isOk());
  }

  @Test
  void fullFlowFromEventToRefund() throws Exception {
    long eventId = newEvent(newVenue(50), 10, "20.00");
    long customerId = newCustomer();
    mvc.perform(post("/api/events/" + eventId + "/publish")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ON_SALE"));

    long orderId = create("/api/orders", "{\"eventId\":" + eventId + ",\"customerId\":" + customerId + ",\"quantity\":4}");
    mvc.perform(get("/api/events/" + eventId)).andExpect(jsonPath("$.ticketsLeft").value(6));
    mvc.perform(get("/api/orders/" + orderId)).andExpect(jsonPath("$.total").value(75.6)).andExpect(jsonPath("$.status").value("PENDING"));

    mvc.perform(post("/api/orders/" + orderId + "/pay")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAID"));
    mvc.perform(get("/api/tickets/order/" + orderId)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(4));
    mvc.perform(get("/api/events/" + eventId + "/revenue")).andExpect(status().isOk()).andExpect(content().string("75.60"));

    mvc.perform(post("/api/orders/" + orderId + "/refund")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REFUNDED"));
    mvc.perform(get("/api/events/" + eventId)).andExpect(jsonPath("$.ticketsLeft").value(10));
    mvc.perform(get("/api/tickets/order/" + orderId)).andExpect(jsonPath("$.length()").value(0));
    mvc.perform(get("/api/orders/customer/" + customerId)).andExpect(jsonPath("$.length()").value(1));
  }

  @Test
  void cannotOrderFromADraftEvent() throws Exception {
    long eventId = newEvent(newVenue(50), 10, "20.00");
    long customerId = newCustomer();
    mvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON)
        .content("{\"eventId\":" + eventId + ",\"customerId\":" + customerId + ",\"quantity\":1}")).andExpect(status().isConflict());
  }

  @Test
  void buyingTheLastSeatsMarksTheEventSoldOut() throws Exception {
    long eventId = newEvent(newVenue(50), 2, "10.00");
    long customerId = newCustomer();
    mvc.perform(post("/api/events/" + eventId + "/publish")).andExpect(status().isOk());
    create("/api/orders", "{\"eventId\":" + eventId + ",\"customerId\":" + customerId + ",\"quantity\":2}");
    mvc.perform(get("/api/events/" + eventId)).andExpect(jsonPath("$.status").value("SOLD_OUT"));
    mvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON)
        .content("{\"eventId\":" + eventId + ",\"customerId\":" + customerId + ",\"quantity\":1}")).andExpect(status().isConflict());
  }

  @Test
  void invalidBodiesReturnFieldErrors() throws Exception {
    mvc.perform(post("/api/venues").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"\",\"city\":\"X\",\"capacity\":0}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.message").value("Validation failed"))
        .andExpect(jsonPath("$.details.length()").value(2));
  }

  @Test
  void eventInThePastIsRejected() throws Exception {
    long venueId = newVenue(50);
    mvc.perform(post("/api/events").contentType(MediaType.APPLICATION_JSON)
        .content("{\"title\":\"Old\",\"startsAt\":\"2001-01-01T10:00:00\",\"venueId\":" + venueId + ",\"ticketPrice\":5,\"capacity\":5}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void duplicateCustomerEmailIsAConflict() throws Exception {
    String body = "{\"name\":\"Dup\",\"email\":\"dup-" + System.nanoTime() + "@example.org\"}";
    mvc.perform(post("/api/customers").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated());
    mvc.perform(post("/api/customers").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict());
  }

  @Test
  void unknownEventIs404WithAnErrorBody() throws Exception {
    mvc.perform(get("/api/events/424242")).andExpect(status().isNotFound()).andExpect(jsonPath("$.status").value(404))
        .andExpect(jsonPath("$.path").value("/api/events/424242"));
  }

  @Test
  void ticketLookupByCodeFindsTheTicket() throws Exception {
    long eventId = newEvent(newVenue(50), 5, "10.00");
    long customerId = newCustomer();
    mvc.perform(post("/api/events/" + eventId + "/publish")).andExpect(status().isOk());
    long orderId = create("/api/orders", "{\"eventId\":" + eventId + ",\"customerId\":" + customerId + ",\"quantity\":1}");
    mvc.perform(post("/api/orders/" + orderId + "/pay")).andExpect(status().isOk());
    String list = mvc.perform(get("/api/tickets/order/" + orderId)).andReturn().getResponse().getContentAsString();
    String code = JsonPath.read(list, "$[0].code");
    mvc.perform(get("/api/tickets/" + code)).andExpect(status().isOk()).andExpect(jsonPath("$.eventTitle").value("Gig"));
    mvc.perform(get("/api/tickets/NOPE")).andExpect(status().isNotFound());
  }

  @Test
  void deletingAVenueWithEventsIsRefused() throws Exception {
    long venueId = newVenue(50);
    newEvent(venueId, 5, "10.00");
    mvc.perform(delete("/api/venues/" + venueId)).andExpect(status().isConflict());
  }
}
