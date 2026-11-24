import { defineEvalConfig } from "@grok/agent-sdk/evals";

// Low concurrency: each case may start Maven, which is memory hungry.
export default defineEvalConfig({
  maxConcurrency: 2,
});
