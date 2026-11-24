package com.acme.library.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;
import com.acme.library.config.LibraryProperties;
import com.acme.library.dto.LoanRequest;
import com.acme.library.dto.LoanResponse;
import com.acme.library.entity.Book;
import com.acme.library.entity.Loan;
import com.acme.library.entity.LoanStatus;
import com.acme.library.entity.Member;
import com.acme.library.exception.BusinessRuleException;
import com.acme.library.exception.ResourceNotFoundException;
import com.acme.library.mapper.LoanMapper;
import com.acme.library.repository.BookRepository;
import com.acme.library.repository.LoanRepository;
import com.acme.library.util.OverdueReportWriter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class LoanService {

  private final LoanRepository loans;
  private final BookRepository books;
  private final BookService bookService;
  private final MemberService memberService;
  private final FineService fineService;
  private final ReservationService reservationService;
  private final LibraryProperties properties;

  public LoanService(LoanRepository loans, BookRepository books, BookService bookService, MemberService memberService,
                     FineService fineService, ReservationService reservationService, LibraryProperties properties) {
    this.loans = loans;
    this.books = books;
    this.bookService = bookService;
    this.memberService = memberService;
    this.fineService = fineService;
    this.reservationService = reservationService;
    this.properties = properties;
  }

  public LoanResponse borrow(LoanRequest request) {
    Member member = memberService.find(request.getMemberId());
    Book book = bookService.find(request.getBookId());
    if (!member.isActive()) {
      throw new BusinessRuleException("Member " + member.getUsername() + " is not active");
    }
    if (book.getCopiesAvailable() <= 0) {
      throw new BusinessRuleException("No copies of '" + book.getTitle() + "' are available");
    }
    long open = loans.countByMemberIdAndStatusIn(member.getId(), Arrays.asList(LoanStatus.ACTIVE, LoanStatus.OVERDUE));
    int limit = Math.min(properties.getMaxActiveLoans(), member.getMembershipType().getMaxLoans());
    if (open >= limit) {
      throw new BusinessRuleException("Loan limit of " + limit + " reached");
    }
    if (fineService.outstandingTotal(member.getId()).compareTo(BigDecimal.TEN) > 0) {
      throw new BusinessRuleException("Outstanding fines exceed 10.00");
    }
    LocalDate today = LocalDate.now();
    Loan loan = new Loan();
    loan.setBook(book);
    loan.setMember(member);
    loan.setLoanedOn(today);
    loan.setDueOn(today.plusDays(properties.getLoanDays() + member.getMembershipType().getExtraLoanDays()));
    loan.setStatus(LoanStatus.ACTIVE);
    book.setCopiesAvailable(book.getCopiesAvailable() - 1);
    books.save(book);
    reservationService.fulfillIfReserved(book, member);
    return LoanMapper.toResponse(loans.save(loan));
  }

  public LoanResponse giveBack(Long loanId) {
    Loan loan = find(loanId);
    if (loan.getStatus() == LoanStatus.RETURNED) {
      throw new BusinessRuleException("Loan " + loanId + " was already returned");
    }
    LocalDate today = LocalDate.now();
    loan.setReturnedOn(today);
    loan.setStatus(LoanStatus.RETURNED);
    Book book = loan.getBook();
    book.setCopiesAvailable(book.getCopiesAvailable() + 1);
    books.save(book);
    fineService.chargeIfLate(loan, today);
    reservationService.notifyNextInQueue(book);
    return LoanMapper.toResponse(loans.save(loan));
  }

  @Transactional(readOnly = true)
  public List<LoanResponse> forMember(Long memberId) {
    return loans.findByMemberId(memberId).stream().map(LoanMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public List<LoanResponse> overdue() {
    return loans.findByStatus(LoanStatus.OVERDUE).stream().map(LoanMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public String overdueReportCsv() {
    return new OverdueReportWriter().write(loans.findByStatus(LoanStatus.OVERDUE));
  }

  public int markOverdue(LocalDate today) {
    List<Loan> late = loans.findByStatusAndDueOnBefore(LoanStatus.ACTIVE, today);
    for (Loan loan : late) {
      loan.setStatus(LoanStatus.OVERDUE);
    }
    loans.saveAll(late);
    return late.size();
  }

  private Loan find(Long id) {
    return loans.findById(id).orElseThrow(() -> new ResourceNotFoundException("Loan", id));
  }
}
