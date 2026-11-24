package com.acme.loyalty;

import javax.validation.constraints.NotBlank;

public class MemberRequest {

  @NotBlank
  private String memberId;

  public String getMemberId() {
    return memberId;
  }

  public void setMemberId(String memberId) {
    this.memberId = memberId;
  }
}
