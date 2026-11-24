package com.acme.board.dto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.acme.board.task.Priority;
import com.acme.board.task.Task;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class TaskResponseTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 20);

    @Test
    void etaCountsTheDaysUntilTheDueDate() {
        Task task = new Task(1, "Ship", null, Priority.HIGH, TODAY.plusDays(3));
        assertEquals(Integer.valueOf(3), new TaskResponse(task, TODAY).getETA());
    }

    @Test
    void etaIsNegativeWhenTheTaskIsLate() {
        Task task = new Task(2, "Late", null, Priority.LOW, TODAY.minusDays(2));
        TaskResponse response = new TaskResponse(task, TODAY);
        assertEquals(Integer.valueOf(-2), response.getETA());
        assertEquals(true, response.isOverdue());
    }

    @Test
    void etaIsNullWithoutADueDate() {
        assertNull(new TaskResponse(new Task(3, "Someday", null, Priority.LOW, null), TODAY).getETA());
    }

    @Test
    void urlIsAPermanentLinkToTheTask() {
        assertEquals("/#task-7", new TaskResponse(new Task(7, "Link", null, Priority.MEDIUM, null), TODAY).getURL());
    }
}
