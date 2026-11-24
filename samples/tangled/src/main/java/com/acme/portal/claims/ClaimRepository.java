package com.acme.portal.claims;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Repository;

@Repository
public class ClaimRepository {

    private final Map<Long, Claim> claims = new ConcurrentHashMap<Long, Claim>();
    private final AtomicLong ids = new AtomicLong();

    public Claim create(String owner, String description, long amountCents) {
        Claim claim = new Claim(ids.incrementAndGet(), owner, description, amountCents);
        claims.put(claim.getId(), claim);
        return claim;
    }

    public Claim find(long id) {
        return claims.get(id);
    }

    public List<Claim> all() {
        List<Claim> list = new ArrayList<Claim>(claims.values());
        list.sort((a, b) -> Long.compare(a.getId(), b.getId()));
        return list;
    }

    public int deleteAll() {
        int count = claims.size();
        claims.clear();
        return count;
    }
}
