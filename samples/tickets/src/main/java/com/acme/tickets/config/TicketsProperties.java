package com.acme.tickets.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "tickets")
public class TicketsProperties {

  private int maxTicketsPerOrder = 10;
  private int serviceFeePercent = 5;
  private int pendingMinutes = 30;
  private boolean schedulingEnabled = true;

  public int getMaxTicketsPerOrder() {
    return maxTicketsPerOrder;
  }

  public void setMaxTicketsPerOrder(int maxTicketsPerOrder) {
    this.maxTicketsPerOrder = maxTicketsPerOrder;
  }

  public int getServiceFeePercent() {
    return serviceFeePercent;
  }

  public void setServiceFeePercent(int serviceFeePercent) {
    this.serviceFeePercent = serviceFeePercent;
  }

  public int getPendingMinutes() {
    return pendingMinutes;
  }

  public void setPendingMinutes(int pendingMinutes) {
    this.pendingMinutes = pendingMinutes;
  }

  public boolean isSchedulingEnabled() {
    return schedulingEnabled;
  }

  public void setSchedulingEnabled(boolean schedulingEnabled) {
    this.schedulingEnabled = schedulingEnabled;
  }
}
