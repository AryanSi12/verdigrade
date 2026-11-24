package com.acme.orders.service;

import com.acme.orders.model.OrderStatus;

public class InvalidTransitionException extends RuntimeException {

    public InvalidTransitionException(OrderStatus from, OrderStatus to) {
        super("An order that is " + from.name().toLowerCase() + " cannot become " + to.name().toLowerCase());
    }
}
