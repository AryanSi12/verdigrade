package com.acme.library.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class AuditLogger {

  private static final Logger LOG = LoggerFactory.getLogger("library.audit");

  public void record(String actor, String action, String target) {
    LOG.info("audit actor={} action={} target={}", actor, action, target);
  }
}
