package com.acme.board.dto;

import com.acme.board.task.Priority;
import java.time.LocalDate;
import javax.validation.constraints.FutureOrPresent;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;

public class TaskRequest {

    @NotBlank(message = "Give the task a title")
    @Size(max = 80, message = "Keep the title to 80 characters or fewer")
    private String title;

    @Size(max = 200, message = "Keep the notes to 200 characters or fewer")
    private String notes;

    @NotNull(message = "Pick a priority")
    private Priority priority;

    @FutureOrPresent(message = "The due date cannot be in the past")
    private LocalDate dueDate;

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public Priority getPriority() {
        return priority;
    }

    public void setPriority(Priority priority) {
        this.priority = priority;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public void setDueDate(LocalDate dueDate) {
        this.dueDate = dueDate;
    }
}
