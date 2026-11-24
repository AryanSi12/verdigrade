package com.acme.board.task;

import java.time.Instant;
import java.time.LocalDate;

public class Task {

    private final long id;
    private String title;
    private String notes;
    private Priority priority;
    private LocalDate dueDate;
    private boolean done;
    private final Instant createdAt;
    private Instant completedAt;

    public Task(long id, String title, String notes, Priority priority, LocalDate dueDate) {
        this.id = id;
        this.title = title;
        this.notes = notes;
        this.priority = priority;
        this.dueDate = dueDate;
        this.createdAt = Instant.now();
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

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public void complete() {
        if (!done) {
            done = true;
            completedAt = Instant.now();
        }
    }

    public boolean isOverdue(LocalDate today) {
        return !done && dueDate != null && dueDate.isBefore(today);
    }
}
