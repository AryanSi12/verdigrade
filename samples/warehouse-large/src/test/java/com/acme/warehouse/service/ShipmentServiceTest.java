package com.acme.warehouse.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.LocalDate;
import com.acme.warehouse.dto.ShipmentRequest;
import com.acme.warehouse.dto.ShipmentResponse;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.service.ShipmentService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(ShipmentService.class)
class ShipmentServiceTest {

  @Autowired
  private ShipmentService service;

  private ShipmentRequest request() {
    ShipmentRequest request = new ShipmentRequest();
    request.setTrackingCode("TRK-TEST-0001");
    request.setCarrierId(1L);
    request.setDestination("Mumbai");
    request.setShippedOn(LocalDate.of(2020, 3, 1));
    return request;
  }

  @Test
  void createThenGet() {
    ShipmentResponse created = service.create(request());
    assertThat(created.getId()).isNotNull();
    assertThat(service.get(created.getId()).getTrackingCode()).isEqualTo(request().getTrackingCode());
  }

  @Test
  void duplicateIsRejected() {
    service.create(request());
    assertThrows(DuplicateResourceException.class, () -> service.create(request()));
  }

  @Test
  void updateKeepsTheId() {
    ShipmentResponse created = service.create(request());
    ShipmentResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    ShipmentResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(ShipmentResponse::getId).doesNotContain(created.getId());
  }
}
