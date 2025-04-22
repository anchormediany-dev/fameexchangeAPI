import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { parseCount } from "./helper.js";

// Enhanced stealth configuration
puppeteer.use(StealthPlugin());

// Platform-specific selectors and extraction methods
const PLATFORM_CONFIGS = {
  twitter: {
    selector: 'a[href*="/followers"] span, [data-testid="socialContext"]',
    extract: (el) => el.textContent.trim(),
    waitFor: "networkidle2",
    timeout: 45000,
  },
  facebook: {
    selector: 'div[class*="followers"] span, span[class*="countText"]',
    extract: (el) => el.textContent.trim(),
    waitFor: "domcontentloaded",
    timeout: 30000,
  },
  instagram: {
    selector: 'meta[property="og:description"]',
    extract: (el) => {
      const content = el.getAttribute("content");
      const match = content.match(
        /([\d,\.]+[KMB]?)\s*(followers|Follower|Followers)/i
      );
      return match ? match[1] : "0";
    },
    waitFor: "networkidle0",
    timeout: 60000,
  },
  youtube: {
    selector:
      '#subscriber-count, .subscriber-count, yt-formatted-string[aria-label*="subscribers"]',
    extract: (el) => el.textContent.trim(),
    waitFor: "networkidle2",
    timeout: 60000,
  },
  tiktok: {
    selector:
      'strong[data-e2e="followers-count"], [data-e2e="followers-count"]',
    extract: (el) => el.textContent.trim(),
    waitFor: "load",
    timeout: 45000,
  },
  snapchat: {
    selector:
      'div[class*="PublicProfileCard__SubscriberCount"], [class*="SubscriberCount"] span',
    extract: (el) => el.textContent.trim(),
    waitFor: "networkidle0",
    timeout: 45000,
  },
};

// Cache for browser instances
let browserInstance = null;

async function getBrowserInstance() {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
      ignoreHTTPSErrors: true,
    });
  }
  return browserInstance;
}

export async function scrapeFollowers(platform, url) {
  const config = PLATFORM_CONFIGS[platform.toLowerCase()];
  if (!config) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  let browser;
  try {
    browser = await getBrowserInstance();
    const page = await browser.newPage();

    // Enhanced stealth settings
    await page.setJavaScriptEnabled(true);
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });

    // Randomize browsing patterns
    await page.goto("https://www.google.com", {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    await page.waitForTimeout(1000 + Math.random() * 2000);
    await page.goto(url, {
      waitUntil: config.waitFor,
      timeout: config.timeout,
      referer: "https://www.google.com/",
    });

    // Additional random delay
    await page.waitForTimeout(500 + Math.random() * 1500);

    // Wait for selector with multiple fallbacks
    try {
      await page.waitForSelector(config.selector, {
        visible: true,
        timeout: 20000,
      });
    } catch (err) {
      // Try alternative selectors if primary fails
      const selectors = config.selector.split(", ");
      for (const sel of selectors.slice(1)) {
        try {
          await page.waitForSelector(sel, { visible: true, timeout: 90000 });
          break;
        } catch (e) {
          continue;
        }
      }
    }

    // Extract follower count
    const followers = await page.evaluate(
      (selector, extractFn) => {
        const element = document.querySelector(selector);
        return element ? extractFn(element) : "0";
      },
      config.selector.split(", ")[0],
      config.extract
    );

    // Validate result
    if (!followers || followers === "0") {
      throw new Error("No valid follower count found");
    }

    return parseCount(followers);
  } catch (error) {
    console.error(`Scraping error for ${platform}:`, error.message);
    throw new Error(`Failed to scrape ${platform}: ${error.message}`);
  } finally {
    if (browser && browser !== browserInstance) {
      await browser.close();
    }
  }
}

// Graceful shutdown handler
process.on("SIGINT", async () => {
  if (browserInstance) {
    await browserInstance.close();
  }
  process.exit();
});
