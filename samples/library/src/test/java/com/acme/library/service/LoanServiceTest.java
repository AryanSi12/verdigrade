package com.acme.library.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Collections;
import java.util.Optional;
import com.acme.library.config.LibraryProperties;
import com.acme.library.dto.LoanRequest;
import com.acme.library.dto.LoanResponse;
import com.acme.library.entity.Author;
import com.acme.library.entity.Book;
import com.acme.library.entity.Loan;
import com.acme.library.entity.LoanStatus;
import com.acme.library.entity.Member;
import com.acme.library.entity.MembershipType;
import com.acme.library.exception.BusinessRuleException;
import com.acme.library.repository.BookRepository;
import com.acme.library.repository.LoanRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.AdditionalAnswers;
import org.mockito.ArgumentMatchers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LoanServiceTest {

  @Mock private LoanRepository loans;
  @Mock private BookRepository books;
  @Mock private BookService bookService;
  @Mock private MemberService memberService;
  @Mock private FineService fineService;
  @Mock private ReservationService reservationService;

  private LoanService service() {
    LibraryProperties properties = new LibraryProperties();
    properties.setIsbnLookupUrl("http://x/{isbn}");
    return new LoanService(loans, books, bookService, memberService, fineService, reservationService, properties);
  }

  private Member member(MembershipType type, boolean active) {
    Member member = new Member();
    member.setId(5L);
    member.setUsername("reader");
    member.setFullName("Reader One");
    member.setMembershipType(type);
    member.setActive(active);
    return member;
  }

  private Book book(int available) {
    Author author = new Author();
    author.setName("Someone");
    Book book = new Book();
    book.setId(9L);
    book.setTitle("A Book");
    book.setIsbn("9780134685991");
    book.setCopiesTotal(3);
    book.setCopiesAvailable(available);
    book.setAuthor(author);
    return book;
  }

  private LoanRequest request() {
    LoanRequest request = new LoanRequest();
    request.setBookId(9L);
    request.setMemberId(5L);
    return request;
  }

  @Test
  void borrowSetsDueDateFromMembershipAndTakesACopy() {
    Member member = member(MembershipType.STUDENT, true);
    Book book = book(2);
    when(memberService.find(5L)).thenReturn(member);
    when(bookService.find(9L)).thenReturn(book);
    when(loans.countByMemberIdAndStatusIn(eq(5L), any())).thenReturn(0L);
    when(fineService.outstandingTotal(5L)).thenReturn(BigDecimal.ZERO);
    when(loans.save(any(Loan.class))).then(AdditionalAnswers.returnsFirstArg());

    LoanResponse response = service().borrow(request());

    assertEquals(LocalDate.now().plusDays(14 + 7), response.getDueOn());
    assertEquals("ACTIVE", response.getStatus());
    assertEquals(1, book.getCopiesAvailable());
    verify(reservationService).fulfillIfReserved(book, member);
  }

  @Test
  void borrowFailsWhenNoCopiesAreLeft() {
    when(memberService.find(5L)).thenReturn(member(MembershipType.STANDARD, true));
    when(bookService.find(9L)).thenReturn(book(0));
    assertThrows(BusinessRuleException.class, () -> service().borrow(request()));
    verify(loans, never()).save(any(Loan.class));
  }

  @Test
  void borrowFailsForInactiveMembers() {
    when(memberService.find(5L)).thenReturn(member(MembershipType.STANDARD, false));
    when(bookService.find(9L)).thenReturn(book(1));
    assertThrows(BusinessRuleException.class, () -> service().borrow(request()));
  }

  @Test
  void borrowFailsAtTheLoanLimit() {
    when(memberService.find(5L)).thenReturn(member(MembershipType.STANDARD, true));
    when(bookService.find(9L)).thenReturn(book(1));
    when(loans.countByMemberIdAndStatusIn(eq(5L), any())).thenReturn(5L);
    BusinessRuleException error = assertThrows(BusinessRuleException.class, () -> service().borrow(request()));
    assertTrue(error.getMessage().contains("limit"));
  }

  @Test
  void borrowFailsWhenFinesAreTooHigh() {
    when(memberService.find(5L)).thenReturn(member(MembershipType.STANDARD, true));
    when(bookService.find(9L)).thenReturn(book(1));
    when(loans.countByMemberIdAndStatusIn(eq(5L), any())).thenReturn(0L);
    when(fineService.outstandingTotal(5L)).thenReturn(new BigDecimal("12.50"));
    assertThrows(BusinessRuleException.class, () -> service().borrow(request()));
  }

  @Test
  void returningALoanGivesTheCopyBackAndChargesLateFees() {
    Book book = book(1);
    Loan loan = new Loan();
    loan.setId(3L);
    loan.setBook(book);
    loan.setMember(member(MembershipType.STANDARD, true));
    loan.setDueOn(LocalDate.now().minusDays(3));
    loan.setStatus(LoanStatus.OVERDUE);
    when(loans.findById(3L)).thenReturn(Optional.of(loan));
    when(loans.save(any(Loan.class))).then(AdditionalAnswers.returnsFirstArg());

    LoanResponse response = service().giveBack(3L);

    assertEquals("RETURNED", response.getStatus());
    assertEquals(2, book.getCopiesAvailable());
    verify(fineService).chargeIfLate(loan, LocalDate.now());
    verify(reservationService).notifyNextInQueue(book);
  }

  @Test
  void returningTwiceIsRejected() {
    Loan loan = new Loan();
    loan.setStatus(LoanStatus.RETURNED);
    when(loans.findById(3L)).thenReturn(Optional.of(loan));
    assertThrows(BusinessRuleException.class, () -> service().giveBack(3L));
  }

  @Test
  void markOverdueFlipsOnlyTheLateActiveLoans() {
    Loan late = new Loan();
    late.setStatus(LoanStatus.ACTIVE);
    when(loans.findByStatusAndDueOnBefore(LoanStatus.ACTIVE, LocalDate.of(2024, 6, 1))).thenReturn(Arrays.asList(late));
    assertEquals(1, service().markOverdue(LocalDate.of(2024, 6, 1)));
    assertEquals(LoanStatus.OVERDUE, late.getStatus());
    verify(loans).saveAll(Arrays.asList(late));
  }

  @Test
  void markOverdueWithNothingLateDoesNothing() {
    when(loans.findByStatusAndDueOnBefore(any(), any())).thenReturn(Collections.<Loan>emptyList());
    assertEquals(0, service().markOverdue(LocalDate.now()));
  }
}
