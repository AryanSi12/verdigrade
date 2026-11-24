package com.acme.board.web;

import com.acme.board.dto.TaskRequest;
import com.acme.board.dto.TaskResponse;
import com.acme.board.task.Priority;
import com.acme.board.task.TaskService;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final TaskService tasks;

    public TaskController(TaskService tasks) {
        this.tasks = tasks;
    }

    @GetMapping
    public List<TaskResponse> list(@RequestParam(defaultValue = "all") String status, @RequestParam(required = false) Priority priority) {
        LocalDate today = LocalDate.now();
        return tasks.list(status, priority).stream().map(task -> new TaskResponse(task, today)).collect(Collectors.toList());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TaskResponse create(@Valid @RequestBody TaskRequest request) {
        return new TaskResponse(tasks.create(request.getTitle(), request.getNotes(), request.getPriority(), request.getDueDate()), LocalDate.now());
    }

    @PostMapping("/{id}/complete")
    public TaskResponse complete(@PathVariable long id) {
        return new TaskResponse(tasks.complete(id), LocalDate.now());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        tasks.delete(id);
    }

    @GetMapping("/stats")
    public TaskService.Stats stats() {
        return tasks.stats(LocalDate.now());
    }
}
