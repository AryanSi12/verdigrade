package com.acme.library.service;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;
import com.acme.library.dto.MemberRequest;
import com.acme.library.dto.MemberResponse;
import com.acme.library.entity.Member;
import com.acme.library.entity.MembershipType;
import com.acme.library.entity.Role;
import com.acme.library.exception.BusinessRuleException;
import com.acme.library.exception.DuplicateResourceException;
import com.acme.library.exception.ResourceNotFoundException;
import com.acme.library.mapper.MemberMapper;
import com.acme.library.repository.MemberRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class MemberService {

  private final MemberRepository members;
  private final PasswordEncoder passwordEncoder;

  public MemberService(MemberRepository members, PasswordEncoder passwordEncoder) {
    this.members = members;
    this.passwordEncoder = passwordEncoder;
  }

  @Transactional(readOnly = true)
  public List<MemberResponse> list() {
    return members.findAll().stream().map(MemberMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public MemberResponse get(Long id) {
    return MemberMapper.toResponse(find(id));
  }

  public MemberResponse register(MemberRequest request, Role role) {
    if (members.existsByUsername(request.getUsername())) {
      throw new DuplicateResourceException("Username " + request.getUsername() + " is taken");
    }
    if (members.existsByEmail(request.getEmail())) {
      throw new DuplicateResourceException("E-mail " + request.getEmail() + " is already registered");
    }
    Member member = new Member();
    member.setFullName(request.getFullName());
    member.setEmail(request.getEmail());
    member.setUsername(request.getUsername());
    member.setPasswordHash(passwordEncoder.encode(request.getPassword()));
    member.setRole(role);
    member.setMembershipType(parseMembership(request.getMembershipType()));
    member.setActive(true);
    member.setJoinedOn(LocalDate.now());
    return MemberMapper.toResponse(members.save(member));
  }

  public MemberResponse setActive(Long id, boolean active) {
    Member member = find(id);
    member.setActive(active);
    return MemberMapper.toResponse(members.save(member));
  }

  public Member find(Long id) {
    return members.findById(id).orElseThrow(() -> new ResourceNotFoundException("Member", id));
  }

  private MembershipType parseMembership(String value) {
    if (value == null || value.trim().isEmpty()) {
      return MembershipType.STANDARD;
    }
    try {
      return MembershipType.valueOf(value.trim().toUpperCase());
    } catch (IllegalArgumentException e) {
      throw new BusinessRuleException("Unknown membership type " + value);
    }
  }
}
