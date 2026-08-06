import anthropicClient from "./anthropicClient.js";
import { parseJsonFromClaude } from "../utils/parseJsonFromClaude.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

// Calls Claude expecting a strict-JSON response, retrying once on a
// truncated/malformed response before giving up. Observed both failure
// modes for real during Phase 5 testing (max_tokens clipping a 5-task
// response mid-string, and an occasional genuine JSON-formatting slip from
// the model) — a single retry resolves the large majority without
// surfacing an error to the user.
export async function getClaudeJson({ system, messages, maxTokens = 1024 }) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await anthropicClient.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    });
    const text = completion.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    try {
      return parseJsonFromClaude(text);
    } catch (e) {
      lastErr = e;
    }
  }
  throw Object.assign(new Error("Advisor response wasn't valid JSON, even after a retry"), {
    status: 502,
    cause: lastErr,
  });
}
