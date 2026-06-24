import youtube from "./youtube.js";
import twitter from "./twitter.js";
import instagram from "./instagram.js";

/**
 * Provider registry. To add a new platform later (e.g. Facebook Pages, TikTok):
 *   1. create services/socialProviders/<name>.js exporting the same shape
 *   2. add it here
 *   3. add its credentials to config/socialAuthConfig.js + .env
 * Everything else (routes, controller, worth calc, frontend cards) is generic.
 */
const providers = { youtube, twitter, instagram };

export const SUPPORTED_PLATFORMS = Object.keys(providers);

export const getProvider = (platform) => providers[platform] || null;

export default providers;
