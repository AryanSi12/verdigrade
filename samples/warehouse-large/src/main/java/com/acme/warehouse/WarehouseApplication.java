package com.acme.warehouse;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import com.acme.warehouse.config.WarehouseProperties;

@SpringBootApplication
@EnableConfigurationProperties(WarehouseProperties.class)
public class WarehouseApplication {

  public static void main(String[] args) {
    SpringApplication.run(WarehouseApplication.class, args);
  }
}
