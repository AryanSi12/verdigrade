package com.acme.payments.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.payments.dto.DisputeRequest;
import com.acme.payments.dto.DisputeResponse;
import com.acme.payments.entity.Dispute;
import com.acme.payments.exception.DuplicateResourceException;
import com.acme.payments.exception.ResourceNotFoundException;
import com.acme.payments.mapper.DisputeMapper;
import com.acme.payments.repository.DisputeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class DisputeService {

  private final DisputeRepository repository;

  public DisputeService(DisputeRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<DisputeResponse> list() {
    return repository.findAll().stream().map(DisputeMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public DisputeResponse get(Long id) {
    return DisputeMapper.toResponse(find(id));
  }

  public DisputeResponse create(DisputeRequest request) {
    if (repository.existsByCaseNumberIgnoreCase(request.getCaseNumber())) {
      throw new DuplicateResourceException("Dispute " + request.getCaseNumber() + " already exists");
    }
    Dispute entity = new Dispute();
    entity.setCaseNumber(request.getCaseNumber());
    entity.setPaymentId(request.getPaymentId());
    entity.setReason(request.getReason());
    entity.setOpenedOn(request.getOpenedOn());
    return DisputeMapper.toResponse(repository.save(entity));
  }

  public DisputeResponse update(Long id, DisputeRequest request) {
    Dispute entity = find(id);
    entity.setCaseNumber(request.getCaseNumber());
    entity.setPaymentId(request.getPaymentId());
    entity.setReason(request.getReason());
    entity.setOpenedOn(request.getOpenedOn());
    return DisputeMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public Dispute find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Dispute", id));
  }
}
