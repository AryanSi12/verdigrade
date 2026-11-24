package com.acme.warehouse.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.warehouse.dto.StockMovementRequest;
import com.acme.warehouse.dto.StockMovementResponse;
import com.acme.warehouse.entity.StockMovement;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.mapper.StockMovementMapper;
import com.acme.warehouse.repository.StockMovementRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class StockMovementService {

  private final StockMovementRepository repository;

  public StockMovementService(StockMovementRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<StockMovementResponse> list() {
    return repository.findAll().stream().map(StockMovementMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public StockMovementResponse get(Long id) {
    return StockMovementMapper.toResponse(find(id));
  }

  public StockMovementResponse create(StockMovementRequest request) {
    if (repository.existsByReferenceIgnoreCase(request.getReference())) {
      throw new DuplicateResourceException("StockMovement " + request.getReference() + " already exists");
    }
    StockMovement entity = new StockMovement();
    entity.setReference(request.getReference());
    entity.setProductId(request.getProductId());
    entity.setQuantity(request.getQuantity());
    entity.setKind(request.getKind());
    return StockMovementMapper.toResponse(repository.save(entity));
  }

  public StockMovementResponse update(Long id, StockMovementRequest request) {
    StockMovement entity = find(id);
    entity.setReference(request.getReference());
    entity.setProductId(request.getProductId());
    entity.setQuantity(request.getQuantity());
    entity.setKind(request.getKind());
    return StockMovementMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public StockMovement find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("StockMovement", id));
  }
}
