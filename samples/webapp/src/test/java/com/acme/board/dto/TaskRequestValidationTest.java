package com.acme.board.dto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.acme.board.task.Priority;
import java.time.LocalDate;
import java.util.Collections;
import java.util.Set;
import java.util.stream.Collectors;
import javax.validation.ConstraintViolation;
import javax.validation.Validation;
import javax.validation.Validator;
import org.junit.jupiter.api.Test;

class TaskRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private static TaskRequest valid() {
        TaskRequest request = new TaskRequest();
        request.setTitle("Write the report");
        request.setPriority(Priority.HIGH);
        return request;
    }

    private static String chars(int count) {
        return new String(new char[count]).replace('\0', 'x');
    }

    private Set<String> problems(TaskRequest request) {
        return validator.validate(request).stream().map(ConstraintViolation::getPropertyPath).map(Object::toString).collect(Collectors.toSet());
    }

    @Test
    void aCompleteRequestIsValid() {
        assertTrue(validator.validate(valid()).isEmpty());
    }

    @Test
    void blankTitleIsRejected() {
        TaskRequest request = valid();
        request.setTitle("   ");
        assertEquals(Collections.singleton("title"), problems(request));
    }

    @Test
    void titleLongerThanEightyCharactersIsRejected() {
        TaskRequest request = valid();
        request.setTitle(chars(81));
        assertEquals(Collections.singleton("title"), problems(request));
    }

    @Test
    void missingPriorityIsRejected() {
        TaskRequest request = valid();
        request.setPriority(null);
        assertEquals(Collections.singleton("priority"), problems(request));
    }

    @Test
    void pastDueDateIsRejectedButTodayIsFine() {
        TaskRequest request = valid();
        request.setDueDate(LocalDate.now().minusDays(1));
        assertEquals(Collections.singleton("dueDate"), problems(request));
        request.setDueDate(LocalDate.now());
        assertTrue(validator.validate(request).isEmpty());
    }

}
