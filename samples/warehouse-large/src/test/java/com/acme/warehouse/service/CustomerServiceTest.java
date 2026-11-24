package com.acme.warehouse.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.acme.warehouse.dto.CustomerRequest;
import com.acme.warehouse.dto.CustomerResponse;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.service.CustomerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(CustomerService.class)
class CustomerServiceTest {

  @Autowired
  private CustomerService service;

  private CustomerRequest request() {
    CustomerRequest request = new CustomerRequest();
    request.setEmail("buyer@test-customer.example");
    request.setName("Test Buyer");
    request.setLoyaltyPoints(0);
    return request;
  }

  @Test
  void createThenGet() {
    CustomerResponse created = service.create(request());
    assertThat(created.getId()).isNotNull();
    assertThat(service.get(created.getId()).getEmail()).isEqualTo(request().getEmail());
  }

  @Test
  void duplicateIsRejected() {
    service.create(request());
    assertThrows(DuplicateResourceException.class, () -> service.create(request()));
  }

  @Test
  void updateKeepsTheId() {
    CustomerResponse created = service.create(request());
    CustomerResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    CustomerResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(CustomerResponse::getId).doesNotContain(created.getId());
  }
}
