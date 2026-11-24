package com.acme.library.mapper;

import com.acme.library.dto.FineResponse;
import com.acme.library.dto.LoanResponse;
import com.acme.library.entity.Fine;
import com.acme.library.entity.Loan;

public final class LoanMapper {

  private LoanMapper() {
  }

  public static LoanResponse toResponse(Loan loan) {
    LoanResponse response = new LoanResponse();
    response.setId(loan.getId());
    response.setBookId(loan.getBook().getId());
    response.setBookTitle(loan.getBook().getTitle());
    response.setMemberId(loan.getMember().getId());
    response.setMemberName(loan.getMember().getFullName());
    response.setLoanedOn(loan.getLoanedOn());
    response.setDueOn(loan.getDueOn());
    response.setReturnedOn(loan.getReturnedOn());
    response.setStatus(loan.getStatus().name());
    return response;
  }

  public static FineResponse toResponse(Fine fine) {
    FineResponse response = new FineResponse();
    response.setId(fine.getId());
    response.setLoanId(fine.getLoan().getId());
    response.setAmount(fine.getAmount());
    response.setPaid(fine.isPaid());
    response.setReason(fine.getReason());
    return response;
  }
}
