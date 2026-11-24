package com.acme.library.service;

import java.util.Optional;
import com.acme.library.config.LibraryProperties;
import com.acme.library.dto.IsbnInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

@Service
public class IsbnLookupService {

  private static final Logger LOG = LoggerFactory.getLogger(IsbnLookupService.class);

  private final RestTemplate restTemplate;
  private final LibraryProperties properties;

  public IsbnLookupService(RestTemplate restTemplate, LibraryProperties properties) {
    this.restTemplate = restTemplate;
    this.properties = properties;
  }

  public Optional<IsbnInfo> lookup(String isbn) {
    try {
      return Optional.ofNullable(restTemplate.getForObject(properties.getIsbnLookupUrl(), IsbnInfo.class, isbn));
    } catch (RestClientException e) {
      LOG.warn("ISBN lookup failed for {}: {}", isbn, e.getMessage());
      return Optional.empty();
    }
  }
}
