package com.acme.warehouse.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.warehouse.dto.CustomerRequest;
import com.acme.warehouse.dto.CustomerResponse;
import com.acme.warehouse.entity.Customer;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.mapper.CustomerMapper;
import com.acme.warehouse.repository.CustomerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class CustomerService {

  private final CustomerRepository repository;

  public CustomerService(CustomerRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<CustomerResponse> list() {
    return repository.findAll().stream().map(CustomerMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public CustomerResponse get(Long id) {
    return CustomerMapper.toResponse(find(id));
  }

  public CustomerResponse create(CustomerRequest request) {
    if (repository.existsByEmailIgnoreCase(request.getEmail())) {
      throw new DuplicateResourceException("Customer " + request.getEmail() + " already exists");
    }
    Customer entity = new Customer();
    entity.setEmail(request.getEmail());
    entity.setName(request.getName());
    entity.setLoyaltyPoints(request.getLoyaltyPoints());
    return CustomerMapper.toResponse(repository.save(entity));
  }

  public CustomerResponse update(Long id, CustomerRequest request) {
    Customer entity = find(id);
    entity.setEmail(request.getEmail());
    entity.setName(request.getName());
    entity.setLoyaltyPoints(request.getLoyaltyPoints());
    return CustomerMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public Customer find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Customer", id));
  }
}
