package com.acme.library.util;

import java.io.StringWriter;
import java.util.List;
import com.acme.library.entity.Loan;

/** Builds a small CSV report. */
public class OverdueReportWriter {

  private final StringWriter out = new StringWriter();

  public String write(List<Loan> loans) {
    out.write("loanId,member,book,dueOn\n");
    for (Loan loan : loans) {
      out.write(loan.getId() + "," + loan.getMember().getUsername() + "," + loan.getBook().getIsbn() + "," + loan.getDueOn() + "\n");
    }
    return out.toString();
  }
}
