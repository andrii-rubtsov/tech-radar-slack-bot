# Tech Radar Slack Bot — Project Instructions

## Package Manager

Always use `bun`. Never use `npm` or `yarn`:
```bash
bun install           # install deps
bun add <pkg>         # add dependency
bun add -d <pkg>      # add dev dependency
bun remove <pkg>      # remove dependency
bun run <script>      # run package.json script
```

> Note: `bun run test` runs vitest (not bun's built-in runner). Always use `bun run test`.

## Pre-Handoff Checklist

Before completing any task, always run these three commands. All must pass clean:

```bash
bun run typecheck   # tsc --noEmit — zero type errors
bun run lint        # eslint — zero errors (warnings allowed)
bun run test        # vitest — all tests green
```

Do not hand off if any of these fail.

## Architecture

- `CANVAS_NAME = "TechRadar"` is a hardcoded constant. Never make it configurable.
- Channel ID always comes from the Slack event payload. Never from env vars.
- All team config flows through `parseRadarConfig()` → `RadarConfig` → `buildSystemPrompt()`.
- New summarization logic belongs in `src/services/config.ts`.

### Source layout

```
src/
  index.ts                 entry point (fetch + scheduled handlers)
  types.ts                 Env interface, shared Slack event types
  slack/
    verify.ts              Slack request signature verification
    canvas.ts              readCanvas() — fetch TechRadar TOML from Slack
    events.ts              handleSlackEvent(), processMessageEvent()
    commands.ts            handleSlackCommand() + three /tech-radar-* handlers
    post.ts                postMessage() — send message to channel
  services/
    config.ts              RadarConfig, parseRadarConfig(), buildSystemPrompt()
    browser.ts             fetchMarkdown() — CF Browser Rendering
    claude.ts              callClaude() — Anthropic API
    sources.ts             listBotChannels() — conversations.list pagination
  digest/
    daily.ts               runDailyDigest(), runAllDigests()
  utils/
    urls.ts                extractUrls() — handle Slack URL formats
    truncate.ts            truncateMarkdown() — smart truncation at paragraph boundary
```

## Testing

Tests live in `test/`. Each source module with business logic needs a test file.

Coverage expectations:
- `src/utils/` — full coverage
- `src/slack/verify.ts` — full coverage
- `src/services/config.ts` — full coverage (this is the core logic)
- `src/services/sources.ts` — mock fetch, test pagination + filtering
- Integration paths (canvas not found, TOML parse error) — tested via unit tests on the handlers

## Environment Variables

Secrets (via `wrangler secret put`):
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`
- `ANTHROPIC_API_KEY`

Vars in `wrangler.toml` (non-secret):
- `CLAUDE_MODEL_SUMMARIZE` (default: `claude-haiku-4-5-20251001`)
- `CLAUDE_MODEL_DIGEST` (default: `claude-sonnet-4-6`)
