/**
 * Where the Verdigrade routes live. VERDIGRADE_URL is the server root (default http://127.0.0.1:3000); the agent
 * server mounts the routes under /agent, older setups serve them at the root. Probe both and use the first
 * that answers /config. A URL that already ends in .../v1/channels/migrate is used as given.
 */
export async function discoverBase(root: string, token?: string | null, fetcher: typeof fetch = fetch): Promise<{ base: string; tried: string[] }> {
  const trimmed = root.replace(/\/+$/, "");
  const suffix = "/v1/channels/migrate";
  if (trimmed.endsWith(suffix)) return { base: trimmed, tried: [trimmed] };
  const candidates = trimmed.endsWith("/agent") ? [`${trimmed}${suffix}`] : [`${trimmed}/agent${suffix}`, `${trimmed}${suffix}`];
  for (const base of candidates) {
    try {
      const response = await fetcher(`${base}/config`, { headers: token ? { authorization: `Bearer ${token}` } : undefined });
      const text = await response.text();
      if (response.status === 401 || response.status === 403) return { base, tried: candidates };
      if (response.ok && text.trim().startsWith("{") && /"engines"|"version"/.test(text)) return { base, tried: candidates };
    } catch {
      /* try the next candidate */
    }
  }
  return { base: candidates[0], tried: candidates };
}

