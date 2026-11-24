package com.acme.portal.security;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Demo accounts held in memory. Every account uses the same fake password. */
@Component
public class AccountStore {

    public static final String DEMO_PASSWORD = "demo-pass-not-a-secret";

    private final Map<String, Account> accounts = new LinkedHashMap<String, Account>();

    public AccountStore(PasswordEncoder encoder) {
        String hash = encoder.encode(DEMO_PASSWORD);
        add(new Account("casey", hash, "Casey Claimant", roles(Roles.CLAIMANT)));
        add(new Account("jordan", hash, "Jordan Claimant", roles(Roles.CLAIMANT)));
        add(new Account("alex", hash, "Alex Adjuster", roles(Roles.ADJUSTER)));
        add(new Account("root", hash, "Root Admin", roles(Roles.ADMIN)));
    }

    private void add(Account account) {
        accounts.put(account.getUsername(), account);
    }

    private static java.util.Set<String> roles(String... names) {
        return new LinkedHashSet<String>(Arrays.asList(names));
    }

    public Account find(String username) {
        return username == null ? null : accounts.get(username);
    }

    public Collection<Account> all() {
        return Collections.unmodifiableCollection(new ArrayList<Account>(accounts.values()));
    }

    public List<String> usernames() {
        return new ArrayList<String>(accounts.keySet());
    }
}
