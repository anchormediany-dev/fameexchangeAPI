# Debian-based, not Alpine — Puppeteer's bundled Chromium needs glibc and a
# specific set of shared libraries that Alpine's musl/minimal image doesn't
# ship; this is Puppeteer's own documented recommendation for containers.
FROM node:24-slim

# System libraries headless Chromium needs at runtime (not just build time —
# without these, the social-media scrapers fail/crash when they actually try
# to launch a browser, not when the image builds).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first so this layer only invalidates when package*.json changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 5006

# Reuses the app's existing health endpoint (app.js) — checks
# mongoose.connection.readyState, not just that the process is alive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://localhost:${PORT:-5006}/health || exit 1

CMD ["node", "app.js"]
