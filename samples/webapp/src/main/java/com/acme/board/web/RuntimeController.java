package com.acme.board.web;

import com.acme.board.runtime.RuntimeInfo;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class RuntimeController {

    /** The page shows the runtime in its header. */
    @GetMapping("/runtime")
    public RuntimeInfo runtime() {
        return RuntimeInfo.read(getClass().getClassLoader());
    }
}
