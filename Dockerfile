# Build stage: compile native addons (better-sqlite3)
FROM node:22-bookworm-slim AS builder

WORKDIR /usr/src/app

# Build tools for native addons. The cairo/pango graphics stack that used to
# be installed here was only needed by the (removed, unused) canvas package.
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy package configuration
COPY package*.json ./

# Clean install dependencies and compile native addons
RUN npm ci

# Copy the rest of the application source code
COPY . .

# --- Runtime Stage ---
FROM node:22-bookworm-slim

WORKDIR /usr/src/app

# Copy compiled node_modules and code from the builder stage
COPY --from=builder /usr/src/app /usr/src/app

# docker stop must deliver SIGTERM for graceful shutdown (handled in src/core/shutdown.js)
STOPSIGNAL SIGTERM

# Start the bot
CMD ["node", "index.js"]
