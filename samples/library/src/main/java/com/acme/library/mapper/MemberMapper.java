package com.acme.library.mapper;

import com.acme.library.dto.MemberResponse;
import com.acme.library.entity.Member;

public final class MemberMapper {

  private MemberMapper() {
  }

  public static MemberResponse toResponse(Member member) {
    MemberResponse response = new MemberResponse();
    response.setId(member.getId());
    response.setFullName(member.getFullName());
    response.setEmail(member.getEmail());
    response.setUsername(member.getUsername());
    response.setRole(member.getRole().name());
    response.setMembershipType(member.getMembershipType().name());
    response.setActive(member.isActive());
    response.setJoinedOn(member.getJoinedOn());
    return response;
  }
}
