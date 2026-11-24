package com.acme.library.repository;

import com.acme.library.entity.Loan;
import com.acme.library.entity.LoanStatus;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoanRepository extends JpaRepository<Loan, Long> {

  List<Loan> findByMemberId(Long memberId);

  long countByMemberIdAndStatusIn(Long memberId, Collection<LoanStatus> statuses);

  List<Loan> findByStatusAndDueOnBefore(LoanStatus status, LocalDate date);

  List<Loan> findByStatus(LoanStatus status);
}
