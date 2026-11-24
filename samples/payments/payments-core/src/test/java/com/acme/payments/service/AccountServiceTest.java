package com.acme.payments.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.acme.payments.dto.AccountRequest;
import com.acme.payments.dto.AccountResponse;
import com.acme.payments.exception.DuplicateResourceException;
import com.acme.payments.exception.ResourceNotFoundException;
import com.acme.payments.service.AccountService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(AccountService.class)
class AccountServiceTest {

  @Autowired
  private AccountService service;

  private AccountRequest request() {
    AccountRequest request = new AccountRequest();
    request.setAccountNumber("ACC-TEST-0001");
    request.setHolderName("Test Holder");
    request.setCurrency("INR");
    return request;
  }

  @Test
  void createThenGet() {
    AccountResponse created = service.create(request());
    assertThat(created.getId()).isNotNull();
    assertThat(service.get(created.getId()).getAccountNumber()).isEqualTo(request().getAccountNumber());
  }

  @Test
  void duplicateIsRejected() {
    service.create(request());
    assertThrows(DuplicateResourceException.class, () -> service.create(request()));
  }

  @Test
  void updateKeepsTheId() {
    AccountResponse created = service.create(request());
    AccountResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    AccountResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(AccountResponse::getId).doesNotContain(created.getId());
  }
}
