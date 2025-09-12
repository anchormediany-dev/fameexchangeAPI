// scrapers/youtube.js
import { request } from "undici";

function normalizeUrl(input) {
  try {
    const u = new URL(input);
    u.protocol = "https:";
    u.hostname = "www.youtube.com";
    if (!u.searchParams.has("hl")) u.searchParams.set("hl", "en");
    if (!u.searchParams.has("gl")) u.searchParams.set("gl", "US");
    return u.toString();
  } catch {
    return input;
  }
}
function toAboutUrl(u) {
  try {
    const url = new URL(u);
    if (!/\/about\/?$/.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/+$/, "") + "/about";
    }
    if (!url.searchParams.has("hl")) url.searchParams.set("hl", "en");
    if (!url.searchParams.has("gl")) url.searchParams.set("gl", "US");
    return url.toString();
  } catch {
    return u;
  }
}

async function fetchHtml(url) {
  const { body, statusCode } = await request(url, {
    method: "GET",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
      accept: "text/html,application/xhtml+xml",
    },
    maxRedirections: 5,
  });
  if (statusCode >= 400) throw new Error(`HTTP ${statusCode} for ${url}`);
  return body.text();
}

function parseAbbrevNumber(raw) {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[, ]/g, "");
  const cleaned = s.replace(/subscribers?/, "").trim();
  const m = cleaned.match(/^([\d.]+)\s*([kmb])?$/i);
  if (m) {
    const val = parseFloat(m[1]);
    const suf = (m[2] || "").toLowerCase();
    if (!Number.isFinite(val)) return null;
    if (!suf) return Math.round(val);
    if (suf === "k") return Math.round(val * 1_000);
    if (suf === "m") return Math.round(val * 1_000_000);
    if (suf === "b") return Math.round(val * 1_000_000_000);
  }
  const plain = Number(cleaned.replace(/[^\d]/g, ""));
  return Number.isFinite(plain) && plain > 0 ? plain : null;
}

function extractSubscriberTextFromHtml(html) {
  // Prefer ytInitialData JSON
  const m =
    html.match(/ytInitialData"\s*:\s*(\{.*?\})\s*[,<]/s) ||
    html.match(/var ytInitialData\s*=\s*(\{.*?\});/s);
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      const header =
        data?.header?.c4TabbedHeaderRenderer ||
        data?.header?.pageHeaderRenderer ||
        null;

      let subText =
        header?.subscriberCountText?.simpleText ||
        header?.subscriberCountText?.runs?.map((r) => r.text).join("");

      if (!subText) {
        // Sometimes only on About tab data
        const aboutRenderer =
          data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.find(
            (t) => t?.tabRenderer?.title === "About"
          )?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]
            ?.itemSectionRenderer?.contents?.[0]
            ?.channelAboutFullMetadataRenderer;

        subText =
          aboutRenderer?.subscriberCountText?.simpleText ||
          aboutRenderer?.subscriberCountText?.runs?.map((r) => r.text).join("");
      }

      if (subText && /subscriber/i.test(subText)) return subText.trim();
    } catch {
      /* fall through */
    }
  }

  // Fallback: loose scan for "... subscribers"
  const loose = html.match(/([\d.,]+(?:\s?[KMBkmb])?)\s+subscribers?/i);
  return loose ? loose[0].trim() : null;
}

function normalizeSubLine(s) {
  const line = s.replace(/\s+/g, " ");
  const m = line.match(/([\d.,]+(?:\s?[KMBkmb])?)\s+subscribers?/i);
  return m ? m[0] : line;
}

/**
 * OPTIMIZED-FIRST: Try HTTP-only first; if not found, use Puppeteer page (parent-container scan).
 * @param {import('puppeteer').Page} page
 * @param {string} url
 */
export default async function scrapeYoutube(page, url) {
  // 1) Fast path: HTML fetch + parse
  const base = normalizeUrl(url);
  const candidates = [base, toAboutUrl(base)];
  for (const u of candidates) {
    try {
      const html = await fetchHtml(u);
      const rawText = extractSubscriberTextFromHtml(html);
      if (rawText) {
        return {
          platform: "YouTube",
          url: u,
          subscribers: parseAbbrevNumber(rawText),
          rawText,
        };
      }
    } catch {
      // try next candidate
    }
  }

  // 2) Fallback: Puppeteer, but *robust* (scan parent containers / text nodes)
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);

  // Scan known parent containers first
  const headerSelectors = [
    "ytd-c4-tabbed-header-renderer",
    "ytd-page-header-renderer",
    "ytd-channel-header-renderer",
    "ytd-browse",
  ];

  let subscriberText = null;

  for (const sel of headerSelectors) {
    const txt = await page.evaluate((containerSel) => {
      const root = document.querySelector(containerSel);
      if (!root) return null;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const s = walker.currentNode.textContent;
        if (s && /subscribers?/i.test(s)) return s.trim();
      }
      return null;
    }, sel);
    if (txt) {
      subscriberText = normalizeSubLine(txt);
      break;
    }
  }

  if (!subscriberText) {
    // Broad scan as last resort
    const txt = await page.evaluate(() => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT
      );
      while (walker.nextNode()) {
        const s = walker.currentNode.textContent;
        if (s && /subscribers?/i.test(s)) return s.trim();
      }
      return null;
    });
    if (txt) subscriberText = normalizeSubLine(txt);
  }

  if (!subscriberText) {
    // Try About tab if present
    try {
      const aboutSel = 'a[role="tab"][href*="/about"]';
      const hasAbout = await page.$(aboutSel);
      if (hasAbout) {
        await Promise.allSettled([
          page.click(aboutSel),
          page.waitForNavigation({
            waitUntil: "domcontentloaded",
            timeout: 15000,
          }),
        ]);
        await page.waitForTimeout(600);
        const txt = await page.evaluate(() => {
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT
          );
          while (walker.nextNode()) {
            const s = walker.currentNode.textContent;
            if (s && /subscribers?/i.test(s)) return s.trim();
          }
          return null;
        });
        if (txt) subscriberText = normalizeSubLine(txt);
      }
    } catch {
      /* ignore */
    }
  }

  if (!subscriberText) {
    throw new Error("Could not locate subscriber count on the page");
  }

  return {
    platform: "YouTube",
    url: await page.url(),
    subscribers: parseAbbrevNumber(subscriberText),
    rawText: subscriberText,
  };
}
