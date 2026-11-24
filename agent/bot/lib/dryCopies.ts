import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { envSetting } from "./config.js";
import { removeWorkCopy, workCopyPrefix } from "./git.js";

/**
 * A dry run works on a temporary copy. The live preview needs the migrated copy after the run, so the newest few
 * copies are kept (VERDIGRADE_KEEP_DRY_COPIES, default 3, 0 = delete at once like before) and removed when:
 * a newer run pushes them out, the run is deleted, or the server starts and finds copies older than a day.
 * A copy with a preview that is still open is never removed.
 */
export function keepDryCopies(): number {
  const raw = envSetting("KEEP_DRY_COPIES");
  const value = Number(raw);
  return raw != null && Number.isInteger(value) && value >= 0 && value <= 20 ? value : 3;
}

type Kept = { runId: string; workPath: string };
const kept: Kept[] = [];
let inUse: (runId: string) => boolean = () => false;

/** The preview manager tells us which runs have a live preview. */
export function setPreviewInUse(check: (runId: string) => boolean): void {
  inUse = check;
}

/** At the end of a dry run: keep the copy for the preview (and drop the oldest ones), or delete it when keeping is off. Returns true when kept. */
export function retainOrRemoveDryCopy(runId: string, workPath: string): boolean {
  if (keepDryCopies() === 0) {
    removeWorkCopy(workPath);
    return false;
  }
  kept.push({ runId, workPath });
  prune();
  return true;
}

function prune(): void {
  const limit = keepDryCopies();
  // Oldest first; a copy whose preview is open stays until it is closed (the next run prunes again).
  for (let index = 0; kept.length > limit && index < kept.length; index += 1) {
    if (inUse(kept[index].runId)) continue;
    removeWorkCopy(kept[index].workPath);
    kept.splice(index, 1);
    index -= 1;
  }
}

/** Remove the kept copy of one run (the run was deleted). */
export function releaseDryCopy(runId: string): void {
  for (let index = kept.length - 1; index >= 0; index -= 1) {
    if (kept[index].runId !== runId) continue;
    removeWorkCopy(kept[index].workPath);
    kept.splice(index, 1);
  }
}

export function keptDryCopies(): Array<{ runId: string; workPath: string }> {
  return kept.map((entry) => ({ ...entry }));
}

/** Delete dry-run copies left behind by an earlier server process (older than `maxAgeMs`). */
export function sweepOldDryCopies(maxAgeMs = 24 * 60 * 60 * 1000, now = Date.now(), tmp = os.tmpdir()): number {
  let removed = 0;
  let names: string[] = [];
  try {
    names = readdirSync(tmp).filter((name) => name.startsWith(workCopyPrefix));
  } catch {
    return 0;
  }
  for (const name of names) {
    const dir = path.join(tmp, name);
    try {
      if (existsSync(dir) && now - statSync(dir).mtimeMs > maxAgeMs && !kept.some((entry) => path.dirname(entry.workPath) === dir)) {
        rmSync(dir, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      /* in use or already gone */
    }
  }
  return removed;
}
