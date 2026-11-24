package com.acme.warehouse.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.LocalDate;
import com.acme.warehouse.dto.PurchaseOrderRequest;
import com.acme.warehouse.dto.PurchaseOrderResponse;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.service.PurchaseOrderService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(PurchaseOrderService.class)
class PurchaseOrderServiceTest {

  @Autowired
  private PurchaseOrderService service;

  private PurchaseOrderRequest request() {
    PurchaseOrderRequest request = new PurchaseOrderRequest();
    request.setOrderNumber("PO-TEST-0001");
    request.setSupplierId(1L);
    request.setExpectedOn(LocalDate.of(2099, 1, 15));
    request.setQuantity(120);
    return request;
  }

  @Test
  void createThenGet() {
    PurchaseOrderResponse created = service.create(request());
    assertThat(created.getId()).isNotNull();
    assertThat(service.get(created.getId()).getOrderNumber()).isEqualTo(request().getOrderNumber());
  }

  @Test
  void duplicateIsRejected() {
    service.create(request());
    assertThrows(DuplicateResourceException.class, () -> service.create(request()));
  }

  @Test
  void updateKeepsTheId() {
    PurchaseOrderResponse created = service.create(request());
    PurchaseOrderResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    PurchaseOrderResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(PurchaseOrderResponse::getId).doesNotContain(created.getId());
  }
}
