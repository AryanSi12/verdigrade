package com.acme.warehouse.mapper;

import com.acme.warehouse.dto.CarrierResponse;
import com.acme.warehouse.entity.Carrier;

public final class CarrierMapper {

  private CarrierMapper() {
  }

  public static CarrierResponse toResponse(Carrier entity) {
    CarrierResponse response = new CarrierResponse();
    response.setId(entity.getId());
    response.setName(entity.getName());
    response.setScacCode(entity.getScacCode());
    return response;
  }
}
