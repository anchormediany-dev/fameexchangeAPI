export default async function scrapeSnapchat(page, url) {
  try {
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 100000,
    });

    // Wait for a likely followers/subscribers element
    await Promise.race([
      page.waitForSelector('[data-testid="subscribersCountText"]', {
        timeout: 10000,
      }),
      page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll("span,div,p")).some((el) =>
            /(followers?|subscribers?)/i.test(el.textContent || "")
          ),
        { timeout: 10000 }
      ),
    ]);

    const extracted = await page.evaluate(() => {
      // Robust parser: "1.3M followers", "15K", "1,300", "1 300", etc.
      const parseSubscribers = (text) => {
        if (!text) return null;
        const normalized = text
          .toLowerCase()
          .replace(/[,\u00a0\u2009\u202f]/g, "") // commas & thin/nb spaces
          .trim();

        // Pattern A: "1.3m followers"
        const m1 = normalized.match(
          /([\d.]+)\s*(k|m|b)?(?=\s*(followers?|subscribers?)\b)/i
        );
        // Pattern B: just a number with optional suffix somewhere: "1.3m" / "1300"
        const m2 = normalized.match(/(?:^|\s)([\d.]+)\s*(k|m|b)?(?:\s|$)/i);

        let numStr = null,
          suffix = "";
        if (m1) {
          numStr = m1[1];
          suffix = (m1[2] || "").toLowerCase();
        } else if (m2) {
          numStr = m2[1];
          suffix = (m2[2] || "").toLowerCase();
        } else {
          return null;
        }

        const num = parseFloat(numStr);
        if (Number.isNaN(num)) return null;

        const mul =
          suffix === "k"
            ? 1e3
            : suffix === "m"
            ? 1e6
            : suffix === "b"
            ? 1e9
            : 1;
        return Math.round(num * mul);
      };

      // Prefer Snapchat's data-testid if present
      const el1 = document.querySelector(
        '[data-testid="subscribersCountText"]'
      );
      const cand1 = el1?.textContent || "";

      // Fallback: any element mentioning followers/subscribers
      const el2 = Array.from(document.querySelectorAll("span,div,p")).find(
        (el) => /(followers?|subscribers?)/i.test(el.textContent || "")
      );
      const cand2 = el2?.textContent || "";

      const raw = cand1 || cand2 || null;
      const subscribers = parseSubscribers(raw);

      // Return a number or null; we'll coerce to 0 outside
      return { subscribers };
    });

    // Guarantee a NUMBER for DB (avoid "Not visible")
    const safeSubscribers =
      typeof extracted?.subscribers === "number" &&
      Number.isFinite(extracted.subscribers)
        ? extracted.subscribers
        : 0;

    return {
      platform: "Snapchat",
      url,
      subscribers: safeSubscribers, // always a number
    };
  } catch (err) {
    // On error, still return a number to avoid schema cast failures
    return {
      platform: "Snapchat",
      url,
      subscribers: 0,
      error: err.message,
    };
  }
}
