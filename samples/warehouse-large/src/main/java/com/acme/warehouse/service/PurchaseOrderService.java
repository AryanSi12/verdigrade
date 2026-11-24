package com.acme.warehouse.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.warehouse.dto.PurchaseOrderRequest;
import com.acme.warehouse.dto.PurchaseOrderResponse;
import com.acme.warehouse.entity.PurchaseOrder;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.mapper.PurchaseOrderMapper;
import com.acme.warehouse.repository.PurchaseOrderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class PurchaseOrderService {

  private final PurchaseOrderRepository repository;

  public PurchaseOrderService(PurchaseOrderRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<PurchaseOrderResponse> list() {
    return repository.findAll().stream().map(PurchaseOrderMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public PurchaseOrderResponse get(Long id) {
    return PurchaseOrderMapper.toResponse(find(id));
  }

  public PurchaseOrderResponse create(PurchaseOrderRequest request) {
    if (repository.existsByOrderNumberIgnoreCase(request.getOrderNumber())) {
      throw new DuplicateResourceException("PurchaseOrder " + request.getOrderNumber() + " already exists");
    }
    PurchaseOrder entity = new PurchaseOrder();
    entity.setOrderNumber(request.getOrderNumber());
    entity.setSupplierId(request.getSupplierId());
    entity.setExpectedOn(request.getExpectedOn());
    entity.setQuantity(request.getQuantity());
    return PurchaseOrderMapper.toResponse(repository.save(entity));
  }

  public PurchaseOrderResponse update(Long id, PurchaseOrderRequest request) {
    PurchaseOrder entity = find(id);
    entity.setOrderNumber(request.getOrderNumber());
    entity.setSupplierId(request.getSupplierId());
    entity.setExpectedOn(request.getExpectedOn());
    entity.setQuantity(request.getQuantity());
    return PurchaseOrderMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public PurchaseOrder find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("PurchaseOrder", id));
  }
}
