package com.acme.portal.web;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.servlet.http.HttpServletResponse;

/** The one JSON error shape of the portal, used by the security entry points, the interceptors and the advice. */
public final class ErrorBodies {

    private ErrorBodies() {
    }

    public static Map<String, Object> body(String error, String detail) {
        Map<String, Object> body = new LinkedHashMap<String, Object>();
        body.put("error", error);
        if (detail != null) {
            body.put("detail", detail);
        }
        return body;
    }

    public static String json(String error, String detail) {
        StringBuilder out = new StringBuilder("{\"error\":\"").append(escape(error)).append('"');
        if (detail != null) {
            out.append(",\"detail\":\"").append(escape(detail)).append('"');
        }
        return out.append('}').toString();
    }

    public static void write(HttpServletResponse response, int status, String error, String detail) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(json(error, detail));
    }

    static String escape(String text) {
        return text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }
}
