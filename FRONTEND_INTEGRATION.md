# Frontend Integration Guide — Trading, Wallet (Stripe), Inverse Session Checkout

This document describes the new/updated backend endpoints and the exact frontend
changes needed to consume them. All endpoints below require:

- Header `secret-key: <api key>` (always)
- Header `x-auth-token: <JWT>` for authenticated endpoints

---

## 1. Trading / Talent endpoints — now accept either Talent `_id` OR User `_id`

**Problem (before):** Frontend was passing `user._id` from `/user/getusers`
to `/talents/:id`, `/talents/:id/quote`, `/talents/:id/stats`, `/talents/:id/chart`,
`/trades/preview`, `/trades/open`. Backend looked them up by `Talent._id` only,
producing `404`/`400`/`500`.

**Fix (now):** All trading endpoints now resolve the talent via:

1. `Talent.findById(id)` — direct talent doc id
2. `Talent.findOne({ userId: id })` — talent linked to a user
3. If the id corresponds to a `User` whose role is `TALENT` / `ATHLETE` /
   `INFLUENCER`, a `Talent` doc is auto-provisioned with sensible defaults
   (price $100, spread $0.5, active status, initial price-history record).

**Frontend action:** No code change required for the existing hooks. You can
keep passing `user._id` from `/user/getusers`. Errors should disappear.

Affected hooks (no change needed, just verify):

| Hook                         | Method + URL                                      |
| ---------------------------- | ------------------------------------------------- |
| `useGetTalentByIdQuery`      | `GET /api/talents/:id`                            |
| `useGetTalentQuoteQuery`     | `GET /api/talents/:id/quote`                      |
| `useGetTalentChartQuery`     | `GET /api/talents/:id/chart?range=1D\|1W\|1M\|…` |
| `useGetTalentStatsQuery`     | `GET /api/talents/:id/stats`                      |
| `useTradePreviewMutation`    | `POST /api/trades/preview`                        |
| `useTradeOpenMutation`       | `POST /api/trades/open`                           |

> The trade preview now also returns `resolved_talent_id`. If you want to
> persist the canonical talent id after the first quote, you can store this
> value, but it is not required.

### About the 401s on `/api/wallet`, `/api/positions/open`, `/api/wallet/deposit`

These endpoints require `x-auth-token`. The 401s in the production logs mean
the frontend is not sending the JWT (or the user session expired). Verify
your RTK-Query base query attaches `x-auth-token` for `wallet*`, `positions*`,
`trades*` and the new `wallet/deposit-intent`, `wallet/deposit-confirm`,
`billing/inverse-session/*` endpoints.

---

## 2. Wallet "Add Funds" — Stripe-funded deposits

Two new endpoints replace the old direct-credit flow.

### `POST /api/wallet/deposit-intent`

Creates a Stripe `PaymentIntent` for funding the wallet.

**Request body:**

```json
{ "amount": 50, "currency": "usd" }
```

- `amount` — major units (e.g. `50` = $50.00). Min `$1`, max `$100,000` per call.
- `currency` — optional, defaults to `"usd"`.

**Response (200):**

```json
{
  "success": true,
  "paymentIntentId": "pi_3Q...",
  "clientSecret": "pi_3Q..._secret_...",
  "status": "requires_payment_method",
  "amount": 50,
  "amountInMinor": 5000,
  "currency": "usd"
}
```

### `POST /api/wallet/deposit-confirm`

Verifies the PI succeeded with Stripe, then **idempotently** credits the wallet
(safe to call more than once — second call returns `already_credited: true`).

**Request body:**

```json
{ "paymentIntentId": "pi_3Q..." }
```

**Response (200):**

```json
{
  "success": true,
  "already_credited": false,
  "wallet": {
    "_id": "...",
    "userId": "...",
    "available_balance": 150.00,
    "locked_balance": 0,
    "currency": "USD"
  },
  "transaction": {
    "_id": "...",
    "type": "deposit",
    "amount": 50,
    "balance_before": 100,
    "balance_after": 150,
    "stripe_payment_intent_id": "pi_3Q..."
  }
}
```

**Error responses:**

- `400` if `PaymentIntent.status !== "succeeded"` (returns `status` field)
- `403` if PI does not belong to the calling user
- `404` if PI not found

### Frontend flow for `DepositModal.jsx`

Wrap the modal body in `<Elements stripe={stripePromise}>` and use
`<CardElement />` exactly like `Checkout.jsx`/`PaymentStep`:

```jsx
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// RTK-Query slice (e.g. walletApi.js)
createDepositIntent: builder.mutation({
  query: (body) => ({ url: "/wallet/deposit-intent", method: "POST", body }),
}),
confirmDeposit: builder.mutation({
  query: (body) => ({ url: "/wallet/deposit-confirm", method: "POST", body }),
  invalidatesTags: ["Wallet"],
}),

// In the modal
const [createIntent] = useCreateDepositIntentMutation();
const [confirmDeposit] = useConfirmDepositMutation();
const stripe = useStripe();
const elements = useElements();

async function handleSubmit() {
  const { paymentIntentId, clientSecret } = await createIntent({ amount }).unwrap();
  const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
    payment_method: { card: elements.getElement(CardElement) },
  });
  if (error) return toast.error(error.message);
  if (paymentIntent?.status === "succeeded") {
    const result = await confirmDeposit({ paymentIntentId }).unwrap();
    toast.success(`Wallet funded. New balance: $${result.wallet.available_balance}`);
    onClose();
  }
}
```

**Remove** the existing direct call to `POST /wallet/deposit` from production
flows (you can keep it behind a dev-only "+test funds" admin button).

---

## 3. Inverse Session Fast Checkout — Stripe

Three new endpoints. Use **Option A** (recommended) — a dedicated route
group `/billing/inverse-session/*`. Do not overload `/checkout/:id`; instead
add a new page `/inverse-checkout/:sessionId`.

### `GET /api/billing/inverse-session/quote?sessionId=...`

Returns the price the server will charge (sum of all priced `accessType`
entries on the session).

**Response (200):**

```json
{
  "success": true,
  "sessionId": "...",
  "currency": "usd",
  "unitPrice": 120,
  "amount": 120,
  "amountInMinor": 12000,
  "sessionLength": "30",
  "accessType": [
    { "type": "Virtual", "price": 80 },
    { "type": "Hologram", "price": 40 }
  ],
  "where": "Online"
}
```

Use this to populate the BillingStep summary on the new
`/inverse-checkout/:sessionId` page.

### `POST /api/billing/inverse-session/payment-intent`

**Request body:**

```json
{
  "sessionId": "<Session._id>",
  "talentId": "<User._id of the talent>",
  "currency": "usd"
}
```

(Optional `fanRequestId` if you are paying for a pre-existing pending request.)

**Response (200):**

```json
{
  "success": true,
  "paymentIntentId": "pi_...",
  "clientSecret": "pi_..._secret_...",
  "status": "requires_payment_method",
  "amount": 120,
  "amountInMinor": 12000,
  "currency": "usd"
}
```

### `POST /api/billing/inverse-session/confirm`

Idempotently creates a `FanInverseRequest` (status `accepted`, `ispaid: true`,
`paymentStatus: "succeeded"`) once Stripe has confirmed the payment.

**Request body:**

```json
{
  "paymentIntentId": "pi_...",
  "sessionId": "<Session._id>",
  "talentId": "<User._id>",
  "date": "2026-06-15",
  "time": "14:30",
  "location": "Online",
  "paymentMethod": "Credit Card"
}
```

- `date` / `time` default to the session's own `sessionDate`/`sessionTime` if omitted.
- `location` defaults to `session.where`.
- `paymentMethod` must be `"Credit Card"` or `"Debit Card"` (defaults to Credit Card).

**Response (200):**

```json
{
  "success": true,
  "already_confirmed": false,
  "fanRequest": { "_id": "...", "status": "accepted", "ispaid": true, "..." : "..." },
  "payment": { "_id": "...", "status": "succeeded", "..." : "..." }
}
```

### Frontend page `/inverse-checkout/:sessionId`

Reuse `StripePaymentForm` from `Checkout.jsx`. Skeleton:

```jsx
// 1. Fetch session quote
const { data: quote } = useGetInverseSessionQuoteQuery(sessionId);

// 2. On mount or when entering payment step:
const [createIntent] = useCreateInverseSessionIntentMutation();
const { clientSecret, paymentIntentId } = await createIntent({
  sessionId,
  talentId,
}).unwrap();

// 3. Wrap form in <Elements stripe={stripePromise} options={{ clientSecret }}>
//    and call stripe.confirmCardPayment(clientSecret, { payment_method: { card: ... } })

// 4. On success:
const [confirmInverse] = useConfirmInverseSessionMutation();
await confirmInverse({
  paymentIntentId,
  sessionId,
  talentId,
  date: bookingDate,           // ISO yyyy-mm-dd
  time: bookingTime,           // "HH:mm"
  location: session.where,
  paymentMethod: "Credit Card",
}).unwrap();
navigate("/inverse-checkout/confirmation", { state: { ... } });
```

### Recommended RTK-Query slice additions

```js
// inverseCheckoutApi.js
getInverseSessionQuote: builder.query({
  query: (sessionId) => `/billing/inverse-session/quote?sessionId=${sessionId}`,
}),
createInverseSessionIntent: builder.mutation({
  query: (body) => ({
    url: "/billing/inverse-session/payment-intent",
    method: "POST",
    body,
  }),
}),
confirmInverseSession: builder.mutation({
  query: (body) => ({
    url: "/billing/inverse-session/confirm",
    method: "POST",
    body,
  }),
  invalidatesTags: ["FanRequests"],
}),
```

---

## 4. Notes / gotchas

- **Idempotency:** Both `wallet/deposit-confirm` and
  `billing/inverse-session/confirm` are safe to retry. They detect and return
  the existing record if invoked twice for the same `paymentIntentId`.
- **Test card:** Use `4242 4242 4242 4242`, any future expiry, any CVC.
- **Webhook path** (`/api/billing/webhook`) still works for asynchronous PI
  status updates and is not required for the synchronous confirm flows above
  (but it is harmless if your Stripe account fires it).
- **Auto-created Talent docs** start at `current_price = $100`. Admins can
  reprice via existing `PUT /api/admin/talents/:id` or
  `POST /api/admin/talents/:id/adjust-price`.
- **401 audit:** Confirm your Axios/RTK base query attaches `x-auth-token` to
  ALL of the following endpoints — they require auth:
  - `/api/wallet`, `/api/wallet/transactions`, `/api/wallet/deposit-intent`,
    `/api/wallet/deposit-confirm`
  - `/api/positions/open`, `/api/positions/:id`, `/api/positions/:id/close*`
  - `/api/trades/preview`, `/api/trades/open`, `/api/trades/history*`
  - `/api/billing/inverse-session/*`, `/api/billing/payment-intents`,
    `/api/billing/confirm`
