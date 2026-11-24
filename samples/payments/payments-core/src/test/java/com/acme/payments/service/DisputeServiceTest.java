package com.acme.payments.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.LocalDate;
import com.acme.payments.dto.DisputeRequest;
import com.acme.payments.dto.DisputeResponse;
import com.acme.payments.exception.DuplicateResourceException;
import com.acme.payments.exception.ResourceNotFoundException;
import com.acme.payments.service.DisputeService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(DisputeService.class)
class DisputeServiceTest {

  @Autowired
  private DisputeService service;

  private DisputeRequest request() {
    DisputeRequest request = new DisputeRequest();
    request.setCaseNumber("CASE-TEST-1");
    request.setPaymentId(1L);
    request.setReason("Item not received");
    request.setOpenedOn(LocalDate.of(2026, 2, 2));
    return request;
  }

  @Test
  void createThenGet() {
    DisputeResponse created = service.create(request());
    assertThat(created.getId()).isNotNull();
    assertThat(service.get(created.getId()).getCaseNumber()).isEqualTo(request().getCaseNumber());
  }

  @Test
  void duplicateIsRejected() {
    service.create(request());
    assertThrows(DuplicateResourceException.class, () -> service.create(request()));
  }

  @Test
  void updateKeepsTheId() {
    DisputeResponse created = service.create(request());
    DisputeResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    DisputeResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(DisputeResponse::getId).doesNotContain(created.getId());
  }
}
