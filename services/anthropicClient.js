import Anthropic from "@anthropic-ai/sdk";

let _client = null;

// Lazy proxy — same pattern as services/stripeClient.js, so dotenv has
// always already run by the time the key is read.
const anthropicClient = new Proxy(
  {},
  {
    get(_, prop) {
      if (!_client) {
        _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      }
      const val = _client[prop];
      return typeof val === "function" ? val.bind(_client) : val;
    },
  }
);

export default anthropicClient;
