#!/usr/bin/env node
// Headless entry point: `npx leapfrog migrate <path> --dry-run` (`npx java-migrator` is a kept alias).
// The TypeScript sources run through tsx, the same loader the agent SDK uses.
import { register } from "tsx/esm/api";

register();
await import("../cli/main.ts");
