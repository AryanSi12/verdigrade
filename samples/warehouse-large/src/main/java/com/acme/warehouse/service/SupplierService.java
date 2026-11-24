package com.acme.warehouse.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.warehouse.dto.SupplierRequest;
import com.acme.warehouse.dto.SupplierResponse;
import com.acme.warehouse.entity.Supplier;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.mapper.SupplierMapper;
import com.acme.warehouse.repository.SupplierRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class SupplierService {

  private final SupplierRepository repository;

  public SupplierService(SupplierRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<SupplierResponse> list() {
    return repository.findAll().stream().map(SupplierMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public SupplierResponse get(Long id) {
    return SupplierMapper.toResponse(find(id));
  }

  public SupplierResponse create(SupplierRequest request) {
    if (repository.existsByNameIgnoreCase(request.getName())) {
      throw new DuplicateResourceException("Supplier " + request.getName() + " already exists");
    }
    Supplier entity = new Supplier();
    entity.setName(request.getName());
    entity.setEmail(request.getEmail());
    entity.setPhone(request.getPhone());
    entity.setRating(request.getRating());
    return SupplierMapper.toResponse(repository.save(entity));
  }

  public SupplierResponse update(Long id, SupplierRequest request) {
    Supplier entity = find(id);
    entity.setName(request.getName());
    entity.setEmail(request.getEmail());
    entity.setPhone(request.getPhone());
    entity.setRating(request.getRating());
    return SupplierMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public Supplier find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Supplier", id));
  }
}
