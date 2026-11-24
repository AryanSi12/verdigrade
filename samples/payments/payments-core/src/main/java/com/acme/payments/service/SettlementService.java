package com.acme.payments.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.payments.dto.SettlementRequest;
import com.acme.payments.dto.SettlementResponse;
import com.acme.payments.entity.Settlement;
import com.acme.payments.exception.DuplicateResourceException;
import com.acme.payments.exception.ResourceNotFoundException;
import com.acme.payments.mapper.SettlementMapper;
import com.acme.payments.repository.SettlementRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class SettlementService {

  private final SettlementRepository repository;

  public SettlementService(SettlementRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<SettlementResponse> list() {
    return repository.findAll().stream().map(SettlementMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public SettlementResponse get(Long id) {
    return SettlementMapper.toResponse(find(id));
  }

  public SettlementResponse create(SettlementRequest request) {
    if (repository.existsByBatchIdIgnoreCase(request.getBatchId())) {
      throw new DuplicateResourceException("Settlement " + request.getBatchId() + " already exists");
    }
    Settlement entity = new Settlement();
    entity.setBatchId(request.getBatchId());
    entity.setSettledOn(request.getSettledOn());
    entity.setTotalAmount(request.getTotalAmount());
    return SettlementMapper.toResponse(repository.save(entity));
  }

  public SettlementResponse update(Long id, SettlementRequest request) {
    Settlement entity = find(id);
    entity.setBatchId(request.getBatchId());
    entity.setSettledOn(request.getSettledOn());
    entity.setTotalAmount(request.getTotalAmount());
    return SettlementMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public Settlement find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Settlement", id));
  }
}
