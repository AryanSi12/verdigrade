package com.acme.library.repository;

import com.acme.library.entity.Reservation;
import com.acme.library.entity.ReservationStatus;
import java.util.Date;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReservationRepository extends JpaRepository<Reservation, Long> {

  List<Reservation> findByBookIdAndStatusOrderByReservedAtAsc(Long bookId, ReservationStatus status);

  List<Reservation> findByStatusAndExpiresAtBefore(ReservationStatus status, Date cutoff);

  List<Reservation> findByMemberId(Long memberId);

  boolean existsByBookIdAndMemberIdAndStatus(Long bookId, Long memberId, ReservationStatus status);
}
