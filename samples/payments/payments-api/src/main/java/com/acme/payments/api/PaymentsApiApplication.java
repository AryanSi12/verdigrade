package com.acme.payments.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@SpringBootApplication(scanBasePackages = "com.acme.payments")
@EntityScan("com.acme.payments.entity")
@EnableJpaRepositories("com.acme.payments.repository")
public class PaymentsApiApplication {

  public static void main(String[] args) {
    SpringApplication.run(PaymentsApiApplication.class, args);
  }
}
