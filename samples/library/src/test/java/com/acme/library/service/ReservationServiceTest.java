package com.acme.library.service;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import com.acme.library.config.LibraryProperties;
import com.acme.library.dto.ReservationRequest;
import com.acme.library.dto.ReservationResponse;
import com.acme.library.entity.Book;
import com.acme.library.entity.Member;
import com.acme.library.entity.Reservation;
import com.acme.library.entity.ReservationStatus;
import com.acme.library.exception.BusinessRuleException;
import com.acme.library.repository.ReservationRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.AdditionalAnswers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReservationServiceTest {

  @Mock private ReservationRepository reservations;
  @Mock private BookService bookService;
  @Mock private MemberService memberService;
  @Mock private NotificationService notifications;

  private ReservationService service() {
    LibraryProperties properties = new LibraryProperties();
    properties.setIsbnLookupUrl("http://x/{isbn}");
    return new ReservationService(reservations, bookService, memberService, notifications, properties);
  }

  private Book book(int available) {
    Book book = new Book();
    book.setId(9L);
    book.setTitle("A Book");
    book.setCopiesAvailable(available);
    return book;
  }

  private Member member() {
    Member member = new Member();
    member.setId(5L);
    member.setEmail("reader@example.org");
    return member;
  }

  private ReservationRequest request() {
    ReservationRequest request = new ReservationRequest();
    request.setBookId(9L);
    request.setMemberId(5L);
    return request;
  }

  @Test
  void reserveCreatesAPendingReservationThatExpiresLater() {
    when(bookService.find(9L)).thenReturn(book(0));
    when(memberService.find(5L)).thenReturn(member());
    when(reservations.save(any(Reservation.class))).then(AdditionalAnswers.returnsFirstArg());
    ReservationResponse response = service().reserve(request());
    assertEquals("PENDING", response.getStatus());
    assertTrue(response.getExpiresAt().after(response.getReservedAt()));
  }

  @Test
  void reserveRefusesWhenTheBookIsAvailable() {
    when(bookService.find(9L)).thenReturn(book(2));
    when(memberService.find(5L)).thenReturn(member());
    assertThrows(BusinessRuleException.class, () -> service().reserve(request()));
  }

  @Test
  void reserveRefusesDuplicatePendingReservations() {
    when(bookService.find(9L)).thenReturn(book(0));
    when(memberService.find(5L)).thenReturn(member());
    when(reservations.existsByBookIdAndMemberIdAndStatus(9L, 5L, ReservationStatus.PENDING)).thenReturn(true);
    assertThrows(BusinessRuleException.class, () -> service().reserve(request()));
  }

  @Test
  void notifyNextInQueueMessagesTheFirstMember() {
    Reservation first = new Reservation();
    first.setMember(member());
    when(reservations.findByBookIdAndStatusOrderByReservedAtAsc(9L, ReservationStatus.PENDING)).thenReturn(Arrays.asList(first));
    service().notifyNextInQueue(book(1));
    verify(notifications).notify(eq(first.getMember()), contains("available"));
  }

  @Test
  void expireOldMarksStaleReservations() {
    Reservation stale = new Reservation();
    stale.setStatus(ReservationStatus.PENDING);
    Date now = new Date();
    when(reservations.findByStatusAndExpiresAtBefore(ReservationStatus.PENDING, now)).thenReturn(Arrays.asList(stale));
    assertEquals(1, service().expireOld(now));
    assertEquals(ReservationStatus.EXPIRED, stale.getStatus());
  }

  @Test
  void expireOldWithNothingStale() {
    when(reservations.findByStatusAndExpiresAtBefore(any(), any())).thenReturn(Collections.<Reservation>emptyList());
    assertEquals(0, service().expireOld(new Date()));
  }
}
