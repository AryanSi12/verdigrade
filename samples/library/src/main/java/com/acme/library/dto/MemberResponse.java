package com.acme.library.dto;

public class MemberResponse {

  private Long id;

  private String fullName;

  private String email;

  private String username;

  private String role;

  private String membershipType;

  private boolean active;

  private java.time.LocalDate joinedOn;

  public MemberResponse() {
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public String getFullName() {
    return fullName;
  }

  public void setFullName(String fullName) {
    this.fullName = fullName;
  }

  public String getEmail() {
    return email;
  }

  public void setEmail(String email) {
    this.email = email;
  }

  public String getUsername() {
    return username;
  }

  public void setUsername(String username) {
    this.username = username;
  }

  public String getRole() {
    return role;
  }

  public void setRole(String role) {
    this.role = role;
  }

  public String getMembershipType() {
    return membershipType;
  }

  public void setMembershipType(String membershipType) {
    this.membershipType = membershipType;
  }

  public boolean isActive() {
    return active;
  }

  public void setActive(boolean active) {
    this.active = active;
  }

  public java.time.LocalDate getJoinedOn() {
    return joinedOn;
  }

  public void setJoinedOn(java.time.LocalDate joinedOn) {
    this.joinedOn = joinedOn;
  }

}
