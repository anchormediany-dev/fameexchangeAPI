// Claude is instructed to respond with strict JSON, and usually does — but
// occasionally wraps it in a markdown fence or adds a stray sentence before
// or after it. Strips those before parsing instead of failing the whole
// request on an otherwise-valid response.
export function parseJsonFromClaude(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fall through
    }
  }

  const braced = trimmed.match(/\{[\s\S]*\}/);
  if (braced) {
    return JSON.parse(braced[0]); // let this throw if truly unparseable
  }

  throw new Error("No JSON object found in response");
}
