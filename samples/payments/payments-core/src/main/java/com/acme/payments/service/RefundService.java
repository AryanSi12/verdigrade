package com.acme.payments.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.payments.dto.RefundRequest;
import com.acme.payments.dto.RefundResponse;
import com.acme.payments.entity.Refund;
import com.acme.payments.exception.DuplicateResourceException;
import com.acme.payments.exception.ResourceNotFoundException;
import com.acme.payments.mapper.RefundMapper;
import com.acme.payments.repository.RefundRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class RefundService {

  private final RefundRepository repository;

  public RefundService(RefundRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<RefundResponse> list() {
    return repository.findAll().stream().map(RefundMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public RefundResponse get(Long id) {
    return RefundMapper.toResponse(find(id));
  }

  public RefundResponse create(RefundRequest request) {
    if (repository.existsByReferenceIgnoreCase(request.getReference())) {
      throw new DuplicateResourceException("Refund " + request.getReference() + " already exists");
    }
    Refund entity = new Refund();
    entity.setReference(request.getReference());
    entity.setPaymentId(request.getPaymentId());
    entity.setAmount(request.getAmount());
    entity.setReason(request.getReason());
    return RefundMapper.toResponse(repository.save(entity));
  }

  public RefundResponse update(Long id, RefundRequest request) {
    Refund entity = find(id);
    entity.setReference(request.getReference());
    entity.setPaymentId(request.getPaymentId());
    entity.setAmount(request.getAmount());
    entity.setReason(request.getReason());
    return RefundMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public Refund find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Refund", id));
  }
}
