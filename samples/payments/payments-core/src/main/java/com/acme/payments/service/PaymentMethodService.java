package com.acme.payments.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.payments.dto.PaymentMethodRequest;
import com.acme.payments.dto.PaymentMethodResponse;
import com.acme.payments.entity.PaymentMethod;
import com.acme.payments.exception.DuplicateResourceException;
import com.acme.payments.exception.ResourceNotFoundException;
import com.acme.payments.mapper.PaymentMethodMapper;
import com.acme.payments.repository.PaymentMethodRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class PaymentMethodService {

  private final PaymentMethodRepository repository;

  public PaymentMethodService(PaymentMethodRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<PaymentMethodResponse> list() {
    return repository.findAll().stream().map(PaymentMethodMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public PaymentMethodResponse get(Long id) {
    return PaymentMethodMapper.toResponse(find(id));
  }

  public PaymentMethodResponse create(PaymentMethodRequest request) {
    if (repository.existsByTokenIgnoreCase(request.getToken())) {
      throw new DuplicateResourceException("PaymentMethod " + request.getToken() + " already exists");
    }
    PaymentMethod entity = new PaymentMethod();
    entity.setToken(request.getToken());
    entity.setBrand(request.getBrand());
    entity.setLast4(request.getLast4());
    entity.setExpiryYear(request.getExpiryYear());
    return PaymentMethodMapper.toResponse(repository.save(entity));
  }

  public PaymentMethodResponse update(Long id, PaymentMethodRequest request) {
    PaymentMethod entity = find(id);
    entity.setToken(request.getToken());
    entity.setBrand(request.getBrand());
    entity.setLast4(request.getLast4());
    entity.setExpiryYear(request.getExpiryYear());
    return PaymentMethodMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public PaymentMethod find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("PaymentMethod", id));
  }
}
