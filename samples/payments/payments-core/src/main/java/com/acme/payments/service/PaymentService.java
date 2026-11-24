package com.acme.payments.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.payments.dto.PaymentRequest;
import com.acme.payments.dto.PaymentResponse;
import com.acme.payments.entity.Payment;
import com.acme.payments.exception.DuplicateResourceException;
import com.acme.payments.exception.ResourceNotFoundException;
import com.acme.payments.mapper.PaymentMapper;
import com.acme.payments.repository.PaymentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class PaymentService {

  private final PaymentRepository repository;

  public PaymentService(PaymentRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<PaymentResponse> list() {
    return repository.findAll().stream().map(PaymentMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public PaymentResponse get(Long id) {
    return PaymentMapper.toResponse(find(id));
  }

  public PaymentResponse create(PaymentRequest request) {
    if (repository.existsByReferenceIgnoreCase(request.getReference())) {
      throw new DuplicateResourceException("Payment " + request.getReference() + " already exists");
    }
    Payment entity = new Payment();
    entity.setReference(request.getReference());
    entity.setMerchantId(request.getMerchantId());
    entity.setAmount(request.getAmount());
    entity.setCurrency(request.getCurrency());
    entity.setStatus(request.getStatus());
    return PaymentMapper.toResponse(repository.save(entity));
  }

  public PaymentResponse update(Long id, PaymentRequest request) {
    Payment entity = find(id);
    entity.setReference(request.getReference());
    entity.setMerchantId(request.getMerchantId());
    entity.setAmount(request.getAmount());
    entity.setCurrency(request.getCurrency());
    entity.setStatus(request.getStatus());
    return PaymentMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public Payment find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Payment", id));
  }
}
