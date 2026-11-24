package com.acme.board.task;

import java.time.LocalDate;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/** A few tasks so the board is not empty on first load. Dates are relative to today. */
@Component
public class SeedData implements CommandLineRunner {

    private final TaskService tasks;

    public SeedData(TaskService tasks) {
        this.tasks = tasks;
    }

    @Override
    public void run(String... args) {
        LocalDate today = LocalDate.now();
        tasks.create("Review the migration plan", "Check the AI items before approving.", Priority.HIGH, today.plusDays(1));
        tasks.create("Update the runbook", null, Priority.MEDIUM, today.plusDays(5));
        tasks.create("Rotate the demo credentials", "Demo values only; nothing real.", Priority.LOW, null);
        tasks.create("Reply to the audit questions", null, Priority.HIGH, today.minusDays(2));
        tasks.complete(tasks.create("Set up the board", "First task, already done.", Priority.LOW, null).getId());
    }
}
