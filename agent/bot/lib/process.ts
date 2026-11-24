import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import path from "node:path";

export type CommandResult = {
  ok: boolean;
  command: string;
  exitCode: number | null;
  /** Why the command did not produce an exit code (spawn error, timeout, cancelled). */
  failure: "spawn" | "timeout" | "cancelled" | null;
  /** The last `tailChars` characters of combined stdout/stderr. */
  output: string;
  /** Total characters seen (the full log lives in logFile when one was given). */
  outputChars: number;
  durationMs: number;
  logFile: string | null;
};

export type RunOptions = {
  cwd: string;
  timeoutMs?: number;
  /** Keep this many trailing characters in memory (ring buffer). */
  tailChars?: number;
  /** Stream the full output to this file. */
  logFile?: string;
  env?: NodeJS.ProcessEnv;
  onOutput?: (chunk: string) => void;
  signal?: AbortSignal;
};

/** Keeps only the last `limit` characters without ever holding the full output. */
export class RingBuffer {
  private parts: string[] = [];
  private size = 0;
  total = 0;
  constructor(private readonly limit: number) {}

  push(chunk: string): void {
    if (!chunk) return;
    this.total += chunk.length;
    this.parts.push(chunk);
    this.size += chunk.length;
    while (this.size > this.limit && this.parts.length > 1) {
      const first = this.parts[0];
      const excess = this.size - this.limit;
      if (first.length <= excess) {
        this.parts.shift();
        this.size -= first.length;
      } else {
        this.parts[0] = first.slice(excess);
        this.size -= excess;
      }
    }
    if (this.size > this.limit) {
      this.parts = [this.parts.join("").slice(-this.limit)];
      this.size = this.limit;
    }
  }

  toString(): string {
    return this.parts.join("");
  }
}

const unsafeWindowsChars = /["%!\r\n\0^]/;
const needsQuoting = /[\s&|<>()]/;

/**
 * Quote one argument for cmd.exe. Arguments that cmd.exe could reinterpret
 * (quotes, %VAR% / !VAR! expansion, caret escapes, line breaks) are rejected
 * outright instead of escaped, so no caller can smuggle a second command.
 */
export function quoteWindowsArg(arg: string): string {
  if (unsafeWindowsChars.test(arg)) {
    throw new Error(`Refusing to pass an argument with shell metacharacters to cmd.exe: ${JSON.stringify(arg)}`);
  }
  if (arg === "") return '""';
  return needsQuoting.test(arg) ? `"${arg}"` : arg;
}

/** Build the cmd.exe /c line for a .cmd/.bat launcher (mvnw.cmd, mvn.cmd, gradlew.bat). */
export function windowsCommandLine(command: string, args: string[]): string {
  return [quoteWindowsArg(command), ...args.map(quoteWindowsArg)].join(" ");
}

function isBatchFile(command: string): boolean {
  return /\.(cmd|bat)$/i.test(command);
}

export function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

/**
 * Run a command with an argument array (never a shell string). Output is
 * streamed: the full text goes to `logFile`, the last `tailChars` stay in
 * memory, so a large build can never fail because of a buffer limit.
 * Batch launchers on Windows go through `cmd.exe /d /s /c` with every
 * argument validated by quoteWindowsArg.
 */
export function runCommand(command: string, args: string[], options: RunOptions): Promise<CommandResult> {
  const started = Date.now();
  const tail = new RingBuffer(options.tailChars ?? 64_000);
  const display = [command, ...args].join(" ");
  let log: WriteStream | null = null;
  if (options.logFile) {
    mkdirSync(path.dirname(options.logFile), { recursive: true });
    log = createWriteStream(options.logFile, { flags: "a" });
    log.write(`$ ${display}\n(cwd ${options.cwd})\n`);
  }

  return new Promise((resolve) => {
    let settled = false;
    let failure: CommandResult["failure"] = null;
    const finish = (exitCode: number | null, extra = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (extra) {
        tail.push(extra);
        log?.write(extra);
      }
      log?.end();
      resolve({
        ok: exitCode === 0 && failure === null,
        command: display,
        exitCode,
        failure,
        output: tail.toString(),
        outputChars: tail.total,
        durationMs: Date.now() - started,
        logFile: options.logFile ?? null,
      });
    };

    let child: ReturnType<typeof spawn>;
    try {
      const windowsBatch = process.platform === "win32" && isBatchFile(command);
      child = windowsBatch
        ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${windowsCommandLine(command, args)}"`], {
            cwd: options.cwd,
            env: options.env ?? process.env,
            windowsHide: true,
            windowsVerbatimArguments: true,
          })
        : spawn(command, args, {
            cwd: options.cwd,
            env: options.env ?? process.env,
            windowsHide: true,
            detached: process.platform !== "win32",
          });
    } catch (error) {
      failure = "spawn";
      finish(null, `\n[verdigrade] could not start ${command}: ${(error as Error).message}\n`);
      return;
    }

    const onData = (data: Buffer) => {
      const text = data.toString("utf8");
      tail.push(text);
      log?.write(text);
      options.onOutput?.(text);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
    const timer = setTimeout(() => {
      failure = "timeout";
      killTree(child.pid);
      finish(null, `\n[verdigrade] timed out after ${Math.round(timeoutMs / 1000)}s; process tree killed\n`);
    }, timeoutMs);
    const onAbort = () => {
      failure = "cancelled";
      killTree(child.pid);
      finish(null, "\n[verdigrade] cancelled; process tree killed\n");
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (error) => {
      failure = "spawn";
      finish(null, `\n[verdigrade] could not start ${command}: ${error.message}\n`);
    });
    child.on("close", (code) => finish(typeof code === "number" ? code : null));
  });
}

export type TestTotals = {
  testsRun: number;
  failures: number;
  errors: number;
  skipped: number;
};

/**
 * Sum Maven Surefire/Failsafe console summaries. Per-class lines carry
 * "Time elapsed" (or "-- in <class>") and are ignored; the "Results:" summary
 * line of every module is added up. Returns null when no summary was printed.
 */
export function parseMavenTestTotals(output: string): TestTotals | null {
  const totals: TestTotals = { testsRun: 0, failures: 0, errors: 0, skipped: 0 };
  let found = false;
  const pattern = /Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+)(?:,\s*Skipped:\s*(\d+))?(.*)$/gm;
  for (const match of output.matchAll(pattern)) {
    const rest = match[5] ?? "";
    if (/Time elapsed|--\s*in\s|\s-\s*in\s/.test(rest)) continue;
    found = true;
    totals.testsRun += Number(match[1]);
    totals.failures += Number(match[2]);
    totals.errors += Number(match[3]);
    totals.skipped += Number(match[4] ?? 0);
  }
  return found ? totals : null;
}

export function parseArtifactPaths(output: string): string[] {
  const found = new Set<string>();
  for (const match of output.matchAll(/Building (?:jar|war|ear):\s*(\S.*\.(?:jar|war|ear))\s*$/gim)) found.add(match[1].trim());
  return [...found];
}

/** First failing assertion or error line from a Maven/Gradle log. */
export function firstFailure(output: string): string {
  const lines = output.split(/\r?\n/);
  const index = lines.findIndex((line) =>
    /(\[ERROR\] .*(FAIL|Tests run:.*Failures: [1-9]|expected|Exception|COMPILATION ERROR))|FAILED|BUILD FAILURE|AssertionFailedError/.test(line),
  );
  if (index < 0) return "";
  return lines.slice(index, index + 8).join("\n").trim();
}

export type ServerProcess = {
  child: ReturnType<typeof spawn>;
  pid: number | undefined;
  /** Exit code once the process has ended (null while running or when it was killed). */
  exited: Promise<number | null>;
  /** Kill the whole process tree (taskkill /T on Windows, the process group elsewhere). */
  stop: () => void;
};

/**
 * Start a long-running server (a preview). Same launch rules as runCommand (argument array, .cmd batch files
 * through cmd.exe with validated arguments), but it returns at once; output goes to `onOutput`.
 */
export function startServerProcess(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; onOutput: (chunk: string) => void }): ServerProcess {
  const windowsBatch = process.platform === "win32" && isBatchFile(command);
  const child = windowsBatch
    ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${windowsCommandLine(command, args)}"`], {
        cwd: options.cwd,
        env: options.env,
        windowsHide: true,
        windowsVerbatimArguments: true,
      })
    : spawn(command, args, { cwd: options.cwd, env: options.env, windowsHide: true, detached: process.platform !== "win32" });
  child.stdout?.on("data", (data: Buffer) => options.onOutput(data.toString("utf8")));
  child.stderr?.on("data", (data: Buffer) => options.onOutput(data.toString("utf8")));
  const exited = new Promise<number | null>((resolve) => {
    child.on("error", (error) => {
      options.onOutput(`\n[verdigrade] could not start ${command}: ${error.message}\n`);
      resolve(null);
    });
    child.on("close", (code) => resolve(typeof code === "number" ? code : null));
  });
  return { child, pid: child.pid, exited, stop: () => killTree(child.pid) };
}
