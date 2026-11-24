import { defineAgent } from "@grok/agent-sdk";

export default defineAgent({
  name: "leapfrog",
  description:
    "Verdigrade: explains and repairs Java/Spring, Node.js/TypeScript and Python/Django/Flask migrations. The migration itself runs as deterministic code (bot/lib/pipeline.ts); this agent is only asked to fix a failing test step and to write the report narrative.",
  model: {
    id: "grok-4.7",
    params: [
      { id: "reasoning_effort", value: "high" },
      { id: "fast", value: "true" },
    ],
  },
});
