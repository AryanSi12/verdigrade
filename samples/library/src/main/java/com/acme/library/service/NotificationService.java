package com.acme.library.service;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import com.acme.library.entity.Member;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Stand-in for e-mail: logs and keeps the last messages so tests can look at them. */
@Service
public class NotificationService {

  private static final Logger LOG = LoggerFactory.getLogger(NotificationService.class);

  private final List<String> sent = new CopyOnWriteArrayList<String>();

  public void notify(Member member, String message) {
    String line = member.getEmail() + ": " + message;
    LOG.info("notification {}", line);
    sent.add(line);
  }

  public List<String> sentMessages() {
    return sent;
  }
}
