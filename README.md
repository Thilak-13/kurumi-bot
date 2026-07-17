# Kurumi Tokisaki — Discord Moderation Bot

A private, single-guild moderation and utility bot built with discord.js v14 —
now speaking with the voice of a certain crimson-clad Spirit. *Ara ara...*

All structure and design decisions are documented in [ARCHITECTURE.md](ARCHITECTURE.md),
including the full feature parity matrix and the "how to add a command" pattern.

## Features

- **Purging** — `/purgeall` with content-type filters and limits, `zzstoppurge`,
  and `/autopurge` (event-driven scheduled purging with crash & downtime recovery)
- **Moderation** — `zzgroupban` (mass ban from file/text/prompt), webhook
  activity logging, per-user moderation history threads mirrored from an external
  mod bot (`/forumlogger`)
- **Roles** — `/rolesync` (cross-guild role syncing with live member events),
  `/roleedit` (solid/gradient/holographic colors + icons)
- **Emoji upkeep** — `/emojiloop`: continuous emoji/sticker cache refresh on a
  90-second circular queue with rate-limit deferral
- **Utilities** — `zzdump` (member exports with rich filters), `/backupchannel` &
  `/backupassets` (ZIP archives), `zzmanga-chapter` (countdown channel renames),
  `zzuserinfo`, `zzping`, `/help`
- **Administration** — `zzaccess` (per-command role/member permissions),
  `zzreload` (hot reload)

Run `/help` (or `zzhelp`) in Discord for the full interactive command reference.

## Project Structure

```
index.js                 Entrypoint (delegates to src/core/bootstrap)
deploy-commands.js       Slash-command deployment (guild-scoped, stale cleanup)
src/
├── core/                Bootstrap, client factory, loaders, command dispatcher,
│                        background-task registry, graceful shutdown
├── config/              All environment/config values (single .env reader)
├── lib/                 Shared utilities: message filters, embeds, persona voice
├── database/            SQLite facade + per-domain repositories + schema
├── services/            Access control, purge session state
├── systems/             Background engines (autopurge, emoji loop, manga
│                        scheduler) and the moderation channel logger
├── events/              Thin Discord event delegates
└── commands/            admin/ · moderation/ · utility/
```

## Installation

### Prerequisites
- Node.js v18+ (Docker image uses Node 22)
- A Discord Bot Token ([create one here](https://discord.com/developers/applications))

### Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables** — copy `.env.example` to `.env` and fill in
   the values (`BOT_TOKEN`, `CLIENT_ID`, `OWNER_ID`, channel IDs, etc.).

3. **Deploy slash commands**
   ```bash
   npm run deploy
   ```
   With `GUILD_ID` set, commands deploy to that guild instantly (and stale
   global commands are cleared).

4. **Start the bot**
   ```bash
   npm start
   ```

### Docker

Mount a volume for `/usr/src/app/data` so settings (autopurge configs, access
controls, manga timers, thread maps) survive restarts:

```bash
docker compose up --build -d
```

The included `docker-compose.yml` maps `./data` on the host into the container.
`docker stop` triggers a graceful shutdown (engines stopped, SQLite closed).

## Configuration Notes

- **Owner** (`OWNER_ID`) can use every command; everyone else is governed by
  `zzaccess` grants and Discord permission gates.
- **Prefix**: `zz` (or mention the bot). Slash and prefix commands coexist.
- All IDs (log channels, mod-log channel, forum channel, external mod bot) are
  set in `.env` — see `.env.example` for the full list.
