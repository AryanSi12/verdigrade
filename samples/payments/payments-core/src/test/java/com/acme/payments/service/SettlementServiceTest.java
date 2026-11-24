package com.acme.payments.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.acme.payments.dto.SettlementRequest;
import com.acme.payments.dto.SettlementResponse;
import com.acme.payments.exception.DuplicateResourceException;
import com.acme.payments.exception.ResourceNotFoundException;
import com.acme.payments.service.SettlementService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(SettlementService.class)
class SettlementServiceTest {

  @Autowired
  private SettlementService service;

  private SettlementRequest request() {
    SettlementRequest request = new SettlementRequest();
    request.setBatchId("BATCH-TEST-1");
    request.setSettledOn(LocalDate.of(2026, 1, 31));
    request.setTotalAmount(new BigDecimal("98765.50"));
    return request;
  }

  @Test
  void createThenGet() {
    SettlementResponse created = service.create(request());
    assertThat(created.getId()).isNotNull();
    assertThat(service.get(created.getId()).getBatchId()).isEqualTo(request().getBatchId());
  }

  @Test
  void duplicateIsRejected() {
    service.create(request());
    assertThrows(DuplicateResourceException.class, () -> service.create(request()));
  }

  @Test
  void updateKeepsTheId() {
    SettlementResponse created = service.create(request());
    SettlementResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    SettlementResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(SettlementResponse::getId).doesNotContain(created.getId());
  }
}
