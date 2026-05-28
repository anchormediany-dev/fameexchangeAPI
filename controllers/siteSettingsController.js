// controllers/siteSettingsController.js
import SiteSettings from "../models/siteSettingsModel.js";

// Default seeds — used the first time the singleton doc is requested.
// Keys must match what the frontend Navbar / Footer use to filter links.
const DEFAULT_MENU = [
  { key: "home", label: "Home", path: "/", order: 1 },
  { key: "talent-trading", label: "Talent Trading", path: "/trade-talent", order: 2 },
  { key: "branded-shares", label: "Branded Tokens & Shares", path: "/branded-tokens-shares", order: 3 },
  { key: "futures", label: "Futures", path: "/futures", order: 4 },
  { key: "celeb-merch", label: "Celebrity Merchandise", path: "/celeb-merchandise", order: 5 },
  { key: "podcast", label: "Podcast", path: "/podcast", order: 6 },
  { key: "about", label: "About", path: "/about", order: 7 },
  { key: "contact", label: "Contact", path: "/contact", order: 8 },
  { key: "faq", label: "FAQ", path: "/faq", order: 9 },
];

const DEFAULT_FOOTER = [
  { section: "services", key: "trade-talent", label: "Talent Trading", path: "/trade-talent", order: 1 },
  { section: "services", key: "branded-shares", label: "Branded Tokens & Shares", path: "/branded-tokens-shares", order: 2 },
  { section: "services", key: "futures", label: "Futures", path: "/futures", order: 3 },
  { section: "services", key: "celeb-merch", label: "Celebrity Merchandise", path: "/celeb-merchandise", order: 4 },
  { section: "about", key: "about-us", label: "About Us", path: "/about", order: 1 },
  { section: "about", key: "team", label: "Our Team", path: "/about#team", order: 2 },
  { section: "about", key: "contact", label: "Contact", path: "/contact", order: 3 },
  { section: "about", key: "faq", label: "FAQ", path: "/faq", order: 4 },
];

async function ensureDoc() {
  let doc = await SiteSettings.findOne({ singleton: "main" });
  if (!doc) {
    doc = await SiteSettings.create({
      singleton: "main",
      menuItems: DEFAULT_MENU.map((m) => ({ ...m, visible: true })),
      footerItems: DEFAULT_FOOTER.map((f) => ({ ...f, visible: true })),
      inverseDisplayCount: 8,
      featuredTalentIds: [],
    });
  } else {
    // Backfill any new default items that don't exist yet (by key).
    let changed = false;
    const existingMenuKeys = new Set(doc.menuItems.map((m) => m.key));
    for (const m of DEFAULT_MENU) {
      if (!existingMenuKeys.has(m.key)) {
        doc.menuItems.push({ ...m, visible: true });
        changed = true;
      }
    }
    const existingFooterKeys = new Set(
      doc.footerItems.map((f) => `${f.section}:${f.key}`)
    );
    for (const f of DEFAULT_FOOTER) {
      if (!existingFooterKeys.has(`${f.section}:${f.key}`)) {
        doc.footerItems.push({ ...f, visible: true });
        changed = true;
      }
    }
    if (changed) await doc.save();
  }
  return doc;
}

// GET /api/site-settings (public)
export const getSettings = async (req, res) => {
  try {
    const doc = await ensureDoc();
    return res.json({ success: true, data: doc });
  } catch (err) {
    console.error("getSettings error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// PUT /api/site-settings (admin)
export const updateSettings = async (req, res) => {
  try {
    const {
      menuItems,
      footerItems,
      inverseDisplayCount,
      featuredTalentIds,
    } = req.body || {};

    const doc = await ensureDoc();

    if (Array.isArray(menuItems)) doc.menuItems = menuItems;
    if (Array.isArray(footerItems)) doc.footerItems = footerItems;
    if (typeof inverseDisplayCount === "number") {
      doc.inverseDisplayCount = Math.max(0, Math.min(100, inverseDisplayCount));
    }
    if (Array.isArray(featuredTalentIds)) {
      doc.featuredTalentIds = featuredTalentIds;
    }
    await doc.save();
    return res.json({ success: true, data: doc });
  } catch (err) {
    console.error("updateSettings error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
