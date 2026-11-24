package com.acme.orders.web;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** The real controllers, validation and JSON, called the way the page calls them. */
@SpringBootTest
@AutoConfigureMockMvc
class OrderApiTest {

    private static final String GOLD_ORDER = "{\"customer\":\"Acme Rockets\",\"email\":\"Buy@Acme.example\",\"tier\":\"gold\","
        + "\"items\":[{\"sku\":\"ab-1\",\"name\":\"Fuel valve\",\"quantity\":2,\"unitPrice\":100.00}],\"note\":\"Rush\"}";

    @Autowired
    private MockMvc mvc;

    private long create(String body) throws Exception {
        String json = mvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private void setStatus(long id, String status, int expected) throws Exception {
        mvc.perform(patch("/api/orders/" + id + "/status").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"" + status + "\"}"))
            .andExpect(status().is(expected));
    }

    @Test
    void listsTheSeededOrders() throws Exception {
        mvc.perform(get("/api/orders"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()", greaterThanOrEqualTo(6)))
            .andExpect(jsonPath("$[*].customer", hasItem("Northwind Traders")));
    }

    @Test
    void filtersByStatus() throws Exception {
        mvc.perform(get("/api/orders").param("status", "delivered"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[*].status", everyItem(is("DELIVERED"))))
            .andExpect(jsonPath("$[*].customer", hasItem("Northwind Traders")));
    }

    @Test
    void createsAnOrderWithTierDiscountAndANumber() throws Exception {
        String json = mvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON).content(GOLD_ORDER))
            .andExpect(status().isCreated())
            .andExpect(header().string("Location", containsString("/api/orders/")))
            .andExpect(jsonPath("$.number", containsString("OD-")))
            .andExpect(jsonPath("$.email").value("buy@acme.example"))
            .andExpect(jsonPath("$.tier").value("GOLD"))
            .andExpect(jsonPath("$.status").value("NEW"))
            .andExpect(jsonPath("$.items[0].sku").value("AB-1"))
            .andExpect(jsonPath("$.items[0].lineTotal").value(200.0))
            .andExpect(jsonPath("$.itemCount").value(2))
            .andExpect(jsonPath("$.subtotal").value(200.0))
            .andExpect(jsonPath("$.discount").value(20.0))
            .andExpect(jsonPath("$.total").value(180.0))
            .andExpect(jsonPath("$.nextStatuses", hasItem("PAID")))
            .andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(json, "$.id")).longValue();
        mvc.perform(get("/api/orders/" + id)).andExpect(status().isOk()).andExpect(jsonPath("$.customer").value("Acme Rockets"));
    }

    @Test
    void rejectsAnInvalidOrderWithFieldMessages() throws Exception {
        mvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON)
                .content("{\"customer\":\"\",\"email\":\"not-an-email\",\"items\":[{\"sku\":\"X\",\"name\":\"Thing\",\"quantity\":0,\"unitPrice\":5}]}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.status").value(400))
            .andExpect(jsonPath("$.fields.customer").value("Customer is required"))
            .andExpect(jsonPath("$.fields.email").value("Email must be a valid address"))
            .andExpect(jsonPath("$.fields['items[0].quantity']").value("Quantity must be at least 1"));
    }

    @Test
    void rejectsAnOrderWithoutItems() throws Exception {
        mvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON).content("{\"customer\":\"A\",\"email\":\"a@b.example\",\"items\":[]}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.items").value("Add at least one item"));
    }

    @Test
    void rejectsBrokenJson() throws Exception {
        mvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON).content("{nope"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("The request body is not valid JSON"));
    }

    @Test
    void unknownOrderIs404() throws Exception {
        mvc.perform(get("/api/orders/999999")).andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("Order 999999 was not found"));
    }

    @Test
    void walksAnOrderThroughItsLifecycle() throws Exception {
        long id = create(GOLD_ORDER);
        setStatus(id, "paid", 200);
        setStatus(id, "SHIPPED", 200);
        setStatus(id, "DELIVERED", 200);
        mvc.perform(get("/api/orders/" + id)).andExpect(jsonPath("$.status").value("DELIVERED")).andExpect(jsonPath("$.nextStatuses.length()").value(0));
    }

    @Test
    void refusesAnImpossibleTransition() throws Exception {
        long id = create(GOLD_ORDER);
        mvc.perform(patch("/api/orders/" + id + "/status").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"DELIVERED\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.message").value("An order that is new cannot become delivered"));
    }

    @Test
    void refusesAnUnknownStatus() throws Exception {
        long id = create(GOLD_ORDER);
        mvc.perform(patch("/api/orders/" + id + "/status").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"LOST\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Unknown status: LOST"));
    }

    @Test
    void deletesOnlyNewOrCancelledOrders() throws Exception {
        long fresh = create(GOLD_ORDER);
        mvc.perform(delete("/api/orders/" + fresh)).andExpect(status().isNoContent());
        mvc.perform(get("/api/orders/" + fresh)).andExpect(status().isNotFound());
        long paid = create(GOLD_ORDER);
        setStatus(paid, "PAID", 200);
        mvc.perform(delete("/api/orders/" + paid)).andExpect(status().isConflict());
    }

    @Test
    void dashboardSummarisesTheOrders() throws Exception {
        mvc.perform(get("/api/dashboard"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.orderCount", greaterThanOrEqualTo(6)))
            .andExpect(jsonPath("$.openCount", greaterThanOrEqualTo(1)))
            .andExpect(jsonPath("$.revenue").isNumber())
            .andExpect(jsonPath("$.averageOrder").isNumber())
            .andExpect(jsonPath("$.byStatus.CANCELLED", greaterThanOrEqualTo(1)))
            .andExpect(jsonPath("$.topProducts.length()").value(3));
    }

    @Test
    void exportsCsv() throws Exception {
        mvc.perform(get("/api/export"))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Disposition", containsString("orders.csv")))
            .andExpect(content().string(containsString("number,customer,status,items,total,created")))
            .andExpect(content().string(containsString("Northwind Traders")));
    }
}
