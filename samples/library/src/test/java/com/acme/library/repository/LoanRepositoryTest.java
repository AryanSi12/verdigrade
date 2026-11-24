package com.acme.library.repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import com.acme.library.entity.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
class LoanRepositoryTest {

  @Autowired private TestEntityManager em;
  @Autowired private LoanRepository loans;
  @Autowired private FineRepository fines;

  private Member member;
  private Book book;

  @BeforeEach
  void setUp() {
    Author author = new Author();
    author.setName("Repo Author");
    em.persist(author);
    book = new Book();
    book.setTitle("Repo Book");
    book.setIsbn("7777777777777");
    book.setGenre(Genre.TECHNOLOGY);
    book.setCopiesTotal(5);
    book.setCopiesAvailable(5);
    book.setAuthor(author);
    em.persist(book);
    member = new Member();
    member.setFullName("Repo Member");
    member.setEmail("repo@example.org");
    member.setUsername("repo");
    member.setPasswordHash("x");
    member.setRole(Role.MEMBER);
    member.setMembershipType(MembershipType.STANDARD);
    member.setActive(true);
    em.persist(member);
  }

  private Loan loan(LocalDate due, LoanStatus status) {
    Loan loan = new Loan();
    loan.setBook(book);
    loan.setMember(member);
    loan.setLoanedOn(due.minusDays(14));
    loan.setDueOn(due);
    loan.setStatus(status);
    return em.persist(loan);
  }

  @Test
  void countsOnlyTheRequestedStatuses() {
    loan(LocalDate.now().plusDays(3), LoanStatus.ACTIVE);
    loan(LocalDate.now().minusDays(3), LoanStatus.OVERDUE);
    loan(LocalDate.now().minusDays(30), LoanStatus.RETURNED);
    assertEquals(2, loans.countByMemberIdAndStatusIn(member.getId(), Arrays.asList(LoanStatus.ACTIVE, LoanStatus.OVERDUE)));
    assertEquals(3, loans.findByMemberId(member.getId()).size());
  }

  @Test
  void findsActiveLoansPastTheirDueDate() {
    loan(LocalDate.now().minusDays(1), LoanStatus.ACTIVE);
    loan(LocalDate.now().plusDays(5), LoanStatus.ACTIVE);
    assertEquals(1, loans.findByStatusAndDueOnBefore(LoanStatus.ACTIVE, LocalDate.now()).size());
  }

  @Test
  void sumsOnlyUnpaidFines() {
    Loan late = loan(LocalDate.now().minusDays(10), LoanStatus.RETURNED);
    em.persist(fine(late, "1.50", false));
    em.persist(fine(late, "2.00", false));
    em.persist(fine(late, "9.99", true));
    assertEquals(0, new BigDecimal("3.50").compareTo(fines.outstandingFor(member.getId())));
    assertEquals(2, fines.findByLoanMemberIdAndPaidFalse(member.getId()).size());
  }

  @Test
  void outstandingIsZeroWithoutFines() {
    assertEquals(0, BigDecimal.ZERO.compareTo(fines.outstandingFor(member.getId())));
  }

  private Fine fine(Loan loan, String amount, boolean paid) {
    Fine fine = new Fine();
    fine.setLoan(loan);
    fine.setAmount(new BigDecimal(amount));
    fine.setPaid(paid);
    return fine;
  }
}
