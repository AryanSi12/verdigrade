package com.acme.library.entity;

public enum MembershipType {
  STANDARD(0, 5),
  STUDENT(7, 8),
  PREMIUM(14, 12);

  private final int extraLoanDays;
  private final int maxLoans;

  MembershipType(int extraLoanDays, int maxLoans) {
    this.extraLoanDays = extraLoanDays;
    this.maxLoans = maxLoans;
  }

  public int getExtraLoanDays() {
    return extraLoanDays;
  }

  public int getMaxLoans() {
    return maxLoans;
  }
}
