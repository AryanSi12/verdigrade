package com.acme.warehouse.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import com.acme.warehouse.dto.ProductRequest;
import com.acme.warehouse.dto.ProductResponse;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.service.ProductService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(ProductService.class)
class ProductServiceTest {

  @Autowired
  private ProductService service;

  private ProductRequest request() {
    ProductRequest request = new ProductRequest();
    request.setSku("SKU-TEST-001");
    request.setName("Test pallet jack");
    request.setCategoryId(1L);
    request.setUnitPrice(new BigDecimal("49.90"));
    request.setReorderLevel(10);
    return request;
  }

  @Test
  void createThenGet() {
    ProductResponse created = service.create(request());
    assertThat(created.getId()).isNotNull();
    assertThat(service.get(created.getId()).getSku()).isEqualTo(request().getSku());
  }

  @Test
  void duplicateIsRejected() {
    service.create(request());
    assertThrows(DuplicateResourceException.class, () -> service.create(request()));
  }

  @Test
  void updateKeepsTheId() {
    ProductResponse created = service.create(request());
    ProductResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    ProductResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(ProductResponse::getId).doesNotContain(created.getId());
  }
}
