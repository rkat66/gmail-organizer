# Gmail Domain Organizer

Automatically scans your Gmail inbox, groups emails by sender domain,
creates Gmail labels (`Domain/amazon.com`, `Domain/linkedin.com`, etc.),
and moves emails into those labels — all powered by Claude + Gmail MCP.

---

## Files

```
gmail-domain-organizer.html   ← Standalone single-file version (open in browser)
nextjs/                       ← Full Next.js application
  src/app/
    gmail-organizer/
      page.tsx                ← Main UI component
      page.module.css         ← Styles
    api/
      gmail-scan/route.ts     ← API: scans inbox via Gmail MCP
      gmail-move/route.ts     ← API: creates labels and moves emails
    layout.tsx
    globals.css
    page.tsx                  ← Redirects to /gmail-organizer
  package.json
  tsconfig.json
```

---

## Prerequisites

1. **Anthropic API key** — from https://console.anthropic.com
2. **Gmail MCP connected** on your Anthropic account (claude.ai → Settings → Connectors → Gmail)
3. The MCP beta header `anthropic-beta: mcp-client-2025-04-04` is required (already included)

---

## Standalone HTML

Just open `gmail-domain-organizer.html` in any browser.
Enter your Anthropic API key in the field provided (used only in that tab, never stored).

**Note:** The HTML version calls the Anthropic API directly from the browser,
which exposes your API key in network requests. For production use, prefer the Next.js version.

---

## Next.js App

### Setup

```bash
cd nextjs
npm install
```

### Option A — Enter API key in the UI
Run `npm run dev` and enter your key in the text field on the page.

### Option B — Environment variable (recommended)
Create `.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-api03-...
```
Then update `src/app/api/gmail-scan/route.ts` and `src/app/api/gmail-move/route.ts`
to use `process.env.ANTHROPIC_API_KEY` instead of reading from the request body.

### Run

```bash
npm run dev        # development  → http://localhost:3000
npm run build      # production build
npm start          # production server
```

---

## How It Works

1. **Scan** — Claude calls `list_messages` via Gmail MCP to read up to N inbox emails,
   extracts the sender domain from each `From` header, and returns a grouped JSON map.

2. **Move** — For each domain, Claude calls `create_label` (e.g. `Domain/amazon.com`)
   then `modify_message` on each email ID to add that label and remove `INBOX`.

Gmail labels created:
```
Domain/
  ├── amazon.com
  ├── linkedin.com
  ├── github.com
  └── ...
```

---

## Customization

- **Label Prefix** — change `Domain` to anything: `Vendor`, `Auto`, `Sorted`
- **Max Emails** — scan 20 / 30 / 50 / 100 at a time
- **Filtering** — edit the system prompt in the API routes to skip certain domains
  (e.g. add `Skip domains: gmail.com, googlemail.com` to ignore personal emails)
