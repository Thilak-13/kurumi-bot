# Use Node.js Debian-based image for compilation (includes better compatibility with native packages)
FROM node:22-bookworm-slim AS builder

WORKDIR /usr/src/app

# Install build tools and system dependencies required for native addons (better-sqlite3 and canvas)
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
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

# Install runtime libraries required by node-canvas
RUN apt-get update && apt-get install -y \
    libcairo2 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgif7 \
    librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled node_modules and code from the builder stage
COPY --from=builder /usr/src/app /usr/src/app

# Start the bot
CMD ["node", "index.js"]
