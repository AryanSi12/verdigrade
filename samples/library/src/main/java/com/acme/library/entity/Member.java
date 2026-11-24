package com.acme.library.entity;

import javax.persistence.*;

@Entity
@Table(name = "members")
public class Member extends BaseEntity {

  @Column(nullable = false, length = 120)
  private String fullName;

  @Column(nullable = false, unique = true, length = 160)
  private String email;

  @Column(nullable = false, unique = true, length = 60)
  private String username;

  @Column(nullable = false)
  private String passwordHash;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private Role role;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private MembershipType membershipType;

  private boolean active;

  private java.time.LocalDate joinedOn;

  public Member() {
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

  public String getPasswordHash() {
    return passwordHash;
  }

  public void setPasswordHash(String passwordHash) {
    this.passwordHash = passwordHash;
  }

  public Role getRole() {
    return role;
  }

  public void setRole(Role role) {
    this.role = role;
  }

  public MembershipType getMembershipType() {
    return membershipType;
  }

  public void setMembershipType(MembershipType membershipType) {
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
