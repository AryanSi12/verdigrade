package com.acme.board.task;

import java.time.LocalDate;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class TaskService {

    private final TaskRepository repository;

    public TaskService(TaskRepository repository) {
        this.repository = repository;
    }

    public Task create(String title, String notes, Priority priority, LocalDate dueDate) {
        String cleanNotes = notes == null || notes.trim().isEmpty() ? null : notes.trim();
        return repository.save(new Task(repository.nextId(), title.trim(), cleanNotes, priority, dueDate));
    }

    public Task complete(long id) {
        Task task = repository.find(id).orElseThrow(() -> new TaskNotFoundException(id));
        task.complete();
        return task;
    }

    public void delete(long id) {
        if (!repository.delete(id)) {
            throw new TaskNotFoundException(id);
        }
    }

    /** @param status "open", "done" or anything else for all tasks */
    public List<Task> list(String status, Priority priority) {
        return repository.all().stream()
            .filter(task -> "open".equalsIgnoreCase(status) ? !task.isDone() : !"done".equalsIgnoreCase(status) || task.isDone())
            .filter(task -> priority == null || task.getPriority() == priority)
            .collect(Collectors.toList());
    }

    public Stats stats(LocalDate today) {
        List<Task> all = repository.all();
        Map<Priority, Long> open = new EnumMap<>(Priority.class);
        for (Priority priority : Priority.values()) {
            open.put(priority, all.stream().filter(task -> !task.isDone() && task.getPriority() == priority).count());
        }
        long done = all.stream().filter(Task::isDone).count();
        long overdue = all.stream().filter(task -> task.isOverdue(today)).count();
        return new Stats(all.size(), all.size() - done, done, overdue, open);
    }

    public static final class Stats {
        public final long total;
        public final long open;
        public final long done;
        public final long overdue;
        public final Map<Priority, Long> openByPriority;

        Stats(long total, long open, long done, long overdue, Map<Priority, Long> openByPriority) {
            this.total = total;
            this.open = open;
            this.done = done;
            this.overdue = overdue;
            this.openByPriority = openByPriority;
        }
    }
}
