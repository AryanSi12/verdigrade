package com.acme.payments.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.acme.payments.dto.PaymentMethodRequest;
import com.acme.payments.dto.PaymentMethodResponse;
import com.acme.payments.exception.DuplicateResourceException;
import com.acme.payments.exception.ResourceNotFoundException;
import com.acme.payments.service.PaymentMethodService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(PaymentMethodService.class)
class PaymentMethodServiceTest {

  @Autowired
  private PaymentMethodService service;

  private PaymentMethodRequest request() {
    PaymentMethodRequest request = new PaymentMethodRequest();
    request.setToken("tok_test_0001");
    request.setBrand("VISA");
    request.setLast4("4242");
    request.setExpiryYear(2030);
    return request;
  }

  @Test
  void createThenGet() {
    PaymentMethodResponse created = service.create(request());
    assertThat(created.getId()).isNotNull();
    assertThat(service.get(created.getId()).getToken()).isEqualTo(request().getToken());
  }

  @Test
  void duplicateIsRejected() {
    service.create(request());
    assertThrows(DuplicateResourceException.class, () -> service.create(request()));
  }

  @Test
  void updateKeepsTheId() {
    PaymentMethodResponse created = service.create(request());
    PaymentMethodResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    PaymentMethodResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(PaymentMethodResponse::getId).doesNotContain(created.getId());
  }
}
