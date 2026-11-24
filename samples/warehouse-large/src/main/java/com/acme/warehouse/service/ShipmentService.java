package com.acme.warehouse.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.warehouse.dto.ShipmentRequest;
import com.acme.warehouse.dto.ShipmentResponse;
import com.acme.warehouse.entity.Shipment;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.mapper.ShipmentMapper;
import com.acme.warehouse.repository.ShipmentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ShipmentService {

  private final ShipmentRepository repository;

  public ShipmentService(ShipmentRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<ShipmentResponse> list() {
    return repository.findAll().stream().map(ShipmentMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public ShipmentResponse get(Long id) {
    return ShipmentMapper.toResponse(find(id));
  }

  public ShipmentResponse create(ShipmentRequest request) {
    if (repository.existsByTrackingCodeIgnoreCase(request.getTrackingCode())) {
      throw new DuplicateResourceException("Shipment " + request.getTrackingCode() + " already exists");
    }
    Shipment entity = new Shipment();
    entity.setTrackingCode(request.getTrackingCode());
    entity.setCarrierId(request.getCarrierId());
    entity.setDestination(request.getDestination());
    entity.setShippedOn(request.getShippedOn());
    return ShipmentMapper.toResponse(repository.save(entity));
  }

  public ShipmentResponse update(Long id, ShipmentRequest request) {
    Shipment entity = find(id);
    entity.setTrackingCode(request.getTrackingCode());
    entity.setCarrierId(request.getCarrierId());
    entity.setDestination(request.getDestination());
    entity.setShippedOn(request.getShippedOn());
    return ShipmentMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public Shipment find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Shipment", id));
  }
}
