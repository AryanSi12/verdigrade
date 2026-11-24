package com.acme.tickets.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.tickets.dto.CustomerRequest;
import com.acme.tickets.dto.CustomerResponse;
import com.acme.tickets.entity.Customer;
import com.acme.tickets.exception.DuplicateResourceException;
import com.acme.tickets.exception.ResourceNotFoundException;
import com.acme.tickets.mapper.CustomerMapper;
import com.acme.tickets.repository.CustomerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class CustomerService {

  private final CustomerRepository customers;

  public CustomerService(CustomerRepository customers) {
    this.customers = customers;
  }

  @Transactional(readOnly = true)
  public List<CustomerResponse> list() {
    return customers.findAll().stream().map(CustomerMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public CustomerResponse get(Long id) {
    return CustomerMapper.toResponse(find(id));
  }

  public CustomerResponse create(CustomerRequest request) {
    if (customers.existsByEmailIgnoreCase(request.getEmail())) {
      throw new DuplicateResourceException("E-mail " + request.getEmail() + " is already registered");
    }
    Customer customer = new Customer();
    customer.setName(request.getName());
    customer.setEmail(request.getEmail().toLowerCase());
    return CustomerMapper.toResponse(customers.save(customer));
  }

  public Customer find(Long id) {
    return customers.findById(id).orElseThrow(() -> new ResourceNotFoundException("Customer", id));
  }
}
