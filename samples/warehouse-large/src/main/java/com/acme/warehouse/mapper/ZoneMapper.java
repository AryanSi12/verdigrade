package com.acme.warehouse.mapper;

import com.acme.warehouse.dto.ZoneResponse;
import com.acme.warehouse.entity.Zone;

public final class ZoneMapper {

  private ZoneMapper() {
  }

  public static ZoneResponse toResponse(Zone entity) {
    ZoneResponse response = new ZoneResponse();
    response.setId(entity.getId());
    response.setCode(entity.getCode());
    response.setName(entity.getName());
    response.setWarehouseId(entity.getWarehouseId());
    response.setTemperatureCelsius(entity.getTemperatureCelsius());
    return response;
  }
}
