package com.acme.payments.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.acme.payments.dto.MerchantRequest;
import com.acme.payments.dto.MerchantResponse;
import com.acme.payments.exception.DuplicateResourceException;
import com.acme.payments.exception.ResourceNotFoundException;
import com.acme.payments.service.MerchantService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(MerchantService.class)
class MerchantServiceTest {

  @Autowired
  private MerchantService service;

  private MerchantRequest request() {
    MerchantRequest request = new MerchantRequest();
    request.setName("Test Merchant Pvt Ltd");
    request.setEmail("billing@test-merchant.example");
    request.setCountryCode("IN");
    return request;
  }

  @Test
  void createThenGet() {
    MerchantResponse created = service.create(request());
    assertThat(created.getId()).isNotNull();
    assertThat(service.get(created.getId()).getName()).isEqualTo(request().getName());
  }

  @Test
  void duplicateIsRejected() {
    service.create(request());
    assertThrows(DuplicateResourceException.class, () -> service.create(request()));
  }

  @Test
  void updateKeepsTheId() {
    MerchantResponse created = service.create(request());
    MerchantResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    MerchantResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(MerchantResponse::getId).doesNotContain(created.getId());
  }
}
