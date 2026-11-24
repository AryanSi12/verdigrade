package com.acme.desk.ticket;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;

public class TicketRequest {

  @NotBlank
  @Size(max = 160)
  private String title;

  @Pattern(regexp = "LOW|NORMAL|HIGH")
  private String priority = "NORMAL";

  @Size(max = 80)
  private String assignee;

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getPriority() {
    return priority;
  }

  public void setPriority(String priority) {
    this.priority = priority;
  }

  public String getAssignee() {
    return assignee;
  }

  public void setAssignee(String assignee) {
    this.assignee = assignee;
  }
}
