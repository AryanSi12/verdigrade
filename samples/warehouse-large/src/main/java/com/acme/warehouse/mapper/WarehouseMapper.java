package com.acme.warehouse.mapper;

import com.acme.warehouse.dto.WarehouseResponse;
import com.acme.warehouse.entity.Warehouse;

public final class WarehouseMapper {

  private WarehouseMapper() {
  }

  public static WarehouseResponse toResponse(Warehouse entity) {
    WarehouseResponse response = new WarehouseResponse();
    response.setId(entity.getId());
    response.setCode(entity.getCode());
    response.setName(entity.getName());
    response.setCity(entity.getCity());
    response.setCapacity(entity.getCapacity());
    return response;
  }
}
