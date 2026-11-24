package com.acme.warehouse.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.acme.warehouse.dto.CarrierRequest;
import com.acme.warehouse.dto.CarrierResponse;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.service.CarrierService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(CarrierService.class)
class CarrierServiceTest {

  @Autowired
  private CarrierService service;

  private CarrierRequest request() {
    CarrierRequest request = new CarrierRequest();
    request.setName("Test Freight");
    request.setScacCode("TFRT");
    return request;
  }

  @Test
  void createThenGet() {
    CarrierResponse created = service.create(request());
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
    CarrierResponse created = service.create(request());
    CarrierResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    CarrierResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(CarrierResponse::getId).doesNotContain(created.getId());
  }
}
