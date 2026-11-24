package com.acme.warehouse.controller;

import java.util.List;
import com.acme.warehouse.dto.CategoryRequest;
import com.acme.warehouse.dto.CategoryResponse;
import com.acme.warehouse.service.CategoryService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/categories")
public class CategoryController {

  private final CategoryService service;

  public CategoryController(CategoryService service) {
    this.service = service;
  }

  @GetMapping
  public List<CategoryResponse> list() {
    return service.list();
  }

  @GetMapping("/{id}")
  public CategoryResponse get(@PathVariable("id") Long id) {
    return service.get(id);
  }

  @PostMapping
  public ResponseEntity<CategoryResponse> create(@Valid @RequestBody CategoryRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
  }

  @PutMapping("/{id}")
  public CategoryResponse update(@PathVariable("id") Long id, @Valid @RequestBody CategoryRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
  }
}
