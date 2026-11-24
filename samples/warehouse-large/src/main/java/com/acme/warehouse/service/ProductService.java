package com.acme.warehouse.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.warehouse.dto.ProductRequest;
import com.acme.warehouse.dto.ProductResponse;
import com.acme.warehouse.entity.Product;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.mapper.ProductMapper;
import com.acme.warehouse.repository.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ProductService {

  private final ProductRepository repository;

  public ProductService(ProductRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<ProductResponse> list() {
    return repository.findAll().stream().map(ProductMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public ProductResponse get(Long id) {
    return ProductMapper.toResponse(find(id));
  }

  public ProductResponse create(ProductRequest request) {
    if (repository.existsBySkuIgnoreCase(request.getSku())) {
      throw new DuplicateResourceException("Product " + request.getSku() + " already exists");
    }
    Product entity = new Product();
    entity.setSku(request.getSku());
    entity.setName(request.getName());
    entity.setCategoryId(request.getCategoryId());
    entity.setUnitPrice(request.getUnitPrice());
    entity.setReorderLevel(request.getReorderLevel());
    return ProductMapper.toResponse(repository.save(entity));
  }

  public ProductResponse update(Long id, ProductRequest request) {
    Product entity = find(id);
    entity.setSku(request.getSku());
    entity.setName(request.getName());
    entity.setCategoryId(request.getCategoryId());
    entity.setUnitPrice(request.getUnitPrice());
    entity.setReorderLevel(request.getReorderLevel());
    return ProductMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public Product find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Product", id));
  }
}
