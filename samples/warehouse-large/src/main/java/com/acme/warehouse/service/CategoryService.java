package com.acme.warehouse.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.warehouse.dto.CategoryRequest;
import com.acme.warehouse.dto.CategoryResponse;
import com.acme.warehouse.entity.Category;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.mapper.CategoryMapper;
import com.acme.warehouse.repository.CategoryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class CategoryService {

  private final CategoryRepository repository;

  public CategoryService(CategoryRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<CategoryResponse> list() {
    return repository.findAll().stream().map(CategoryMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public CategoryResponse get(Long id) {
    return CategoryMapper.toResponse(find(id));
  }

  public CategoryResponse create(CategoryRequest request) {
    if (repository.existsByNameIgnoreCase(request.getName())) {
      throw new DuplicateResourceException("Category " + request.getName() + " already exists");
    }
    Category entity = new Category();
    entity.setName(request.getName());
    entity.setDescription(request.getDescription());
    return CategoryMapper.toResponse(repository.save(entity));
  }

  public CategoryResponse update(Long id, CategoryRequest request) {
    Category entity = find(id);
    entity.setName(request.getName());
    entity.setDescription(request.getDescription());
    return CategoryMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public Category find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Category", id));
  }
}
