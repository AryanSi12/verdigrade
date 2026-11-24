package com.acme.payments.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import com.acme.payments.dto.RefundRequest;
import com.acme.payments.dto.RefundResponse;
import com.acme.payments.exception.DuplicateResourceException;
import com.acme.payments.exception.ResourceNotFoundException;
import com.acme.payments.service.RefundService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(RefundService.class)
class RefundServiceTest {

  @Autowired
  private RefundService service;

  private RefundRequest request() {
    RefundRequest request = new RefundRequest();
    request.setReference("RF-TEST-0001");
    request.setPaymentId(1L);
    request.setAmount(new BigDecimal("100.00"));
    request.setReason("Customer request");
    return request;
  }

  @Test
  void createThenGet() {
    RefundResponse created = service.create(request());
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
    RefundResponse created = service.create(request());
    RefundResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    RefundResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(RefundResponse::getId).doesNotContain(created.getId());
  }
}
