package com.acme.library.service;

import java.math.BigDecimal;
import com.acme.library.config.LibraryProperties;
import com.acme.library.dto.IsbnInfo;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class IsbnLookupServiceTest {

  private MockRestServiceServer server;
  private IsbnLookupService service;

  @BeforeEach
  void setUp() {
    RestTemplate restTemplate = new RestTemplate();
    server = MockRestServiceServer.createServer(restTemplate);
    LibraryProperties properties = new LibraryProperties();
    properties.setIsbnLookupUrl("http://isbn.test/isbn/{isbn}.json");
    service = new IsbnLookupService(restTemplate, properties);
  }

  @Test
  void returnsTitleAndPagesFromTheRemoteService() {
    server.expect(requestTo("http://isbn.test/isbn/9780134685991.json")).andExpect(method(HttpMethod.GET))
        .andRespond(withSuccess("{\"title\":\"Effective Java\",\"number_of_pages\":412,\"unknown\":true}", MediaType.APPLICATION_JSON));
    IsbnInfo info = service.lookup("9780134685991").get();
    assertEquals("Effective Java", info.getTitle());
    assertEquals(Integer.valueOf(412), info.getNumberOfPages());
    server.verify();
  }

  @Test
  void returnsEmptyWhenTheRemoteServiceFails() {
    server.expect(requestTo("http://isbn.test/isbn/1.json")).andRespond(withServerError());
    assertFalse(service.lookup("1").isPresent());
  }
}
