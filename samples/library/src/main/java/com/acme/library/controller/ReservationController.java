package com.acme.library.controller;

import java.util.List;
import com.acme.library.dto.ReservationRequest;
import com.acme.library.dto.ReservationResponse;
import com.acme.library.service.ReservationService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/reservations")
public class ReservationController {

  private final ReservationService reservationService;

  public ReservationController(ReservationService reservationService) {
    this.reservationService = reservationService;
  }

  @PostMapping
  public ResponseEntity<ReservationResponse> reserve(@Valid @RequestBody ReservationRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(reservationService.reserve(request));
  }

  @DeleteMapping("/{id}")
  public ReservationResponse cancel(@PathVariable Long id) {
    return reservationService.cancel(id);
  }

  @GetMapping("/member/{memberId}")
  public List<ReservationResponse> forMember(@PathVariable Long memberId) {
    return reservationService.forMember(memberId);
  }
}
