package com.acme.payments.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import com.acme.payments.dto.PaymentRequest;
import com.acme.payments.dto.PaymentResponse;
import com.acme.payments.exception.DuplicateResourceException;
import com.acme.payments.exception.ResourceNotFoundException;
import com.acme.payments.service.PaymentService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(PaymentService.class)
class PaymentServiceTest {

  @Autowired
  private PaymentService service;

  private PaymentRequest request() {
    PaymentRequest request = new PaymentRequest();
    request.setReference("PAY-TEST-0001");
    request.setMerchantId(1L);
    request.setAmount(new BigDecimal("1499.00"));
    request.setCurrency("INR");
    request.setStatus("AUTHORIZED");
    return request;
  }

  @Test
  void createThenGet() {
    PaymentResponse created = service.create(request());
    assertThat(created.getId()).isNotNull();
    assertThat(service.get(created.getId()).getReference()).isEqualTo(request().getReference());
  }

  @Test
  void duplicateIsRejected() {
    service.create(request());
    assertThrows(DuplicateResourceException.class, () -> service.create(request()));
  }

  @Test
  void updateKeepsTheId() {
    PaymentResponse created = service.create(request());
    PaymentResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    PaymentResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(PaymentResponse::getId).doesNotContain(created.getId());
  }
}
