package com.acme.tickets.mapper;

import com.acme.tickets.dto.CustomerResponse;
import com.acme.tickets.entity.Customer;

public final class CustomerMapper {

  private CustomerMapper() {
  }

  public static CustomerResponse toResponse(Customer entity) {
    CustomerResponse response = new CustomerResponse();
    response.setId(entity.getId());
    response.setName(entity.getName());
    response.setEmail(entity.getEmail());
    return response;
  }
}
