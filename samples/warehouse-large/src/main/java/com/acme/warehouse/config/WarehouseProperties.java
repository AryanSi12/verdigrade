package com.acme.warehouse.config;

import javax.validation.constraints.Min;
import javax.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "warehouse")
public class WarehouseProperties {

  @NotBlank
  private String defaultCurrency = "INR";

  @Min(1)
  private int lowStockThreshold = 5;

  private boolean schedulingEnabled = true;

  public String getDefaultCurrency() {
    return defaultCurrency;
  }

  public void setDefaultCurrency(String defaultCurrency) {
    this.defaultCurrency = defaultCurrency;
  }

  public int getLowStockThreshold() {
    return lowStockThreshold;
  }

  public void setLowStockThreshold(int lowStockThreshold) {
    this.lowStockThreshold = lowStockThreshold;
  }

  public boolean isSchedulingEnabled() {
    return schedulingEnabled;
  }

  public void setSchedulingEnabled(boolean schedulingEnabled) {
    this.schedulingEnabled = schedulingEnabled;
  }
}
