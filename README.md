# tiny-session-keeper

A tiny session keeper for a persistent agent browser, in one TypeScript file.
It notices when the browser restarted, refuses plans that assumed an old login, scopes shared logins per conversation, and sweeps idle sessions.
The browser, clock, and sites are fake. No API key. No network.

## Why it matters

A browser that keeps tabs and logins between turns is great, right up until it quietly restarts.
Cloudflare's Agents SDK `browserTool` reports `restarted: true` when that happens. Your agent has to actually read it.
This is a small model of that idea. It is not how Cloudflare's browser tool works inside.

## Run it

You need Node.js 18 or newer.

```bash
npm install
npx tsx session.ts
```

## Example output

See `output.txt`. Every site, timing, and idle limit is an example input.

## License

MIT

Read the write-up on Dev.to: https://dev.to/bobbyhalljr/cloudflare-gave-agents-a-browser-that-remembers-lets-build-a-tiny-session-keeper-in-typescript-230c
