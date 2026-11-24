package com.acme.payments.dto;

import javax.validation.constraints.*;

public class PaymentMethodRequest {

  @NotBlank
  @Size(max = 40)
  private String token;

  @NotBlank
  @Pattern(regexp = "VISA|MASTERCARD|RUPAY|AMEX")
  @Size(max = 20)
  private String brand;

  @NotBlank
  @Pattern(regexp = "[0-9]{4}")
  private String last4;

  @NotNull
  @Min(2024)
  @Max(2100)
  private Integer expiryYear;

  public PaymentMethodRequest() {
  }

  public String getToken() {
    return token;
  }

  public void setToken(String token) {
    this.token = token;
  }

  public String getBrand() {
    return brand;
  }

  public void setBrand(String brand) {
    this.brand = brand;
  }

  public String getLast4() {
    return last4;
  }

  public void setLast4(String last4) {
    this.last4 = last4;
  }

  public Integer getExpiryYear() {
    return expiryYear;
  }

  public void setExpiryYear(Integer expiryYear) {
    this.expiryYear = expiryYear;
  }

}
