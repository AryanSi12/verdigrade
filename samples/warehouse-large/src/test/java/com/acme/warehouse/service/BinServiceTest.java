package com.acme.warehouse.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import com.acme.warehouse.dto.BinRequest;
import com.acme.warehouse.dto.BinResponse;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.service.BinService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(BinService.class)
class BinServiceTest {

  @Autowired
  private BinService service;

  private BinRequest request() {
    BinRequest request = new BinRequest();
    request.setLabel("A-01-TEST");
    request.setZoneId(1L);
    request.setMaxWeightKg(new BigDecimal("250.5"));
    return request;
  }

  @Test
  void createThenGet() {
    BinResponse created = service.create(request());
    assertThat(created.getId()).isNotNull();
    assertThat(service.get(created.getId()).getLabel()).isEqualTo(request().getLabel());
  }

  @Test
  void duplicateIsRejected() {
    service.create(request());
    assertThrows(DuplicateResourceException.class, () -> service.create(request()));
  }

  @Test
  void updateKeepsTheId() {
    BinResponse created = service.create(request());
    BinResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    BinResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(BinResponse::getId).doesNotContain(created.getId());
  }
}
