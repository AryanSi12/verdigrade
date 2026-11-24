package com.acme.board.task;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Repository;

/** In-memory store: the sample has no database, so Before and After start with the same seed tasks. */
@Repository
public class TaskRepository {

    private final Map<Long, Task> tasks = new ConcurrentHashMap<>();
    private final AtomicLong ids = new AtomicLong();

    public long nextId() {
        return ids.incrementAndGet();
    }

    public Task save(Task task) {
        tasks.put(task.getId(), task);
        return task;
    }

    public Optional<Task> find(long id) {
        return Optional.ofNullable(tasks.get(id));
    }

    public boolean delete(long id) {
        return tasks.remove(id) != null;
    }

    public List<Task> all() {
        List<Task> list = new ArrayList<>(tasks.values());
        list.sort(Comparator.comparingLong(Task::getId));
        return list;
    }

    public void clear() {
        tasks.clear();
    }
}
