package com.acme.warehouse.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.warehouse.dto.CarrierRequest;
import com.acme.warehouse.dto.CarrierResponse;
import com.acme.warehouse.entity.Carrier;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.mapper.CarrierMapper;
import com.acme.warehouse.repository.CarrierRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class CarrierService {

  private final CarrierRepository repository;

  public CarrierService(CarrierRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<CarrierResponse> list() {
    return repository.findAll().stream().map(CarrierMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public CarrierResponse get(Long id) {
    return CarrierMapper.toResponse(find(id));
  }

  public CarrierResponse create(CarrierRequest request) {
    if (repository.existsByNameIgnoreCase(request.getName())) {
      throw new DuplicateResourceException("Carrier " + request.getName() + " already exists");
    }
    Carrier entity = new Carrier();
    entity.setName(request.getName());
    entity.setScacCode(request.getScacCode());
    return CarrierMapper.toResponse(repository.save(entity));
  }

  public CarrierResponse update(Long id, CarrierRequest request) {
    Carrier entity = find(id);
    entity.setName(request.getName());
    entity.setScacCode(request.getScacCode());
    return CarrierMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public Carrier find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Carrier", id));
  }
}
