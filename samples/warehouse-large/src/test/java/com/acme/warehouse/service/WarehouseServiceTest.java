package com.acme.warehouse.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.acme.warehouse.dto.WarehouseRequest;
import com.acme.warehouse.dto.WarehouseResponse;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.service.WarehouseService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(WarehouseService.class)
class WarehouseServiceTest {

  @Autowired
  private WarehouseService service;

  private WarehouseRequest request() {
    WarehouseRequest request = new WarehouseRequest();
    request.setCode("WH-TEST");
    request.setName("Test Warehouse");
    request.setCity("Pune");
    request.setCapacity(5000);
    return request;
  }

  @Test
  void createThenGet() {
    WarehouseResponse created = service.create(request());
    assertThat(created.getId()).isNotNull();
    assertThat(service.get(created.getId()).getCode()).isEqualTo(request().getCode());
  }

  @Test
  void duplicateIsRejected() {
    service.create(request());
    assertThrows(DuplicateResourceException.class, () -> service.create(request()));
  }

  @Test
  void updateKeepsTheId() {
    WarehouseResponse created = service.create(request());
    WarehouseResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    WarehouseResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(WarehouseResponse::getId).doesNotContain(created.getId());
  }
}
