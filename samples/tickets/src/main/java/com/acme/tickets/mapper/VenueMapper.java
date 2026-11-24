package com.acme.tickets.mapper;

import com.acme.tickets.dto.VenueResponse;
import com.acme.tickets.entity.Venue;

public final class VenueMapper {

  private VenueMapper() {
  }

  public static VenueResponse toResponse(Venue entity) {
    VenueResponse response = new VenueResponse();
    response.setId(entity.getId());
    response.setName(entity.getName());
    response.setCity(entity.getCity());
    response.setCapacity(entity.getCapacity());
    return response;
  }
}
