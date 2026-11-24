package com.acme.library.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.stream.Collectors;
import com.acme.library.config.LibraryProperties;
import com.acme.library.dto.FineResponse;
import com.acme.library.entity.Fine;
import com.acme.library.entity.Loan;
import com.acme.library.exception.ResourceNotFoundException;
import com.acme.library.mapper.LoanMapper;
import com.acme.library.repository.FineRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class FineService {

  private final FineRepository fines;
  private final LibraryProperties properties;

  public FineService(FineRepository fines, LibraryProperties properties) {
    this.fines = fines;
    this.properties = properties;
  }

  public BigDecimal calculate(LocalDate dueOn, LocalDate returnedOn) {
    long daysLate = ChronoUnit.DAYS.between(dueOn, returnedOn);
    if (daysLate <= 0) {
      return BigDecimal.ZERO;
    }
    return properties.getFinePerDay().multiply(BigDecimal.valueOf(daysLate));
  }

  public Fine chargeIfLate(Loan loan, LocalDate returnedOn) {
    BigDecimal amount = calculate(loan.getDueOn(), returnedOn);
    if (amount.signum() == 0) {
      return null;
    }
    Fine fine = new Fine();
    fine.setLoan(loan);
    fine.setAmount(amount);
    fine.setReason("Returned " + ChronoUnit.DAYS.between(loan.getDueOn(), returnedOn) + " day(s) late");
    return fines.save(fine);
  }

  @Transactional(readOnly = true)
  public List<FineResponse> outstanding(Long memberId) {
    return fines.findByLoanMemberIdAndPaidFalse(memberId).stream().map(LoanMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public BigDecimal outstandingTotal(Long memberId) {
    return fines.outstandingFor(memberId);
  }

  public FineResponse pay(Long fineId) {
    Fine fine = fines.findById(fineId).orElseThrow(() -> new ResourceNotFoundException("Fine", fineId));
    fine.setPaid(true);
    return LoanMapper.toResponse(fines.save(fine));
  }
}
