import Stripe from "stripe";

let _stripe = null;

// Lazy proxy — initializes on first property access so dotenv has always
// already run by the time the key is read.
const stripeClient = new Proxy(
  {},
  {
    get(_, prop) {
      if (!_stripe) {
        _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
          apiVersion: "2023-10-16",
        });
      }
      const val = _stripe[prop];
      return typeof val === "function" ? val.bind(_stripe) : val;
    },
  }
);

export default stripeClient;
