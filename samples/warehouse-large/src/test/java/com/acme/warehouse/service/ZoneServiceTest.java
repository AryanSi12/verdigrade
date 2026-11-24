package com.acme.warehouse.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.acme.warehouse.dto.ZoneRequest;
import com.acme.warehouse.dto.ZoneResponse;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.service.ZoneService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(ZoneService.class)
class ZoneServiceTest {

  @Autowired
  private ZoneService service;

  private ZoneRequest request() {
    ZoneRequest request = new ZoneRequest();
    request.setCode("Z-TEST");
    request.setName("Cold storage");
    request.setWarehouseId(1L);
    request.setTemperatureCelsius(-18);
    return request;
  }

  @Test
  void createThenGet() {
    ZoneResponse created = service.create(request());
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
    ZoneResponse created = service.create(request());
    ZoneResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    ZoneResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(ZoneResponse::getId).doesNotContain(created.getId());
  }
}
