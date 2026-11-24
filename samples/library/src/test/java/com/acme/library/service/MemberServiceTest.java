package com.acme.library.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.acme.library.dto.MemberRequest;
import com.acme.library.dto.MemberResponse;
import com.acme.library.entity.Member;
import com.acme.library.entity.Role;
import com.acme.library.exception.BusinessRuleException;
import com.acme.library.exception.DuplicateResourceException;
import com.acme.library.exception.ResourceNotFoundException;
import com.acme.library.repository.MemberRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.AdditionalAnswers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class MemberServiceTest {

  @Mock
  private MemberRepository members;
  @Mock
  private PasswordEncoder passwordEncoder;
  @InjectMocks
  private MemberService service;

  private MemberRequest request() {
    MemberRequest request = new MemberRequest();
    request.setFullName("Nia Reader");
    request.setEmail("nia@example.org");
    request.setUsername("nia");
    request.setPassword("nia-password-1");
    return request;
  }

  @Test
  void registerHashesThePasswordAndDefaultsToStandardMembership() {
    when(passwordEncoder.encode("nia-password-1")).thenReturn("hashed");
    when(members.save(any(Member.class))).then(AdditionalAnswers.returnsFirstArg());
    MemberResponse response = service.register(request(), Role.MEMBER);
    assertEquals("STANDARD", response.getMembershipType());
    assertEquals("MEMBER", response.getRole());
    assertTrue(response.isActive());
  }

  @Test
  void registerRejectsTakenUsernameAndEmail() {
    when(members.existsByUsername("nia")).thenReturn(true);
    assertThrows(DuplicateResourceException.class, () -> service.register(request(), Role.MEMBER));
    when(members.existsByUsername("nia")).thenReturn(false);
    when(members.existsByEmail("nia@example.org")).thenReturn(true);
    assertThrows(DuplicateResourceException.class, () -> service.register(request(), Role.MEMBER));
    verify(members, never()).save(any(Member.class));
  }

  @Test
  void registerRejectsUnknownMembershipType() {
    MemberRequest request = request();
    request.setMembershipType("gold");
    assertThrows(BusinessRuleException.class, () -> service.register(request, Role.MEMBER));
  }

  @Test
  void setActiveTogglesTheFlag() {
    Member member = new Member();
    member.setActive(true);
    member.setRole(Role.MEMBER);
    member.setMembershipType(com.acme.library.entity.MembershipType.STANDARD);
    when(members.findById(4L)).thenReturn(Optional.of(member));
    when(members.save(any(Member.class))).then(AdditionalAnswers.returnsFirstArg());
    assertFalse(service.setActive(4L, false).isActive());
  }

  @Test
  void findMissingMemberThrowsNotFound() {
    when(members.findById(404L)).thenReturn(Optional.empty());
    assertThrows(ResourceNotFoundException.class, () -> service.find(404L));
  }
}
