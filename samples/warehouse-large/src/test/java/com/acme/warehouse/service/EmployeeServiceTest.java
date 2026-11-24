package com.acme.warehouse.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.LocalDate;
import com.acme.warehouse.dto.EmployeeRequest;
import com.acme.warehouse.dto.EmployeeResponse;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.service.EmployeeService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(EmployeeService.class)
class EmployeeServiceTest {

  @Autowired
  private EmployeeService service;

  private EmployeeRequest request() {
    EmployeeRequest request = new EmployeeRequest();
    request.setBadge("E-TEST-1");
    request.setName("Test Picker");
    request.setHiredOn(LocalDate.of(2019, 6, 3));
    request.setActive(Boolean.TRUE);
    return request;
  }

  @Test
  void createThenGet() {
    EmployeeResponse created = service.create(request());
    assertThat(created.getId()).isNotNull();
    assertThat(service.get(created.getId()).getBadge()).isEqualTo(request().getBadge());
  }

  @Test
  void duplicateIsRejected() {
    service.create(request());
    assertThrows(DuplicateResourceException.class, () -> service.create(request()));
  }

  @Test
  void updateKeepsTheId() {
    EmployeeResponse created = service.create(request());
    EmployeeResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    EmployeeResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(EmployeeResponse::getId).doesNotContain(created.getId());
  }
}
