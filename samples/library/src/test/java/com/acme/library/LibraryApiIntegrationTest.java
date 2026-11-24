package com.acme.library;

import java.util.Optional;
import com.acme.library.dto.IsbnInfo;
import com.acme.library.service.IsbnLookupService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LibraryApiIntegrationTest {

  @Autowired private MockMvc mvc;
  @MockBean private IsbnLookupService isbnLookupService;

  private String login(String username, String password) {
    String raw = username + ":" + password;
    return "Basic " + Base64.getEncoder().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
  }

  private long create(String url, String token, String body) throws Exception {
    MvcResult result = mvc.perform(post(url).header("Authorization", token).contentType(MediaType.APPLICATION_JSON).content(body))
        .andExpect(status().isCreated()).andReturn();
    return ((Number) JsonPath.read(result.getResponse().getContentAsString(), "$.id")).longValue();
  }

  @Test
  void wrongPasswordIsUnauthorized() throws Exception {
    mvc.perform(get("/api/loans/overdue").header("Authorization", login("admin", "nope"))).andExpect(status().isUnauthorized());
  }

  @Test
  void protectedEndpointsNeedAToken() throws Exception {
    mvc.perform(get("/api/loans/overdue")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/members")).andExpect(status().isUnauthorized());
  }

  @Test
  void seededBooksArePublic() throws Exception {
    mvc.perform(get("/api/books")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(org.hamcrest.Matchers.greaterThanOrEqualTo(3)));
    mvc.perform(get("/api/books").param("title", "hobbit")).andExpect(status().isOk()).andExpect(jsonPath("$[0].title").value("The Hobbit"));
  }

  @Test
  void requestIdHeaderIsAdded() throws Exception {
    mvc.perform(get("/api/info")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/books")).andExpect(header().exists("X-Request-Id"));
  }

  @Test
  void libraryFlowFromAuthorToFine() throws Exception {
    String admin = login("admin", "admin-demo-pass");
    long authorId = create("/api/authors", admin, "{\"name\":\"Flow Author\",\"biography\":\"Wrote a flow\",\"birthYear\":1970}");
    long bookId = create("/api/books", admin,
        "{\"title\":\"Flow Book\",\"isbn\":\"978-0-306-40615-7\",\"publishedYear\":2020,\"genre\":\"science\",\"copies\":1,\"authorId\":" + authorId + "}");
    long memberId = create("/api/members", admin,
        "{\"fullName\":\"Flo Reader\",\"email\":\"flo@example.org\",\"username\":\"flo\",\"password\":\"flo-password-1\",\"membershipType\":\"student\"}");

    mvc.perform(get("/api/books/" + bookId)).andExpect(status().isOk()).andExpect(jsonPath("$.copiesAvailable").value(1))
        .andExpect(jsonPath("$.authorName").value("Flow Author"));

    String flo = login("flo", "flo-password-1");
    long loanId = create("/api/loans", flo, "{\"bookId\":" + bookId + ",\"memberId\":" + memberId + "}");
    mvc.perform(get("/api/books/" + bookId)).andExpect(jsonPath("$.copiesAvailable").value(0));

    // nobody else can borrow it; they can reserve it instead
    mvc.perform(post("/api/loans").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
        .content("{\"bookId\":" + bookId + ",\"memberId\":" + memberId + "}")).andExpect(status().isConflict());
    create("/api/reservations", flo, "{\"bookId\":" + bookId + ",\"memberId\":" + memberId + "}");

    mvc.perform(post("/api/loans/" + loanId + "/return").header("Authorization", flo)).andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("RETURNED"));
    mvc.perform(get("/api/books/" + bookId)).andExpect(jsonPath("$.copiesAvailable").value(1));
    mvc.perform(get("/api/fines/member/" + memberId + "/total").header("Authorization", admin)).andExpect(status().isOk());
  }

  @Test
  void memberCannotCreateBooksButLibrarianCan() throws Exception {
    String admin = login("admin", "admin-demo-pass");
    mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
        .content("{\"fullName\":\"Plain Reader\",\"email\":\"plain@example.org\",\"username\":\"plain\",\"password\":\"plain-password-1\"}"))
        .andExpect(status().isCreated()).andExpect(jsonPath("$.role").value("MEMBER"));
    String plain = login("plain", "plain-password-1");
    String body = "{\"title\":\"Nope\",\"isbn\":\"9780134685991\",\"publishedYear\":2018,\"genre\":\"FICTION\",\"copies\":1,\"authorId\":1}";
    mvc.perform(post("/api/books").header("Authorization", plain).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
    mvc.perform(post("/api/books").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict());
  }

  @Test
  void invalidBodiesReturnFieldErrors() throws Exception {
    String admin = login("librarian", "admin-demo-pass");
    mvc.perform(post("/api/books").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
        .content("{\"title\":\"\",\"isbn\":\"123\",\"publishedYear\":2018,\"genre\":\"FICTION\",\"copies\":1,\"authorId\":1}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.message").value("Validation failed"))
        .andExpect(jsonPath("$.details.length()").value(2));
  }

  @Test
  void unknownBookIsA404WithAnErrorBody() throws Exception {
    mvc.perform(get("/api/books/424242")).andExpect(status().isNotFound()).andExpect(jsonPath("$.status").value(404))
        .andExpect(jsonPath("$.path").value("/api/books/424242"));
  }

  @Test
  void isbnLookupUsesTheRemoteServiceAndHandlesMisses() throws Exception {
    IsbnInfo info = new IsbnInfo();
    info.setTitle("Remote Title");
    when(isbnLookupService.lookup("111")).thenReturn(Optional.of(info));
    when(isbnLookupService.lookup("222")).thenReturn(Optional.<IsbnInfo>empty());
    mvc.perform(get("/api/books/lookup/111")).andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Remote Title"));
    mvc.perform(get("/api/books/lookup/222")).andExpect(status().isNotFound());
  }

  @Test
  void infoEndpointNeedsALoginAndReportsTheService() throws Exception {
    String admin = login("admin", "admin-demo-pass");
    mvc.perform(get("/api/info").header("Authorization", admin)).andExpect(status().isOk())
        .andExpect(jsonPath("$.service").value("library-service"));
  }

  @Test
  void overdueReportIsCsv() throws Exception {
    String librarian = login("librarian", "admin-demo-pass");
    mvc.perform(get("/api/loans/overdue/report").header("Authorization", librarian)).andExpect(status().isOk())
        .andExpect(content().string(org.hamcrest.Matchers.startsWith("loanId,member,book,dueOn")));
  }
}
