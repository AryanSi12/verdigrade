package com.acme.library.mapper;

import com.acme.library.dto.ReservationResponse;
import com.acme.library.entity.Reservation;

public final class ReservationMapper {

  private ReservationMapper() {
  }

  public static ReservationResponse toResponse(Reservation reservation) {
    ReservationResponse response = new ReservationResponse();
    response.setId(reservation.getId());
    response.setBookId(reservation.getBook().getId());
    response.setBookTitle(reservation.getBook().getTitle());
    response.setMemberId(reservation.getMember().getId());
    response.setReservedAt(reservation.getReservedAt());
    response.setExpiresAt(reservation.getExpiresAt());
    response.setStatus(reservation.getStatus().name());
    return response;
  }
}
