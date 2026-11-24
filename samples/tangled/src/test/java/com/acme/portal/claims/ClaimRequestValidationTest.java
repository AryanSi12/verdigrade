package com.acme.portal.claims;

import static org.junit.jupiter.api.Assertions.assertEquals;

import javax.validation.Validation;
import javax.validation.Validator;
import org.junit.jupiter.api.Test;

class ClaimRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private ClaimRequest request(String description, long cents) {
        ClaimRequest request = new ClaimRequest();
        request.setDescription(description);
        request.setAmountCents(cents);
        return request;
    }

    @Test
    void validRequestPasses() {
        assertEquals(0, validator.validate(request("ok", 1)).size());
    }

    @Test
    void blankDescriptionFails() {
        assertEquals(1, validator.validate(request(" ", 1)).size());
    }

    @Test
    void zeroAmountFails() {
        assertEquals(1, validator.validate(request("ok", 0)).size());
    }

    @Test
    void longDescriptionFails() {
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < 201; i++) {
            text.append('x');
        }
        assertEquals(1, validator.validate(request(text.toString(), 5)).size());
    }
}
