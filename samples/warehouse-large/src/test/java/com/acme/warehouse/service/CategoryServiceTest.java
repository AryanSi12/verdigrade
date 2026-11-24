package com.acme.warehouse.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.acme.warehouse.dto.CategoryRequest;
import com.acme.warehouse.dto.CategoryResponse;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.service.CategoryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(CategoryService.class)
class CategoryServiceTest {

  @Autowired
  private CategoryService service;

  private CategoryRequest request() {
    CategoryRequest request = new CategoryRequest();
    request.setName("Test category");
    request.setDescription("For tests");
    return request;
  }

  @Test
  void createThenGet() {
    CategoryResponse created = service.create(request());
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
    CategoryResponse created = service.create(request());
    CategoryResponse updated = service.update(created.getId(), request());
    assertThat(updated.getId()).isEqualTo(created.getId());
  }

  @Test
  void missingRowIsNotFound() {
    assertThrows(ResourceNotFoundException.class, () -> service.get(987654L));
  }

  @Test
  void deleteRemovesTheRow() {
    CategoryResponse created = service.create(request());
    service.delete(created.getId());
    assertThat(service.list()).extracting(CategoryResponse::getId).doesNotContain(created.getId());
  }
}
