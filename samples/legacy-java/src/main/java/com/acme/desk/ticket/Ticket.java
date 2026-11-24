package com.acme.desk.ticket;

import com.acme.desk.framework.BaseEntity;
import javax.persistence.*;

@Entity
@Table(name = "tickets")
public class Ticket extends BaseEntity {

  @Column(unique = true, length = 20)
  private String reference;

  @Column(nullable = false, length = 160)
  private String title;

  @Column(nullable = false, length = 12)
  private String status = "OPEN";

  @Column(nullable = false, length = 8)
  private String priority = "NORMAL";

  @Column(length = 80)
  private String assignee;

  public String getReference() {
    return reference;
  }

  public void setReference(String reference) {
    this.reference = reference;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
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
