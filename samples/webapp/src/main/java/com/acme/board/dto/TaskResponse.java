package com.acme.board.dto;

import com.acme.board.task.Priority;
import com.acme.board.task.Task;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

public class TaskResponse {

    private final long id;
    private final String title;
    private final String notes;
    private final Priority priority;
    private final LocalDate dueDate;
    private final boolean done;
    private final boolean overdue;
    private final Integer eta;
    private final String url;

    public TaskResponse(Task task, LocalDate today) {
        this.id = task.getId();
        this.title = task.getTitle();
        this.notes = task.getNotes();
        this.priority = task.getPriority();
        this.dueDate = task.getDueDate();
        this.done = task.isDone();
        this.overdue = task.isOverdue(today);
        this.eta = task.getDueDate() == null ? null : (int) ChronoUnit.DAYS.between(today, task.getDueDate());
        this.url = "/#task-" + task.getId();
    }

    public long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getNotes() {
        return notes;
    }

    public Priority getPriority() {
        return priority;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public boolean isDone() {
        return done;
    }

    public boolean isOverdue() {
        return overdue;
    }

    /** Days until the due date (negative when it is late); null when the task has no due date. The page shows "due in N days" from this. */
    public Integer getETA() {
        return eta;
    }

    /** A permanent link to the task; the page shows it under the title. */
    public String getURL() {
        return url;
    }
}
