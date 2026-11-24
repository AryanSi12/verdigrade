package com.acme.board.task;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TaskServiceTest {

    private TaskService service;

    @BeforeEach
    void setUp() {
        service = new TaskService(new TaskRepository());
    }

    @Test
    void createTrimsTextAndStartsOpen() {
        Task task = service.create("  Write docs  ", "  details  ", Priority.MEDIUM, null);
        assertEquals("Write docs", task.getTitle());
        assertEquals("details", task.getNotes());
        assertFalse(task.isDone());
        assertNotNull(task.getCreatedAt());
    }



    @Test
    void completeMarksDoneAndStampsTime() {
        Task task = service.create("A", null, Priority.HIGH, null);
        service.complete(task.getId());
        assertTrue(task.isDone());
        assertNotNull(task.getCompletedAt());
    }

    @Test
    void completeUnknownTaskFails() {
        assertThrows(TaskNotFoundException.class, () -> service.complete(999));
    }

    @Test
    void deleteRemovesTheTask() {
        Task task = service.create("A", null, Priority.LOW, null);
        service.delete(task.getId());
        assertTrue(service.list("all", null).isEmpty());
        assertThrows(TaskNotFoundException.class, () -> service.delete(task.getId()));
    }

    @Test
    void listFiltersByStatus() {
        Task open = service.create("open one", null, Priority.LOW, null);
        Task done = service.create("done one", null, Priority.LOW, null);
        service.complete(done.getId());
        assertEquals(2, service.list("all", null).size());
        assertEquals(Collections.singletonList(open.getId()), ids(service.list("open", null)));
        assertEquals(Collections.singletonList(done.getId()), ids(service.list("done", null)));
        assertEquals(2, service.list("anything-else", null).size());
    }

    @Test
    void listFiltersByPriority() {
        service.create("a", null, Priority.HIGH, null);
        service.create("b", null, Priority.LOW, null);
        assertEquals(1, service.list("all", Priority.HIGH).size());
        assertEquals(1, service.list("all", Priority.LOW).size());
        assertEquals(0, service.list("all", Priority.MEDIUM).size());
    }

    @Test
    void statsCountOpenDoneAndOverdue() {
        LocalDate today = LocalDate.of(2026, 6, 15);
        service.create("late", null, Priority.HIGH, today.minusDays(1));
        service.create("later", null, Priority.MEDIUM, today.plusDays(3));
        Task finished = service.create("finished late", null, Priority.HIGH, today.minusDays(5));
        service.complete(finished.getId());
        TaskService.Stats stats = service.stats(today);
        assertEquals(3, stats.total);
        assertEquals(2, stats.open);
        assertEquals(1, stats.done);
        assertEquals(1, stats.overdue);
        assertEquals(1L, stats.openByPriority.get(Priority.HIGH));
        assertEquals(1L, stats.openByPriority.get(Priority.MEDIUM));
        assertEquals(0L, stats.openByPriority.get(Priority.LOW));
    }

    private static List<Long> ids(List<Task> tasks) {
        return tasks.stream().map(Task::getId).collect(java.util.stream.Collectors.toList());
    }
}
