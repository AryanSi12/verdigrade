package com.acme.warehouse.mapper;

import com.acme.warehouse.dto.CustomerResponse;
import com.acme.warehouse.entity.Customer;

public final class CustomerMapper {

  private CustomerMapper() {
  }

  public static CustomerResponse toResponse(Customer entity) {
    CustomerResponse response = new CustomerResponse();
    response.setId(entity.getId());
    response.setEmail(entity.getEmail());
    response.setName(entity.getName());
    response.setLoyaltyPoints(entity.getLoyaltyPoints());
    return response;
  }
}
