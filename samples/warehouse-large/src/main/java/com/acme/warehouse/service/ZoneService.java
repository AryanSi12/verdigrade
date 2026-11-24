package com.acme.warehouse.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.warehouse.dto.ZoneRequest;
import com.acme.warehouse.dto.ZoneResponse;
import com.acme.warehouse.entity.Zone;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.mapper.ZoneMapper;
import com.acme.warehouse.repository.ZoneRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ZoneService {

  private final ZoneRepository repository;

  public ZoneService(ZoneRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<ZoneResponse> list() {
    return repository.findAll().stream().map(ZoneMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public ZoneResponse get(Long id) {
    return ZoneMapper.toResponse(find(id));
  }

  public ZoneResponse create(ZoneRequest request) {
    if (repository.existsByCodeIgnoreCase(request.getCode())) {
      throw new DuplicateResourceException("Zone " + request.getCode() + " already exists");
    }
    Zone entity = new Zone();
    entity.setCode(request.getCode());
    entity.setName(request.getName());
    entity.setWarehouseId(request.getWarehouseId());
    entity.setTemperatureCelsius(request.getTemperatureCelsius());
    return ZoneMapper.toResponse(repository.save(entity));
  }

  public ZoneResponse update(Long id, ZoneRequest request) {
    Zone entity = find(id);
    entity.setCode(request.getCode());
    entity.setName(request.getName());
    entity.setWarehouseId(request.getWarehouseId());
    entity.setTemperatureCelsius(request.getTemperatureCelsius());
    return ZoneMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public Zone find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Zone", id));
  }
}
