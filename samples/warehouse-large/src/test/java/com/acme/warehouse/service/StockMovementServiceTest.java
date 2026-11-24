package com.acme.warehouse.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.acme.warehouse.dto.StockMovementRequest;
import com.acme.warehouse.dto.StockMovementResponse;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.service.StockMovementService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(StockMovementService.class)
class StockMovementServiceTest {

  @Autowired
  private StockMovementService service;

  private StockMovementRequest request() {
    StockMovementRequest request = new StockMovementRequest();
    request.setReference("MV-TEST-0001");
    request.setProductId(1L);
    request.setQuantity(15);
    request.setKind("IN");
    return request;
  }

  @Test
  void createThenGet() {
    StockMovementResponse created = service.create(request());
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
    StockMovementResponse created = service.create(request());
    StockMovementResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    StockMovementResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(StockMovementResponse::getId).doesNotContain(created.getId());
  }
}
