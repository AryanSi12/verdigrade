package com.acme.warehouse.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.warehouse.dto.WarehouseRequest;
import com.acme.warehouse.dto.WarehouseResponse;
import com.acme.warehouse.entity.Warehouse;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.mapper.WarehouseMapper;
import com.acme.warehouse.repository.WarehouseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class WarehouseService {

  private final WarehouseRepository repository;

  public WarehouseService(WarehouseRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<WarehouseResponse> list() {
    return repository.findAll().stream().map(WarehouseMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public WarehouseResponse get(Long id) {
    return WarehouseMapper.toResponse(find(id));
  }

  public WarehouseResponse create(WarehouseRequest request) {
    if (repository.existsByCodeIgnoreCase(request.getCode())) {
      throw new DuplicateResourceException("Warehouse " + request.getCode() + " already exists");
    }
    Warehouse entity = new Warehouse();
    entity.setCode(request.getCode());
    entity.setName(request.getName());
    entity.setCity(request.getCity());
    entity.setCapacity(request.getCapacity());
    return WarehouseMapper.toResponse(repository.save(entity));
  }

  public WarehouseResponse update(Long id, WarehouseRequest request) {
    Warehouse entity = find(id);
    entity.setCode(request.getCode());
    entity.setName(request.getName());
    entity.setCity(request.getCity());
    entity.setCapacity(request.getCapacity());
    return WarehouseMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public Warehouse find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Warehouse", id));
  }
}
