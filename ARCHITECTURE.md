# Architecture Review & Refactor

This document is the architectural review of the bot and the record of the refactor
implemented on top of it. **Guiding constraint: zero use-case pruning.** Every
command, background task, event listener, and niche behavior operates exactly as it
did before — only the structure (and, by explicit request, the bot's speaking voice)
changed.

---

## 1. Architectural & Design Improvements

### 1.1 What the code looked like

The bot was already semi-modular (`commands/`, `events/`, `systems/`), but with
significant structural debt:

| Problem | Where it lived |
|---|---|
| 730-line `Database` god object mixing six unrelated domains | `src/systems/database.js` |
| Message-filter predicate duplicated verbatim | `autoPurgeEngine.matchesFilters` + inline switch in `purge-all.js` |
| Embed helpers copy-pasted four times | `dump.js`, `backupassets.js`, `backupchannel.js`, `access.js` |
| Cross-command coupling through the command registry | `stop-purge.js` → `commands.get('purgeall').getPurgeState()` |
| Two divergent command pipelines (permission checks, error handling) | `interactionCreate.js` vs `messageCreate.js` |
| Command/event loaders implemented three times | `index.js`, `deploy-commands.js`, `reload.js` |
| Engine bypassing the DB abstraction with raw SQL | `emojiLoopEngine` calling `db.db.prepare(...)` |
| Hardcoded channel/bot IDs shadowing config | `modLogListener.js` |
| Three copy-pasted engine-init try/catch blocks; no engine shutdown | `index.js` |
| Dead code that could never run | `hybridModerationLogger.js` (never imported), `webhookMonitoring.js` (wrong event name + missing intent) |

### 1.2 The new layout

```
Before                                   After
──────                                   ─────
index.js (190 lines: client, loaders,    index.js (3 lines)
  error handlers, SIGINT, engine init)   src/
src/                                     ├── core/
├── config/config.js                     │   ├── bootstrap.js   ← app start sequence
├── systems/                             │   ├── client.js      ← intents + REST config
│   ├── database.js   (god object)       │   ├── loaders.js     ← ONE command/event loader
│   ├── logger.js                        │   ├── dispatcher.js  ← ONE slash+prefix pipeline
│   ├── accessControl.js                 │   ├── tasks.js       ← background task registry
│   ├── autoPurgeEngine.js               │   └── shutdown.js    ← SIGINT + SIGTERM
│   ├── emojiLoopEngine.js               ├── config/config.js   ← ALL env/IDs, same defaults
│   ├── mangaScheduler.js                ├── lib/
│   └── hybridModerationLogger.js        │   ├── messageFilters.js ← shared filter predicate
├── events/  (fat handlers)              │   ├── embeds.js         ← shared embed helpers
└── commands/{admin,moderation,utility}  │   └── persona.js        ← the bot's voice
                                         ├── database/
                                         │   ├── index.js       ← facade, byte-compatible API
                                         │   ├── schema.js      ← DDL + migrations
                                         │   └── repositories/  ← one file per domain
                                         ├── services/
                                         │   ├── accessControl.js  ← atomic JSON writes
                                         │   └── purgeSessions.js  ← shared purge state
                                         ├── systems/           ← engines + channel logger
                                         │   ├── autoPurgeEngine.js
                                         │   ├── emojiLoopEngine.js
                                         │   ├── mangaScheduler.js
                                         │   ├── logger.js
                                         │   └── hybridModerationLogger.js (dormant, kept)
                                         ├── events/            ← thin delegates
                                         └── commands/{admin,moderation,utility}  ← unchanged tree
```

### 1.3 Decoupling business logic from Discord listeners

- **One dispatcher** (`src/core/dispatcher.js`) owns the whole command pipeline —
  prefix detection, dash normalization, access control, logging, error replies — for
  both slash and `zz` commands. The `interactionCreate`/`messageCreate` events are
  now 10-line delegates. Reply semantics were preserved exactly (slash denial =
  ephemeral embed; prefix denial = silent).
- **Repositories** (`src/database/repositories/*`) hold all SQL. The `Database`
  facade keeps the exact legacy method surface, so no call site changed; new code
  can inject a single repo instead of the whole facade — which is what makes the
  logic unit-testable without a Discord client.
- **Services** hold state that used to hide inside command modules
  (`purgeSessions`) or `systems/` (`accessControl`).
- **Compatibility contract:** `client.commands`, `client.database`, `client.logger`,
  `client.accessControl`, `client.autoPurgeScheduler`, `client.emojiLoopEngine`,
  `client.mangaScheduler` all still exist — several commands rely on them (e.g.
  `manga-chapter` even calls `scheduler.constructor._msToParts`).

---

## 2. Efficiency & Performance

### 2.1 Gateway intents (audited line by line)

| Intent | Verdict | Why |
|---|---|---|
| `Guilds` | keep | channels/threads cache backbone |
| `GuildMembers` | keep | rolesync add/remove events, member fetches, `/dump` |
| `GuildMessages` + `MessageContent` | keep | prefix commands, autopurge filters, Sapphire log parsing |
| `GuildModeration` | keep | audit-log event stream |
| `GuildPresences` | **removed** | zero presence reads anywhere in `src/`; by far the most expensive intent in RAM and gateway traffic |
| `GuildWebhooks` | **added** | webhook monitoring listened to `webhookUpdate` (v14 event is `webhooksUpdate`) *and* lacked this intent — it could never fire. Now it works as authored. |

### 2.2 Hot paths and caching

- **Autopurge is event-driven, not poll-driven** (this was already good):
  `messageCreate` → in-memory `configCache` lookup → per-message `setTimeout`
  (unref'd), with crash recovery (tracked messages table) and downtime recovery
  (checkpoint + `messages.fetch({ after })`) at startup. The config cache is
  invalidated by `/autopurge` via `reloadConfig()` — cheap and correct.
- **better-sqlite3 is synchronous but sub-millisecond** for these workloads (WAL
  mode is on). No query touches an unindexed hot path: lookups are by primary key
  or small tables. If tables grow, add indexes on
  `autopurge_tracked_messages(guild_id, channel_id)` and
  `moderation_cases(guild_id, user_id)` first.
- **AccessControl JSON writes are now atomic** (temp file + rename), removing the
  torn-file risk on crash mid-`save()`.
- **Startup work** (crash/downtime recovery) runs after login, per channel, and
  logs one summary embed per channel instead of per message.
- Remaining known trade-off: `emojiLoopEngine` polls its DB row every 10 s. That's
  one indexed read per tick — negligible — and keeping it preserves the exact
  90-second circular-queue pacing behavior.

### 2.3 Rate-limit posture

- discord.js queues REST calls per-route automatically; the bot's purge loops
  intentionally rely on that queue rather than sleeping (fast bulk delete + 100 ms
  breather between fetch batches; 250 ms between group-ban calls).
- Emoji/sticker routes are special-cased with `rest.rejectOnRateLimit` so a 429
  *rejects* instead of silently queueing for up to ~40 minutes; the emoji loop
  catches it, re-queues the item, and defers the whole queue (`retryAfter` or the
  40-minute fallback). This is the correct pattern for Discord's brutal
  per-guild emoji limits and was preserved as-is.
- Channel renames (`mangaScheduler`) are limited to 2/10 min per channel by
  Discord; the scheduler's compare-before-edit (`channel.name !== name`) keeps it
  from burning that budget on no-ops.

### 2.4 Footprint

- Removed the never-imported `canvas` dependency. This deleted the entire
  cairo/pango native stack from the Docker image (both build and runtime stages) —
  the largest single contributor to image size — and fixed `npm ci` on machines
  without graphics libraries.
- `STOPSIGNAL SIGTERM` + the new shutdown handler means `docker stop` now stops
  engines and closes SQLite cleanly instead of being killed after the grace period.

---

## 3. Usability & Extensibility

### 3.1 Adding a new command (the canonical pattern)

Drop one file in `src/commands/<category>/`. Nothing else to touch — the loader
picks it up, the dispatcher handles permissions/errors, deploy/reload reuse the
same loader.

```js
// src/commands/utility/example.js
const { SlashCommandBuilder } = require('discord.js');
const { createSuccessEmbed } = require('../../lib/embeds');
const persona = require('../../lib/persona');

module.exports = {
    // Slash definition (omit `data` + keep `name` for a prefix-only command)
    data: new SlashCommandBuilder()
        .setName('example')
        .setDescription('Does an example thing'),

    async execute(interaction) {
        // business logic belongs in src/services or a repository;
        // this layer only translates Discord <-> service calls
        await interaction.reply({
            embeds: [createSuccessEmbed('Done', persona.done())]
        });
    }
};
```

Adding a background task: export `init(client)` (returning an instance with
`stop()`) and register it in `src/core/bootstrap.js`:

```js
const tasks = new TaskRegistry()
    .register('My new engine', require('../systems/myNewEngine'));
```

### 3.2 Error handling, logging, configuration

- Both command pipelines share one error path: log to console, apologize (in
  character) to the user, never crash the process. `unhandledRejection` is caught
  globally.
- All IDs/secrets come from `src/config/config.js`, which is the single reader of
  `process.env` (see `.env.example` for the full list, now including
  `SAPPHIRE_BOT_ID`). No source file hardcodes a channel ID that config already
  knows.
- The persona lives in **one file** (`src/lib/persona.js`): phrase pools, palette,
  and helpers. To adjust the voice (or swap characters entirely), edit that file —
  command logic never hardcodes tone-critical strings for denials/errors.

### 3.3 Dormant code, kept deliberately

- `src/systems/hybridModerationLogger.js` is not imported anywhere (its role is
  covered by `events/modLogListener.js`). Per the zero-pruning rule it stays in the
  tree, unmodified, as reference/dormant code.
- `events/guildAuditLogEntryCreate.js` is an intentional no-op (moderation reports
  use the mod-log channel as the single source) and stays exactly as it was.

---

## 4. Migration & Feature Parity

### 4.1 How the migration was executed (one commit per phase)

1. **Baseline snapshot** — every slash command's `toJSON()`, all legacy command
   names, and the `Database` method list captured before touching anything.
2. Extract `src/lib` (`messageFilters`, `embeds`) and rewire the four duplicates.
3. Centralize config (mod-log/forum/Sapphire IDs).
4. Split `Database` into repositories behind a byte-compatible facade; give the
   emoji loop a real `updateEmojiLoopQueue()` method.
5. Introduce `src/core` (client factory, shared loaders, dispatcher); shrink
   `index.js` to an entrypoint; events become delegates.
6. Task registry + graceful SIGINT/SIGTERM shutdown.
7. Move purge state into `services/purgeSessions`.
8. Intent/webhook fixes; drop `canvas`; slim the Dockerfile.
9. Persona layer (display text only).
10. After every phase: `node --check` on all files, boot dry-run, and a manifest
    diff against the phase-0 snapshot. Final check verifies all 9 slash commands
    and 8 prefix commands have **identical names, options, types, choices and
    permission flags** to the baseline.

### 4.2 Feature Parity Matrix

| Feature (as it existed) | Old home | New home | Behavior |
|---|---|---|---|
| `/purgeall` (+ `zzpurgeall`) filters/limits/confirm/progress | `commands/moderation/purge-all.js` | same file + `lib/messageFilters` + `services/purgeSessions` | identical flow; new voice |
| `zzstoppurge` | `commands/moderation/stop-purge.js` | same + `services/purgeSessions` | identical (owner-only, per-channel) |
| `/autopurge` setup dashboard, list/pause/resume/remove/remove-all | `commands/moderation/autopurge.js` | same file | identical UI flow, options, intervals |
| Autopurge engine: event-driven timers, crash + downtime recovery, checkpoints | `systems/autoPurgeEngine.js` | same, now via shared filter lib + task registry | identical semantics |
| `zzgroupban` (file/args/prompt input, hierarchy checks, 250 ms pacing) | `commands/moderation/group-ban.js` | same file | identical |
| `/emojiloop` start/stop/runnow/status; 90 s circular queue, sticker priority, 429 defer | `commands/admin/emojiloop.js` + `systems/emojiLoopEngine.js` | same + `emojiLoopRepo.updateQueue()` | identical pacing & recovery |
| `zzmanga-chapter` setup/status/cancel/update; JST-Wednesday countdown channel renames | `commands/utility/manga-chapter.js` + `systems/mangaScheduler.js` | same + task registry | identical; channel-name strings untouched |
| `zzaccess` grant/revoke/list/infos/clear/backup | `commands/admin/access.js` + `systems/accessControl.js` | same + `services/accessControl.js` (atomic writes) | identical rules & storage format |
| `/rolesync` toggle/list/forcesync + member add/remove sync events | `commands/admin/rolesync.js`, `events/guildMemberAdd|Remove.js` | same + `roleSyncRepo` | identical |
| `/roleedit` solid/gradient/holographic + icon | `commands/admin/rolecolor.js` | same file | identical payloads |
| `/forumlogger` setup/toggle/status + Sapphire log mirroring to per-user forum threads | `commands/admin/forumlogger.js` + `events/modLogListener.js` | same; IDs now from config (same defaults) | identical parsing/matching |
| `/backupchannel`, `/backupassets` (slash + prefix, ZIP archives) | `commands/utility/backup*.js` | same + `lib/embeds` | identical scanning/zipping |
| `zzdump` (roles, alt, %month/%year, flags, formats, CSV) | `commands/utility/dump.js` | same + `lib/embeds` | identical filters & output formats |
| `zzuserinfo`, `zzping`, `/help` (+`zzhelp`) | `commands/utility/*` | same files | identical data; new voice |
| `zzreload` hot reload | `commands/admin/reload.js` | same via `core/loaders` | identical scope (commands only) |
| Webhook create/update/delete logging | `events/webhookMonitoring.js` | same file | **now actually fires** (event name + intent fixed) |
| Moderation-action channel logger | `systems/logger.js` | same | identical, persona footer added |
| Disabled audit-log listener | `events/guildAuditLogEntryCreate.js` | untouched | still a deliberate no-op |
| Dormant hybrid moderation logger | `systems/hybridModerationLogger.js` | untouched | still dormant, kept |
| Command deployment (guild-scoped + stale cleanup + global clear) | `deploy-commands.js` | same via `core/loaders` | identical REST behavior |

### 4.3 Deliberate behavior deltas (the only ones)

1. **Persona**: all user-facing text now speaks as Kurumi Tokisaki (crimson/gold
   palette, signature footers). Cosmetic only — verified structurally.
2. **Webhook monitoring works now** (was silently dead).
3. **`GuildPresences` dropped** (was pure overhead).
4. **Graceful SIGTERM shutdown** (was hard-killed under Docker).
5. **`canvas` removed** (was never imported).
