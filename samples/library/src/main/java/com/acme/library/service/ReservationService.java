package com.acme.library.service;

import java.util.Date;
import java.util.List;
import java.util.stream.Collectors;
import com.acme.library.config.LibraryProperties;
import com.acme.library.dto.ReservationRequest;
import com.acme.library.dto.ReservationResponse;
import com.acme.library.entity.Book;
import com.acme.library.entity.Member;
import com.acme.library.entity.Reservation;
import com.acme.library.entity.ReservationStatus;
import com.acme.library.exception.BusinessRuleException;
import com.acme.library.mapper.ReservationMapper;
import com.acme.library.repository.ReservationRepository;
import com.acme.library.util.LegacyDates;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ReservationService {

  private final ReservationRepository reservations;
  private final BookService bookService;
  private final MemberService memberService;
  private final NotificationService notifications;
  private final LibraryProperties properties;

  public ReservationService(ReservationRepository reservations, BookService bookService, MemberService memberService,
                            NotificationService notifications, LibraryProperties properties) {
    this.reservations = reservations;
    this.bookService = bookService;
    this.memberService = memberService;
    this.notifications = notifications;
    this.properties = properties;
  }

  public ReservationResponse reserve(ReservationRequest request) {
    Book book = bookService.find(request.getBookId());
    Member member = memberService.find(request.getMemberId());
    if (book.getCopiesAvailable() > 0) {
      throw new BusinessRuleException("'" + book.getTitle() + "' is available, borrow it instead");
    }
    if (reservations.existsByBookIdAndMemberIdAndStatus(book.getId(), member.getId(), ReservationStatus.PENDING)) {
      throw new BusinessRuleException("Member already has a pending reservation for this book");
    }
    Date now = new Date();
    Reservation reservation = new Reservation();
    reservation.setBook(book);
    reservation.setMember(member);
    reservation.setReservedAt(now);
    reservation.setExpiresAt(LegacyDates.plusDays(now, properties.getReservationHoldDays()));
    reservation.setStatus(ReservationStatus.PENDING);
    return ReservationMapper.toResponse(reservations.save(reservation));
  }

  public ReservationResponse cancel(Long id) {
    Reservation reservation = reservations.findById(id).orElseThrow(() -> new BusinessRuleException("Reservation " + id + " does not exist"));
    reservation.setStatus(ReservationStatus.CANCELLED);
    return ReservationMapper.toResponse(reservations.save(reservation));
  }

  @Transactional(readOnly = true)
  public List<ReservationResponse> forMember(Long memberId) {
    return reservations.findByMemberId(memberId).stream().map(ReservationMapper::toResponse).collect(Collectors.toList());
  }

  void fulfillIfReserved(Book book, Member member) {
    for (Reservation reservation : reservations.findByBookIdAndStatusOrderByReservedAtAsc(book.getId(), ReservationStatus.PENDING)) {
      if (reservation.getMember().getId().equals(member.getId())) {
        reservation.setStatus(ReservationStatus.FULFILLED);
        reservations.save(reservation);
      }
    }
  }

  void notifyNextInQueue(Book book) {
    List<Reservation> queue = reservations.findByBookIdAndStatusOrderByReservedAtAsc(book.getId(), ReservationStatus.PENDING);
    if (!queue.isEmpty()) {
      Member next = queue.get(0).getMember();
      notifications.notify(next, "'" + book.getTitle() + "' is now available for you");
    }
  }

  public int expireOld(Date now) {
    List<Reservation> stale = reservations.findByStatusAndExpiresAtBefore(ReservationStatus.PENDING, now);
    for (Reservation reservation : stale) {
      reservation.setStatus(ReservationStatus.EXPIRED);
    }
    reservations.saveAll(stale);
    return stale.size();
  }
}
