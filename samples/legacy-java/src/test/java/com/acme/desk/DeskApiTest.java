package com.acme.desk;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.acme.desk.ticket.NotificationService;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class DeskApiTest {

  private static final String KEY = "demo-api-key-not-a-secret";

  @Autowired
  private MockMvc mvc;

  @Autowired
  private NotificationService notifications;

  private int open(String title) throws Exception {
    String body = mvc.perform(post("/api/tickets").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_JSON)
        .content("{\"title\": \"" + title + "\", \"priority\": \"LOW\"}"))
        .andExpect(status().isCreated())
        .andReturn().getResponse().getContentAsString();
    return JsonPath.read(body, "$.id");
  }

  @Test
  void openingATicketReturnsItsReferenceAndNotifies() throws Exception {
    int before = notifications.openedCount();
    mvc.perform(post("/api/tickets").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_JSON)
        .content("{\"title\": \"Printer on fire\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.reference").value(org.hamcrest.Matchers.matchesPattern("TCK-[0-9]{6}")))
        .andExpect(header().string("X-Legacy-Desk", "acme-helpdesk"));
    org.junit.jupiter.api.Assertions.assertEquals(before + 1, notifications.openedCount());
  }

  @Test
  void aBlankTitleIsRejected() throws Exception {
    mvc.perform(post("/api/tickets").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_JSON).content("{\"title\": \"\"}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void noKeyMeansUnauthorized() throws Exception {
    mvc.perform(get("/api/tickets")).andExpect(status().isUnauthorized());
  }

  @Test
  void aWrongKeyMeansUnauthorized() throws Exception {
    mvc.perform(get("/api/tickets").header("X-Api-Key", "nope")).andExpect(status().isUnauthorized());
  }

  @Test
  void everythingOutsideApiIsDenied() throws Exception {
    mvc.perform(get("/internal").header("X-Api-Key", KEY)).andExpect(status().isForbidden());
  }

  @Test
  void aTicketCanBeClosedThroughTheReflectionWiredCommand() throws Exception {
    int id = open("Cannot log in");
    mvc.perform(post("/api/commands/close").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_JSON).content("{\"id\": " + id + "}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("CLOSED"));
  }

  @Test
  void escalateRaisesThePriority() throws Exception {
    int id = open("Slow reports");
    mvc.perform(post("/api/commands/escalate").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_JSON).content("{\"id\": " + id + "}"))
        .andExpect(jsonPath("$.priority").value("HIGH"));
  }

  @Test
  void anUnknownCommandIsNotFound() throws Exception {
    mvc.perform(post("/api/commands/explode").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isNotFound());
  }

  @Test
  void anUploadIsAcceptedAndMeasured() throws Exception {
    int id = open("Needs a screenshot");
    mvc.perform(multipart("/api/tickets/" + id + "/attachments").file(new MockMultipartFile("file", "shot.png", "image/png", new byte[] {1, 2, 3})).header("X-Api-Key", KEY))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.bytes").value(3))
        .andExpect(jsonPath("$.name").value("shot.png"));
  }

  @Test
  void anUnknownTicketIsNotFound() throws Exception {
    mvc.perform(get("/api/tickets/4040").header("X-Api-Key", KEY)).andExpect(status().isNotFound());
  }
}
