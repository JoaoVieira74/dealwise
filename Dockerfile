FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    wget ca-certificates python3 make g++ \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Download Playwright's Chromium (version-matched) and its system deps
RUN npx playwright install chromium --with-deps

COPY . .

# Default data directory (override with DB_PATH env var on Railway)
RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "server.js"]
