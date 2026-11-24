import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const created: string[] = [];

/** A temp folder that is deleted when the test file finishes. */
export function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of created.splice(0)) try {
      // Windows can hold a file handle for a moment (antivirus, indexer): retry, then give up quietly.
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* a leftover temp folder is not a test failure */
    }
});
