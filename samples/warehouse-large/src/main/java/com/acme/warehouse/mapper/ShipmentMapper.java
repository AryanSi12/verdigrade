package com.acme.warehouse.mapper;

import com.acme.warehouse.dto.ShipmentResponse;
import com.acme.warehouse.entity.Shipment;

public final class ShipmentMapper {

  private ShipmentMapper() {
  }

  public static ShipmentResponse toResponse(Shipment entity) {
    ShipmentResponse response = new ShipmentResponse();
    response.setId(entity.getId());
    response.setTrackingCode(entity.getTrackingCode());
    response.setCarrierId(entity.getCarrierId());
    response.setDestination(entity.getDestination());
    response.setShippedOn(entity.getShippedOn());
    return response;
  }
}
