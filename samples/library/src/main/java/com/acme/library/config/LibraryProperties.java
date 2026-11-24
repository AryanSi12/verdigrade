package com.acme.library.config;

import java.math.BigDecimal;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "library")
public class LibraryProperties {

  private int loanDays = 14;
  private int maxActiveLoans = 5;
  private BigDecimal finePerDay = new BigDecimal("0.25");
  private int reservationHoldDays = 3;
  private String isbnLookupUrl = "https://openlibrary.org/isbn/{isbn}.json";
  private boolean schedulingEnabled = true;
  private String adminPassword = "admin-demo-pass";

  public int getLoanDays() {
    return loanDays;
  }

  public void setLoanDays(int loanDays) {
    this.loanDays = loanDays;
  }

  public int getMaxActiveLoans() {
    return maxActiveLoans;
  }

  public void setMaxActiveLoans(int maxActiveLoans) {
    this.maxActiveLoans = maxActiveLoans;
  }

  public BigDecimal getFinePerDay() {
    return finePerDay;
  }

  public void setFinePerDay(BigDecimal finePerDay) {
    this.finePerDay = finePerDay;
  }

  public int getReservationHoldDays() {
    return reservationHoldDays;
  }

  public void setReservationHoldDays(int reservationHoldDays) {
    this.reservationHoldDays = reservationHoldDays;
  }

  public String getIsbnLookupUrl() {
    return isbnLookupUrl;
  }

  public void setIsbnLookupUrl(String isbnLookupUrl) {
    this.isbnLookupUrl = isbnLookupUrl;
  }

  public boolean isSchedulingEnabled() {
    return schedulingEnabled;
  }

  public void setSchedulingEnabled(boolean schedulingEnabled) {
    this.schedulingEnabled = schedulingEnabled;
  }

  public String getAdminPassword() {
    return adminPassword;
  }

  public void setAdminPassword(String adminPassword) {
    this.adminPassword = adminPassword;
  }
}
