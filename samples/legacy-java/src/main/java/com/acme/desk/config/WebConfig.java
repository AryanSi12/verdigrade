package com.acme.desk.config;

import org.springframework.context.annotation.Configuration;

@Configuration
public class WebConfig extends LegacyWebSupport {

  @Override
  protected String desk() {
    return "acme-helpdesk";
  }
}
