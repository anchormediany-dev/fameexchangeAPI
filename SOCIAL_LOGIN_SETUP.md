# Social Connections Setup (YouTube · X · Instagram)

This feature lets a user **log in to their social account (OAuth)** to prove they
own it, then we **fetch their follower count** from the official API and store it.
`social_worth` = the sum of follower counts across all connected accounts.

- Users can **skip** — `social_worth` stays **0** until they connect something.
- A connection can exist with **followers = 0** until paid/approved API access is
  live (X and Instagram). Ownership is still verified.
- Managed from the profile page: connect / disconnect / refresh per platform.

> The follower count flows into `User.social_worth` (a new field). Your old
> scraper-based `Networth` is untouched and runs independently.

---

## 0. One-time: set the two base URLs in `.env`

```
BACKEND_PUBLIC_URL=http://localhost:5006      # your API, publicly reachable
FRONTEND_PUBLIC_URL=http://localhost:5174     # your React app
```

For production use your real domains, e.g.
`BACKEND_PUBLIC_URL=https://api.thefameexchange.com` and
`FRONTEND_PUBLIC_URL=https://thefameexchange.com`.

The **redirect URI** each provider needs is always:

```
{BACKEND_PUBLIC_URL}/api/social-connections/{platform}/callback
```

So for local dev you will register:
- `http://localhost:5006/api/social-connections/youtube/callback`
- `http://localhost:5006/api/social-connections/twitter/callback`
- `http://localhost:5006/api/social-connections/instagram/callback`

⚠️ Providers require an **exact** match (scheme, host, port, path). Register both
your localhost and production URIs.

---

## 1. YouTube  ✅ free, works for everyone — set this up first

You already have `GOOGLE_CLIENT_ID`. You just need the **secret** + enable the API.

1. Go to <https://console.cloud.google.com> → select your project.
2. **APIs & Services → Library →** search **"YouTube Data API v3" → Enable**.
3. **APIs & Services → OAuth consent screen**: set app name, support email; add
   yourself as a **Test user** (so it works before Google verification). Add the
   scope `.../auth/youtube.readonly`.
4. **APIs & Services → Credentials → your OAuth 2.0 Client ID** (or create one of
   type *Web application*):
   - **Authorized redirect URIs** → add the youtube callback URL from §0.
   - Copy the **Client secret**.
5. Put it in `.env`:
   ```
   GOOGLE_CLIENT_SECRET=xxxxxxxx
   ```

That's it. YouTube returns the real `subscriberCount`. Free quota = 10,000/day.

---

## 2. X (Twitter)  ⚠️ login is free; follower count needs paid tier

1. Go to <https://developer.x.com> → **Developer Portal** → create a Project + App.
2. In the App → **User authentication settings → Set up**:
   - **App permissions:** Read
   - **Type of App:** Web App
   - **Callback URI / Redirect URL:** the twitter callback from §0
   - **Website URL:** your site
3. Save. Copy the **OAuth 2.0 Client ID** and **Client Secret**:
   ```
   TWITTER_CLIENT_ID=xxxx
   TWITTER_CLIENT_SECRET=xxxx
   ```
4. **Follower count:** reading `public_metrics.followers_count` requires the
   **Basic tier (~$100/mo)** or higher. On the Free tier the connection still
   works (ownership verified) but followers stays **0** (`fetchPending: true`)
   until you upgrade. After upgrading, no code change — just hit *Refresh* on the
   account, or it updates on next connect.

---

## 3. Instagram  ⚠️ needs a Business/Creator account + Meta App Review

Instagram follower counts only come from **Instagram Business/Creator** accounts
that are linked to a **Facebook Page** (personal accounts have no follower API
since the Basic Display API shut down Dec 2024).

1. Go to <https://developers.facebook.com> → **My Apps → Create App** → type
   **Business**.
2. Add the **Instagram Graph API** and **Facebook Login** products.
3. **Facebook Login → Settings → Valid OAuth Redirect URIs:** add the instagram
   callback from §0.
4. **Settings → Basic:** copy **App ID** and **App Secret**:
   ```
   FACEBOOK_APP_ID=xxxx
   FACEBOOK_APP_SECRET=xxxx
   ```
5. **App Review:** request `instagram_basic`, `pages_show_list`,
   `pages_read_engagement`. Until approved, it works only for users added as
   **App Roles → Testers**. Until then, connections store followers = 0
   (`fetchPending: true`).
6. The talent's IG account must be **Business/Creator + linked to a FB Page** for
   `followers_count` to return.

---

## How the flow works (so you can debug)

1. Frontend (logged in) calls `POST /api/social-connections/{platform}/start`
   → backend returns `{ url }`.
2. Browser goes to `url`, user approves on the provider.
3. Provider redirects to `{BACKEND_PUBLIC_URL}/api/social-connections/{platform}/callback?code=…&state=…`.
4. Backend exchanges the code, fetches followers, upserts a `SocialConnection`,
   recomputes `social_worth`, and redirects the user back to
   `{FRONTEND_PUBLIC_URL}/update-profile/{userId}?social={platform}&status=connected`.

### Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/social-connections` | yes | List platforms + `social_worth` |
| POST | `/api/social-connections/:platform/start` | yes | Get OAuth URL |
| GET | `/api/social-connections/:platform/callback` | no (redirect) | Finish OAuth |
| POST | `/api/social-connections/:platform/refresh` | yes | Re-pull followers |
| DELETE | `/api/social-connections/:platform` | yes | Disconnect |

### Notes
- OAuth tokens are stored with `select:false` and never returned by the API.
- `state` is a random value stored in `OAuthState` (TTL 10 min) and maps the
  provider redirect back to the right user.
- To add a platform later (Facebook Pages, TikTok…): add a provider file under
  `services/socialProviders/`, register it in `index.js`, add its creds. No other
  changes needed.
