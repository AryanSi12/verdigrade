package com.acme.payments.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.payments.dto.MerchantRequest;
import com.acme.payments.dto.MerchantResponse;
import com.acme.payments.entity.Merchant;
import com.acme.payments.exception.DuplicateResourceException;
import com.acme.payments.exception.ResourceNotFoundException;
import com.acme.payments.mapper.MerchantMapper;
import com.acme.payments.repository.MerchantRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class MerchantService {

  private final MerchantRepository repository;

  public MerchantService(MerchantRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<MerchantResponse> list() {
    return repository.findAll().stream().map(MerchantMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public MerchantResponse get(Long id) {
    return MerchantMapper.toResponse(find(id));
  }

  public MerchantResponse create(MerchantRequest request) {
    if (repository.existsByNameIgnoreCase(request.getName())) {
      throw new DuplicateResourceException("Merchant " + request.getName() + " already exists");
    }
    Merchant entity = new Merchant();
    entity.setName(request.getName());
    entity.setEmail(request.getEmail());
    entity.setCountryCode(request.getCountryCode());
    return MerchantMapper.toResponse(repository.save(entity));
  }

  public MerchantResponse update(Long id, MerchantRequest request) {
    Merchant entity = find(id);
    entity.setName(request.getName());
    entity.setEmail(request.getEmail());
    entity.setCountryCode(request.getCountryCode());
    return MerchantMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public Merchant find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Merchant", id));
  }
}
