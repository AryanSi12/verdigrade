package com.acme.library.repository;

import com.acme.library.entity.Fine;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FineRepository extends JpaRepository<Fine, Long> {

  List<Fine> findByLoanId(Long loanId);

  List<Fine> findByLoanMemberIdAndPaidFalse(Long memberId);

  @Query("select coalesce(sum(f.amount), 0) from Fine f where f.loan.member.id = :memberId and f.paid = false")
  BigDecimal outstandingFor(@Param("memberId") Long memberId);
}
