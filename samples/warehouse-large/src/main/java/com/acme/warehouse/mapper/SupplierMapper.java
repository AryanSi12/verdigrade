package com.acme.warehouse.mapper;

import com.acme.warehouse.dto.SupplierResponse;
import com.acme.warehouse.entity.Supplier;

public final class SupplierMapper {

  private SupplierMapper() {
  }

  public static SupplierResponse toResponse(Supplier entity) {
    SupplierResponse response = new SupplierResponse();
    response.setId(entity.getId());
    response.setName(entity.getName());
    response.setEmail(entity.getEmail());
    response.setPhone(entity.getPhone());
    response.setRating(entity.getRating());
    return response;
  }
}
