import { useEffect, useId, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Check, ClipboardList, Coffee, Download, FlaskConical, FolderOpen, KeyRound, LoaderCircle, FolderSearch, Info, Languages, Leaf, Play, Route as RouteIcon, ScanSearch, Settings2, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import Journey from "../components/Journey.jsx";
import LangBadge, { LangGlyph, langTones } from "../components/LangBadge.jsx";
import { ecosystemMeta, roadmap } from "../ecosystems.js";
import FolderPicker from "../components/FolderPicker.jsx";
import SourceBadge, { GitHubMark } from "../components/SourceBadge.jsx";
import { useToast } from "../components/Toaster.jsx";
import { Button, Card, CardHeader, ContentHeader, controlClass, ErrorState, Field, Pill, Segmented, Select, Skeleton, Spinner, Switch } from "../components/ui.jsx";
import { api } from "../api.js";
import { useMigration } from "../migrationContext.js";
import { useAsync } from "../useAsync.js";

export default function NewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { matrix, matrixError, reloadMatrix, config } = useMigration();
  const [repoPath, setRepoPath] = useState(() => location.state?.repoPath || "");
  const [ecosystem, setEcosystem] = useState("");
  const [targetNode, setTargetNode] = useState("");
  const [targetTypescript, setTargetTypescript] = useState("");
  const [fromNode, setFromNode] = useState("");
  const [targetPython, setTargetPython] = useState("");
  const [fromPython, setFromPython] = useState("");
  const [previewTools, setPreviewTools] = useState(false);
  const [aiReview, setAiReview] = useState(true);
  const nodeMatrix = useAsync((signal) => api.matrix(signal, "node"), []);
  const pythonMatrix = useAsync((signal) => api.matrix(signal, "python"), []);
  const samples = useAsync((signal) => api.samples(signal), []);
  const [targetJava, setTargetJava] = useState("");
  const [targetBoot, setTargetBoot] = useState("");
  const [fromJava, setFromJava] = useState("");
  const [fromBoot, setFromBoot] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [skipTests, setSkipTests] = useState(false);
  const [allowDirty, setAllowDirty] = useState(false);
  const [fixRounds, setFixRounds] = useState("");
  const [browsing, setBrowsing] = useState(false);
  // Project source: a local folder, or a GitHub repo cloned onto this computer first.
  const [sourceMode, setSourceMode] = useState("local");
  const [ghUrl, setGhUrl] = useState("");
  const [ghBranch, setGhBranch] = useState("");
  const [ghSubdir, setGhSubdir] = useState("");
  const [ghToken, setGhToken] = useState("");
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState(null);
  const [cloned, setCloned] = useState(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const ids = useId();
  const toast = useToast();

  // Fill the targets from the matrix defaults once it arrives (never hardcoded here).
  useEffect(() => {
    if (!matrix) return;
    setTargetJava((value) => value || matrix.defaults.targetJava);
    setTargetBoot((value) => value || matrix.defaults.targetBoot);
  }, [matrix]);

  useEffect(() => {
    if (location.state?.repoPath) setRepoPath(location.state.repoPath);
  }, [location.state]);

  // Debounced route preview; scanning the repo tells us the detected From versions.
  const [previewKey, setPreviewKey] = useState("");
  useEffect(() => {
    const key = JSON.stringify({ repoPath: repoPath.trim(), ecosystem, targetJava, targetBoot, fromJava, fromBoot, targetNode, targetTypescript, fromNode, targetPython, fromPython });
    const timer = setTimeout(() => setPreviewKey(key), 350);
    return () => clearTimeout(timer);
  }, [repoPath, ecosystem, targetJava, targetBoot, fromJava, fromBoot, targetNode, targetTypescript, fromNode, targetPython, fromPython]);

  const preview = useAsync(async (signal) => {
    if (!previewKey) return null;
    const input = JSON.parse(previewKey);
    if (!input.targetJava) return null;
    try {
      return await api.resolve(
        {
          ecosystem: input.ecosystem || undefined,
          targetNode: input.targetNode || undefined,
          targetTypescript: input.targetTypescript || undefined,
          fromNode: input.fromNode || undefined,
          targetPython: input.targetPython || undefined,
          fromPython: input.fromPython || undefined,
          targetJava: input.targetJava,
          targetBoot: input.targetBoot,
          fromJava: input.fromJava || undefined,
          fromBoot: input.fromBoot || undefined,
          repoPath: input.repoPath || undefined,
        },
        signal,
      );
    } catch (error) {
      if (error?.status === 400 && error.body) return error.body;
      throw error;
    }
  }, [previewKey]);

  const route = preview.data;
  const activeEcosystem = ecosystem || route?.ecosystem || "java";
  const node = activeEcosystem === "node";
  const python = activeEcosystem === "python";
  useEffect(() => {
    if (nodeMatrix.data) {
      setTargetNode((v) => v || nodeMatrix.data.defaults.node);
      setTargetTypescript((v) => v || nodeMatrix.data.defaults.typescript);
    }
  }, [nodeMatrix.data]);
  useEffect(() => {
    if (pythonMatrix.data) setTargetPython((v) => v || pythonMatrix.data.defaults.python);
  }, [pythonMatrix.data]);
  const canStart = Boolean(repoPath.trim() && route?.ok && !starting);

  async function submit(event) {
    event.preventDefault();
    if (!canStart) return;
    setStarting(true);
    setStartError(null);
    const startedAt = Date.now();
    try {
      const accepted = await api.createPlanAsync({
        repoPath: repoPath.trim(),
        ecosystem: ecosystem || undefined,
        targetNode: targetNode || undefined,
        targetTypescript: targetTypescript || undefined,
        fromNode: fromNode || undefined,
        targetPython: targetPython || undefined,
        fromPython: fromPython || undefined,
        preview: previewTools,
        ai: aiReview,
        targetJava,
        targetBoot,
        fromJava: fromJava || undefined,
        fromBoot: fromBoot || undefined,
      });
      const state = {
        runOptions: { dryRun, skipTests, allowDirty: !dryRun && allowDirty, fixRounds: fixRounds === "" ? undefined : Number(fixRounds) },
        planning: { startedAt },
        repoLabel: sourceMode === "github" && cloned ? cloned.url || repoPath : repoPath,
      };
      // A local folder is usually planned in well under a second: wait that long here, so a
      // quick plan opens directly and a mistake (wrong folder, "pick a subfolder") stays on this form.
      let job = accepted.job;
      const deadline = startedAt + 900;
      while (job.status === "running" && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        job = (await api.planJob(accepted.jobId)).job;
      }
      if (job.status === "failed") {
        const error = new Error(job.error || "The plan could not be created.");
        error.body = { error: job.error, code: job.code, candidates: job.candidates };
        throw error;
      }
      // Still working (e.g. getting the repo from GitHub): open the plan screen now; it fills in as planning goes.
      navigate(job.status === "done" && job.planId ? `/plan/${job.planId}` : `/planning/${accepted.jobId}`, { state });
    } catch (error) {
      setStartError(error);
      setStarting(false);
      toast.error("Could not create the plan", error?.message || String(error));
    }
  }

  function resetDetected() {
    setEcosystem("");
    setFromJava("");
    setFromBoot("");
    setFromNode("");
    setFromPython("");
  }

  function switchSource(mode) {
    if (mode === sourceMode) return;
    setSourceMode(mode);
    setRepoPath(mode === "github" && cloned ? cloned.localPath : "");
    setBrowsing(false);
    resetDetected();
  }

  function editGitHub(setter) {
    return (event) => {
      setter(event.target.value);
      setCloneError(null);
      if (cloned) {
        setCloned(null);
        setRepoPath("");
      }
    };
  }

  async function getRepo(subdirChoice) {
    if (!ghUrl.trim() || cloning) return;
    const subdir = typeof subdirChoice === "string" ? subdirChoice : ghSubdir.trim();
    if (typeof subdirChoice === "string") setGhSubdir(subdirChoice);
    setCloning(true);
    setCloneError(null);
    try {
      const result = await api.cloneGithub({ url: ghUrl.trim(), branch: ghBranch.trim() || undefined, subdir: subdir || undefined, githubToken: ghToken.trim() || undefined, refresh: true });
      setCloned(result.source);
      setRepoPath(result.repoPath);
      resetDetected();
      setGhToken("");
      toast.success("Repository ready", `${result.source.owner}/${result.source.repo} is cloned on this computer${result.source.subdir ? `; project folder ${result.source.subdir}` : ""}.`);
    } catch (error) {
      setCloneError(error);
    } finally {
      setCloning(false);
    }
  }

  const detectedBoot = route?.detected ? route.detected.boot || (route.detected.classicSpring ? "classic Spring" : "none") : "";

  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-6 pb-12 sm:px-8 sm:pt-8">
      <ContentHeader
        crumbs={[{ label: "Overview", to: "/" }, { label: "New migration" }]}
        title="New migration"
        subtitle="Choose a project and a target. Nothing changes here: next you get a read-only plan to review and approve."
      />
      <Journey current="new" className="mt-6" />

      <form onSubmit={submit} className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Card className="min-w-0">
            <CardHeader
              icon={sourceMode === "github" ? GitHubMark : FolderOpen}
              title={<><StepNo n={1} />Project</>}
              description={sourceMode === "github" ? "Paste a GitHub repository link. Verdigrade clones it onto this computer and migrates the copy" : "A Maven, Gradle, npm or Python (pip) project inside the allowed roots"}
            />
            <div className="p-5">
              <Segmented
                label="Project source"
                value={sourceMode}
                onChange={switchSource}
                options={[
                  { value: "local", label: "Local folder", icon: FolderOpen },
                  { value: "github", label: "GitHub repo", icon: GitHubMark },
                ]}
                className="mb-4"
              />
              {sourceMode === "github" ? (
                <GitHubSource
                  ids={ids}
                  url={ghUrl}
                  branch={ghBranch}
                  subdir={ghSubdir}
                  onSubdir={editGitHub(setGhSubdir)}
                  token={ghToken}
                  onUrl={editGitHub(setGhUrl)}
                  onBranch={editGitHub(setGhBranch)}
                  onToken={(event) => setGhToken(event.target.value)}
                  onGet={getRepo}
                  cloning={cloning}
                  error={cloneError}
                  cloned={cloned}
                  tokenConfigured={Boolean(config?.github?.tokenConfigured)}
                />
              ) : (
                <>
                  <label htmlFor={`${ids}-repo`} className="sr-only">
                    Project folder
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id={`${ids}-repo`}
                      value={repoPath}
                      onChange={(event) => setRepoPath(event.target.value)}
                      placeholder={config?.samplesRoot ? `${config.samplesRoot}${config.platform === "win32" ? "\\" : "/"}shipping` : "/path/to/your/app"}
                      spellCheck="false"
                      autoComplete="off"
                      className={`${controlClass} font-mono text-sm`}
                    />
                    <Button onClick={() => setBrowsing((value) => !value)} aria-expanded={browsing} className="shrink-0">
                      <FolderSearch aria-hidden="true" /> {browsing ? "Close" : "Browse"}
                    </Button>
                  </div>
                  <SamplePicker samples={samples} value={repoPath} onPick={(path) => { setRepoPath(path); setEcosystem(""); setFromJava(""); setFromBoot(""); setFromNode(""); setFromPython(""); }} />
                  {config?.roots?.length ? (
                    <p className="mt-2 text-xs break-words text-fg-subtle">
                      Allowed roots: <span className="font-mono">{config.roots.join(" · ")}</span>
                      <span className="hidden sm:inline">
                        {" "}
                        (set <span className="font-mono">VERDIGRADE_ROOTS</span> to change)
                      </span>
                    </p>
                  ) : null}
                  {browsing ? (
                    <div className="mt-3">
                      <FolderPicker
                        value={repoPath}
                        onPick={(picked) => {
                          setRepoPath(picked);
                          setBrowsing(false);
                        }}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </Card>

          <Card className="min-w-0">
            <CardHeader icon={Languages} title={<><StepNo n={2} />Language</>} description="Detected from the build files; pick one to override" />
            <div className="p-5">
              <LangPicker value={ecosystem} onChange={setEcosystem} detected={route?.detected ? route.ecosystem ?? "java" : null} hasRepo={Boolean(repoPath.trim())} />
            </div>
          </Card>

          <Card className="min-w-0">
            <CardHeader icon={RouteIcon} title={<><StepNo n={3} />From → To</>} description={`${ecosystemMeta[activeEcosystem]?.label ?? "Java / Spring Boot"} route. Leave From on Detect to read it from the build files`} />
            <div className="p-5">
              {python ? (
                pythonMatrix.error ? <ErrorState error={pythonMatrix.error} onRetry={pythonMatrix.reload} /> : !pythonMatrix.data ? <Skeleton className="h-32" /> : (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="To Python"><Segmented label="To Python" value={targetPython} onChange={setTargetPython} options={pythonMatrix.data.supportedPythonTargets.map((o) => ({ value: o.id, label: `Python ${o.id}`, title: o.label }))} /></Field>
                    <Field label="From Python" htmlFor={`${ids}-from-python`}><Select id={`${ids}-from-python`} value={fromPython} onChange={(e) => setFromPython(e.target.value)}><option value="">Detect{route?.detected?.python ? ` (${route.detected.python})` : ""}</option>{pythonMatrix.data.fromPythonOptions.map((v) => <option key={v} value={v}>Python {v}</option>)}</Select></Field>
                    <p className="text-xs text-fg-muted sm:col-span-2">Django and Flask follow the route (Django 5.2 LTS, or 6.1 for Python 3.15; Flask 3.1). pyupgrade and django-upgrade are pinned in the Python matrix; tests run in a fresh venv.</p>
                  </div>
                )
              ) : node ? (
                nodeMatrix.error ? <ErrorState error={nodeMatrix.error} onRetry={nodeMatrix.reload} /> : !nodeMatrix.data ? <Skeleton className="h-32" /> : (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="To Node"><Segmented label="To Node" value={targetNode} onChange={setTargetNode} options={nodeMatrix.data.supportedNodeTargets.map((o) => ({ value: o.id, label: `Node ${o.id}`, title: o.label }))} /></Field>
                    <Field label="To TypeScript"><Segmented label="To TypeScript" value={targetTypescript} onChange={setTargetTypescript} options={nodeMatrix.data.supportedTypescriptTargets.map((o) => ({ value: o.id, label: o.id, title: o.label }))} /></Field>
                    <Field label="From Node" htmlFor={`${ids}-from-node`}><Select id={`${ids}-from-node`} value={fromNode} onChange={(e) => setFromNode(e.target.value)}><option value="">Detect{route?.detected?.node ? ` (${route.detected.node})` : ""}</option>{nodeMatrix.data.fromNodeOptions.map((v) => <option key={v} value={v}>Node {v}</option>)}</Select></Field>
                    <p className="self-center text-xs text-fg-muted">Express 4 → 5 uses the official codemod. Package and tsconfig edits come from the Node matrix.</p>
                  </div>
                )
              ) : matrixError ? (
                <ErrorState error={matrixError} onRetry={reloadMatrix} />
              ) : !matrix ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              ) : (
                <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                  <Field label="To Java">
                    <Segmented
                      label="To Java"
                      value={targetJava}
                      onChange={setTargetJava}
                      className="w-full"
                      options={matrix.supportedJavaTargets.map((option) => ({ value: option, label: `Java ${option}`, icon: Coffee }))}
                    />
                  </Field>
                  <Field label="To Spring Boot">
                    <Segmented
                      label="To Spring Boot"
                      value={targetBoot}
                      onChange={setTargetBoot}
                      className="w-full"
                      options={matrix.supportedBootTargets.map((option) => ({
                        value: option.id,
                        label: option.id === "none" ? "None" : option.id,
                        icon: option.id === "none" ? null : Leaf,
                        title: `${option.label}${option.parentHint ? ` (${option.parentHint})` : ""}`,
                      }))}
                    />
                  </Field>
                  <Field label="From Java" htmlFor={`${ids}-from-java`}>
                    <Select id={`${ids}-from-java`} value={fromJava} onChange={(event) => setFromJava(event.target.value)}>
                      <option value="">Detect{route?.detected?.java ? ` (${route.detected.java})` : ""}</option>
                      {matrix.fromJavaOptions.map((option) => (
                        <option key={option} value={option}>
                          Java {option}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="From Spring Boot" htmlFor={`${ids}-from-boot`}>
                    <Select id={`${ids}-from-boot`} value={fromBoot} onChange={(event) => setFromBoot(event.target.value)}>
                      <option value="">Detect{detectedBoot ? ` (${detectedBoot})` : ""}</option>
                      {matrix.fromBootOptions.map((option) => (
                        <option key={option} value={option}>
                          {option === "none" ? "No Spring Boot" : `Boot ${option}`}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}
            </div>
          </Card>

          <Card className="min-w-0">
            <CardHeader icon={Settings2} title={<><StepNo n={4} />Options</>} description="Safe defaults; change only what you need" />
            <div className="space-y-5 p-5">
              <Field label="Mode">
                <Segmented
                  label="Mode"
                  value={dryRun ? "dry" : "apply"}
                  onChange={(value) => setDryRun(value === "dry")}
                  className="w-full sm:w-80"
                  options={[
                    { value: "dry", label: "Dry run", icon: FlaskConical, title: "Temporary copy; your folder is never modified" },
                    { value: "apply", label: "Apply to folder", icon: Play, title: "Changes files on a migrate/… branch" },
                  ]}
                />
              </Field>
              {!dryRun ? (
                <p className="flex gap-2.5 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-fg">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>
                    This run changes files in the folder. Git repositories get a new migrate/… branch with one commit per step; other folders get a private history so
                    the run can be rolled back.
                  </span>
                </p>
              ) : null}
              <p className="flex gap-2.5 rounded-md border border-border bg-surface-2/60 px-3 py-2.5 text-sm text-fg-muted">
                <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>
                  <span className="font-medium text-fg">The plan picks the upgrade engine for you.</span> After the scan it recommends Hybrid or Full AI, explains why, and lets you switch.
                </span>
              </p>
              <div className="divide-y divide-border rounded-md border border-border">
                <SwitchRow checked={previewTools} onChange={setPreviewTools} label="Exact rewrite preview" description="Runs rewrite tools on a temporary copy for exact file lists. Slower; your folder stays unchanged." />
                <SwitchRow checked={aiReview && config?.planAi !== false} onChange={setAiReview} label="AI risk review" description={config?.planAi === false ? "Disabled on this server. The deterministic plan works without a model." : "Adds read-only explanations and file/line-verified suggestions. Deterministic findings stay authoritative."} />
                <SwitchRow checked={skipTests} onChange={setSkipTests} label="Skip tests" description="Faster, but the run cannot prove behaviour. Not recommended." />
                {!dryRun ? (
                  <SwitchRow
                    checked={allowDirty}
                    onChange={setAllowDirty}
                    label="Allow uncommitted changes"
                    description="By default a real run refuses a dirty working tree so every change it makes is reviewable."
                  />
                ) : null}
              </div>
              <div className="max-w-xs">
                <Field label="Model fix-up rounds when tests fail" htmlFor={`${ids}-rounds`}>
                  <Select id={`${ids}-rounds`} value={fixRounds} onChange={(event) => setFixRounds(event.target.value)}>
                    <option value="">Default{config ? ` (${config.fixRounds})` : ""}</option>
                    {[0, 1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value === 0 ? "0 (never call the model)" : value}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          </Card>
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start" aria-live="polite">
          <Card className="overflow-hidden">
            <CardHeader title="Route preview" description="Resolved from the matrix" action={preview.loading ? <Spinner label="Checking…" /> : null} />
            <div className="p-5">
              {preview.error ? (
                <ErrorState error={preview.error} onRetry={preview.reload} compact />
              ) : !route ? (
                <p className="text-sm text-fg-muted">Pick a folder and targets to see the plan.</p>
              ) : (
                <RoutePreview route={route} />
              )}
            </div>
            <div className="border-t border-border p-5">
              <Button type="submit" variant="primary" size="lg" disabled={!canStart} className="w-full">
                {starting ? <Spinner label="Analysing project…" /> : <><ClipboardList aria-hidden="true" /> Create migration plan</>}
              </Button>
              {!repoPath.trim() ? <p className="mt-2.5 text-center text-xs text-fg-subtle">{sourceMode === "github" ? "Get the GitHub repo first." : "Choose a project folder first."}</p> : <p className="mt-2.5 text-center text-xs text-fg-subtle">Read-only. Nothing in the {sourceMode === "github" ? "clone" : "folder"} changes.</p>}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-[15px] leading-6 text-fg">What happens next</h2>
            <ol className="mt-4 space-y-4">
              {[
                { icon: ScanSearch, title: "A read-only plan", text: "Every finding sorted into automatic, risky and manual." },
                { icon: ShieldCheck, title: "You decide", text: "Approve, lock or keep items for yourself; add protected paths." },
                { icon: FlaskConical, title: dryRun ? "Dry run on a copy" : "Run on a migrate/… branch", text: "Locks are enforced after every step. Tests decide pass or fail." },
              ].map((item, index) => (
                <li key={item.title} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-medium text-fg-muted tabular-nums">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-fg">{item.title}</p>
                    <p className="mt-0.5 text-xs text-fg-muted">{item.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {startError ? <ErrorState error={startError} /> : null}
        </aside>
      </form>
    </div>
  );
}

/** Quick picks for the bundled sample apps, with language badges. */
function SamplePicker({ samples, value, onPick }) {
  if (samples.error) return null;
  const list = samples.data?.samples ?? [];
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-medium text-fg-subtle">Or start from a sample</p>
      {!samples.data ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((sample) => {
            const active = value.trim() === sample.path;
            return (
              <li key={sample.name} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onPick(sample.path)}
                  aria-pressed={active}
                  className={`group flex w-full min-w-0 items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors duration-150 ${active ? "border-accent/50 bg-accent-soft" : "border-transparent hover:bg-surface-2"}`}
                >
                  <span className={`grid size-7 shrink-0 place-items-center rounded-md ${langTones[sample.ecosystem] ?? langTones.java}`}>
                    <LangGlyph ecosystem={sample.ecosystem} className="size-3.5" />
                    <span className="sr-only">{ecosystemMeta[sample.ecosystem]?.short ?? "Java"}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-fg">{sample.name}</span>
                      {active ? <Check aria-hidden="true" className="size-3.5 shrink-0 text-accent" /> : null}
                    </span>
                    <span className="block truncate text-xs text-fg-subtle tabular-nums">{sample.fromLabel}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Language adapter picker: Detect, Java, Node or Python as radio cards (arrow keys move between them). */
function LangPicker({ value, onChange, detected, hasRepo }) {
  const options = [
    { value: "", title: "Detect", sub: hasRepo ? (detected ? `Found ${ecosystemMeta[detected]?.short ?? detected}` : "Reading build files…") : "From the build files", glyph: null },
    ...Object.values(ecosystemMeta).map((meta) => ({ value: meta.id, title: meta.label, sub: `${meta.engine} · ${meta.build}`, glyph: meta.id })),
  ];
  function onKeyDown(event) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const at = options.findIndex((option) => option.value === value);
    const next = options[(at + step + options.length) % options.length];
    onChange(next.value);
    const group = event.currentTarget;
    requestAnimationFrame(() => group.querySelector(`[data-value="${next.value || "detect"}"]`)?.focus());
  }
  return (
    <div>
      <div role="radiogroup" aria-label="Language" onKeyDown={onKeyDown} className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const active = option.value === value;
          const isDetected = Boolean(detected) && option.value === detected;
          return (
            <button
              key={option.value || "detect"}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              data-value={option.value || "detect"}
              onClick={() => onChange(option.value)}
              className="lang-card relative flex min-w-0 items-start gap-3 overflow-hidden rounded-lg border border-border bg-surface p-3.5 text-left transition-[border-color,background-color] duration-150 hover:border-border-strong hover:bg-surface-2"
            >
              <span className={`grid size-8 shrink-0 place-items-center rounded-md ${option.glyph ? langTones[option.glyph] : "bg-surface-2 text-fg-muted"}`}>
                {option.glyph ? <LangGlyph ecosystem={option.glyph} className="size-4" /> : <ScanSearch aria-hidden="true" className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-fg">{option.title}</span>
                </span>
                <span className="mt-0.5 block text-xs text-fg-muted">{option.sub}</span>
                {isDetected && option.value ? (
                  <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-accent">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" /> Detected
                  </span>
                ) : null}
              </span>
              {active ? <Check aria-hidden="true" className="absolute top-3 right-3 size-4 text-accent" /> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-fg-subtle">
        {roadmap.length === 1 ? "Next on the roadmap" : "More adapters are on the roadmap"}: {roadmap.join(" and ")}. Each one plugs into the same plan, lock and test pipeline.
      </p>
    </div>
  );
}

function StepNo({ n }) {
  return <span className="mr-2 text-fg-subtle tabular-nums">{n}.</span>;
}

function SwitchRow({ checked, onChange, label, description }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-base font-medium text-fg">{label}</span>
        <span className="mt-0.5 block text-sm text-fg-muted">{description}</span>
      </label>
      <span className="pt-0.5">
        <Switch id={id} checked={checked} onChange={onChange} />
      </span>
    </div>
  );
}

function RoutePreview({ route }) {
  return (
    <div className="space-y-4 text-sm">
      {route.detected ? (
        <div className="rounded-md border border-border bg-surface-2/60 px-3 py-2.5">
          <p className="text-xs font-medium text-fg-subtle">Detected</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            {[
              ...(route.ecosystem === "python" ? [
                ["Build", route.detected.buildTool],
                ["Python", route.detected.python || "?"],
                ["Framework", route.detected.django ? `Django ${route.detected.django}` : route.detected.flask ? `Flask ${route.detected.flask}` : route.detected.framework || "none"],
                ["Tests", route.detected.testRunner || "none"],
                ["Removed APIs", route.detected.removedApis],
              ] : route.ecosystem === "node" ? [
                ["Build", route.detected.buildTool],
                ["Node", route.detected.node || "?"],
                ["TypeScript", route.detected.typescript || "none"],
                ["Express", route.detected.express || "none"],
                ["Express 4 APIs", route.detected.expressDeprecated],
              ] : [
                ["Build", route.detected.buildTool],
                ["Java", route.detected.java || "?"],
                ["Boot", route.detected.boot || (route.detected.classicSpring ? "classic Spring" : "none")],
                ["Modules", route.detected.modules],
                ["javax files", route.detected.javaxFiles],
              ]),
            ].map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <dt className="text-fg-subtle">{key}</dt>
                <dd className="font-medium text-fg tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      {route.scanError ? <ErrorState error={{ message: route.scanError }} compact /> : null}
      {route.ok ? (
        <>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <LangBadge ecosystem={route.ecosystem} />
              <Pill tone="accent" mono>
                {route.routeId}
              </Pill>
            </div>
            <p className="mt-2 text-fg-muted">{route.description}</p>
            <p className="mt-1.5 text-xs break-words text-fg-subtle">
              {route.ecosystem === "java" || !route.ecosystem ? "Rules pack" : "Rules"} <span className="font-mono text-fg-muted">{route.modernizerRules}</span>
              {route.parentHint ? (
                <>
                  {" "}
                  · Boot parent <span className="font-mono text-fg-muted">{route.parentHint}</span>
                </>
              ) : null}
            </p>
          </div>
          <ol className="relative space-y-2">
            {route.recipePlan.map((step, index) => (
              <li key={step.recipe} className="flex gap-2.5">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 text-2xs leading-none text-fg-muted tabular-nums">{index + 1}</span>
                <div className="min-w-0">
                  <p className="font-mono text-xs break-all text-fg">{step.label || step.recipe.split(".").slice(-2).join(".")}</p>
                  <p className="mt-0.5 truncate text-xs text-fg-subtle" title={step.artifact}>
                    when <span className="text-fg-muted">{step.when}</span>
                  </p>
                </div>
              </li>
            ))}
          </ol>
          {route.notes?.length ? (
            <ul className="space-y-1.5 text-xs text-fg-muted">
              {route.notes.map((note) => (
                <li key={note} className="flex gap-1.5">
                  <Info aria-hidden="true" className="mt-px size-3.5 shrink-0 text-info" />
                  {note}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <ErrorState error={{ message: route.error || "This From → To pair is not in the matrix." }} compact />
      )}
    </div>
  );
}

function GitHubSource({ ids, url, branch, subdir, onSubdir, token, onUrl, onBranch, onToken, onGet, cloning, error, cloned, tokenConfigured }) {
  const onEnter = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onGet();
    }
  };
  return (
    <div className="space-y-4">
      <Field label="Repository link" htmlFor={`${ids}-gh-url`}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={`${ids}-gh-url`}
            value={url}
            onChange={onUrl}
            onKeyDown={onEnter}
            placeholder="https://github.com/owner/repo"
            inputMode="url"
            spellCheck="false"
            autoComplete="off"
            aria-describedby={`${ids}-gh-help`}
            className={`${controlClass} font-mono text-sm`}
          />
          <Button variant="primary" onClick={() => onGet()} disabled={!url.trim() || cloning} className="shrink-0">
            {cloning ? <Spinner label="Cloning…" /> : <><Download aria-hidden="true" /> {cloned ? "Refresh" : "Get repo"}</>}
          </Button>
        </div>
      </Field>
      <p id={`${ids}-gh-help`} className="-mt-2 text-xs text-fg-subtle">
        Folder links work too (<span className="font-mono">…/tree/main/demo</span>), and <span className="font-mono">git@github.com:owner/repo.git</span>.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={<>Branch <span className="font-normal text-fg-subtle">(optional)</span></>} htmlFor={`${ids}-gh-branch`}>
          <input id={`${ids}-gh-branch`} value={branch} onChange={onBranch} onKeyDown={onEnter} placeholder="default branch" spellCheck="false" autoComplete="off" className={`${controlClass} font-mono text-sm`} />
        </Field>
        <Field label={<>Subfolder <span className="font-normal text-fg-subtle">(optional)</span></>} htmlFor={`${ids}-gh-subdir`}>
          <input
            id={`${ids}-gh-subdir`}
            value={subdir}
            onChange={onSubdir}
            onKeyDown={onEnter}
            placeholder="found automatically, e.g. demo"
            spellCheck="false"
            autoComplete="off"
            aria-describedby={`${ids}-gh-subdir-help`}
            className={`${controlClass} font-mono text-sm`}
          />
          <p id={`${ids}-gh-subdir-help`} className="mt-1.5 text-xs text-fg-subtle">Where the project lives inside the repo, if not at the top.</p>
        </Field>
        <Field label={<>Token <span className="font-normal text-fg-subtle">(private repos only)</span></>} htmlFor={`${ids}-gh-token`}>
          <div className="relative">
            <KeyRound aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              id={`${ids}-gh-token`}
              type="password"
              value={token}
              onChange={onToken}
              onKeyDown={onEnter}
              placeholder={tokenConfigured ? "using VERDIGRADE_GITHUB_TOKEN" : "ghp_… or github_pat_…"}
              autoComplete="off"
              spellCheck="false"
              aria-describedby={`${ids}-gh-token-help`}
              className={`${controlClass} pl-9 font-mono text-sm`}
            />
          </div>
          <p id={`${ids}-gh-token-help`} className="mt-1.5 text-xs text-fg-subtle">Used once for this clone. Never saved or logged.</p>
        </Field>
      </div>

      {cloning ? (
        <div role="status" className="flex items-center gap-3 rounded-lg border border-info/30 bg-info-soft px-4 py-3 text-sm text-info">
          <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />
          <span>Cloning the repository onto this computer… small repos take a few seconds.</span>
        </div>
      ) : error?.body?.candidates?.length ? (
        <div role="alert" className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3">
          <p className="flex items-start gap-2 text-sm font-medium text-warning">
            <FolderSearch aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            This repo has {error.body.candidates.length} projects. Which one should Verdigrade migrate?
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {error.body.candidates.map((candidate) => (
              <li key={candidate.subdir}>
                <Button size="sm" onClick={() => onGet(candidate.subdir)} className="font-mono">
                  <FolderOpen aria-hidden="true" /> {candidate.subdir}
                  <span className="font-sans text-fg-subtle">· {candidate.ecosystem}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : error ? (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">{error.message || String(error)}</span>
        </div>
      ) : cloned ? (
        <div role="status" className="rounded-lg border border-success/25 bg-success-soft px-4 py-3">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-success">
            <Check aria-hidden="true" className="size-4 shrink-0" /> Ready to migrate
            <SourceBadge source={cloned} />
            {cloned.commit ? <span className="font-mono text-xs text-fg-muted">@ {cloned.commit.slice(0, 7)}</span> : null}
          </p>
          {cloned.subdir ? (
            <p className="mt-2 text-xs text-fg-muted">
              Project folder: <span className="font-mono text-fg">{cloned.subdir}</span>
              {cloned.autoDetected ? " (found automatically; type another in Subfolder to change it)" : ""}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-fg-muted">
            Local clone: <span className="font-mono break-all text-fg">{cloned.clonePath || cloned.localPath}</span>
          </p>
          <p className="mt-1 text-xs text-fg-muted">All changes stay in this clone. Nothing is pushed to GitHub.</p>
        </div>
      ) : null}
    </div>
  );
}
