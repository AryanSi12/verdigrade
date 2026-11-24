package com.acme.warehouse.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.acme.warehouse.dto.SupplierRequest;
import com.acme.warehouse.dto.SupplierResponse;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.service.SupplierService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(SupplierService.class)
class SupplierServiceTest {

  @Autowired
  private SupplierService service;

  private SupplierRequest request() {
    SupplierRequest request = new SupplierRequest();
    request.setName("Test Supplies Ltd");
    request.setEmail("orders@test-supplies.example");
    request.setPhone("+91 20 5550 0100");
    request.setRating(4);
    return request;
  }

  @Test
  void createThenGet() {
    SupplierResponse created = service.create(request());
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
    SupplierResponse created = service.create(request());
    SupplierResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    SupplierResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(SupplierResponse::getId).doesNotContain(created.getId());
  }
}
