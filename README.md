# VALHALLA

Guild tooling for auction requests, Mimic Book allocation, attendance / raid parties, live raid voice tracking, Discord cards, and Adventurer Guild hall.

**Requirements / SRS:** [Requirements/Requirements.md](Requirements/Requirements.md) is a historical RTDB-era spec, not the live install guide.

This README is the **how to install and run** guide. It assumes you have never used the Discord Developer Portal, Supabase, Render, or Vercel before.

**Two jobs**

| Who | What they do |
| :--- | :--- |
| **You (platform operator)** | Clone this repo. Create **one** Discord application, **one** Supabase project, deploy **one** Render backend and **one** Vercel site. Sections 1–7. |
| **A tenant (one Discord guild)** | Open the live site. No GitHub, Node, Supabase, Render, or Vercel. Invite the **same** bot into *their* server, pick officers and games, map channels in the app. [Section 8](#8-tenants-guilds-using-the-live-site). |

One Discord server is one private workspace. Members of that server Sign in; they never pay. The person who creates the workspace needs **Manage Server** on that Discord server.

---

## What you will set up (operator)

| Piece | Role |
| :--- | :--- |
| **Discord** | User login (OAuth) + bot (announcements, auction / attendance / party cards, voice) |
| **Postgres / Supabase** | Shared data store (and optional Storage for logos / highlights) |
| **Render** | Hosts the **backend** (API + Discord bot, one Node process) |
| **Vercel** | Hosts the **frontend** (React site) |

```text
Browser  →  Vercel (frontend)
                │
                └── API / login  →  Render (backend + Discord bot)
                                       ├── Postgres (Supabase)
                                       ├── Supabase Storage (optional: logos / highlights)
                                       └── Discord API / Gateway
```

**Recommended order (operator)**

1. Discord application (OAuth + Bot) — one app for every tenant
2. Supabase project (Postgres URI; Storage bucket if you want logos / highlights)
3. Local `.env` files (optional smoke test)
4. Deploy backend on Render
5. Deploy frontend on Vercel
6. Wire URLs (OAuth redirect, `FRONTEND_URL`, `VITE_BACKEND_API_URL`)
7. First tenant: open the Vercel site → Get started → invite bot → choose a game (section 8)

---

## Prerequisites

- A computer with [Node.js LTS](https://nodejs.org/) installed (for local run)
- A GitHub account (to connect Render / Vercel to this repo)
- A Discord account and a Discord **server** you admin
- Free accounts on [Supabase](https://supabase.com/), [Render](https://render.com/), and [Vercel](https://vercel.com/)

---

## 1. Discord Developer Portal

### 1.1 Create an application

1. Open [https://discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application**, name it (e.g. `VALHALLA`), accept terms, **Create**
3. On **General Information**, copy **Application ID** → this is `DISCORD_CLIENT_ID` (and `VITE_DISCORD_CLIENT_ID` if you set it)

### 1.2 Create a bot

1. Left sidebar → **Bot** → **Add Bot** → confirm
2. Under **Token**, click **Reset Token** / **Copy** → save as `DISCORD_BOT_TOKEN` (never commit this)
3. Enable these **Privileged Gateway Intents**:
   - **Server Members Intent**
   - **Message Content Intent**
4. Save changes

Presence Intent is **not** required by this repo.

### 1.3 OAuth2 client secret + redirect

1. Left sidebar → **OAuth2**
2. Copy **Client Secret** → `DISCORD_CLIENT_SECRET`
3. Under **Redirects**, add URLs (you can add both; use the one that matches where the backend runs):

| Environment | Redirect URL |
| :--- | :--- |
| Local | `http://localhost:5001/auth/callback` |
| Production (Render) | `https://YOUR-RENDER-SERVICE.onrender.com/auth/callback` |

Exact match is required (no trailing slash after `callback`).

The app requests Discord scope **`identify` only** (login). Slash commands use the bot token separately.

### 1.4 Bot invite (one bot, every tenant)

You do **not** put each guild’s channel IDs in env. Tenants invite this same bot from the app (section 8). To generate the invite URL yourself (local smoke test):

1. OAuth2 → **URL Generator**
2. Scopes: check **`bot`** and **`applications.commands`**
3. Bot permissions — check at least:

   - View Channels  
   - Send Messages  
   - Embed Links  
   - Read Message History  
   - Use Application Commands  
   - Manage Nicknames (`/namechange`)  
   - Create Public Threads  
   - Send Messages in Threads  
   - Connect (helps with voice / war rooms; voice **state** tracking also needs the Voice States intent, which is not privileged)

4. Copy the generated URL. Tenants should use the in-app **Invite bot** link so permissions stay in sync with the code.

---

## 2. Postgres (Supabase)

### 2.1 Create a project

1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. **New project** → name it, set a database password, pick a region → **Create**
3. Wait until the project is ready

### 2.2 Database URL (required at boot)

1. Project → **Connect** (or Project Settings → Database)
2. Copy the **URI** (pooler is fine for Render) → `DATABASE_URL`
3. Never commit the real value. Tables are created on backend boot via migrate — no manual SQL seed is required.

### 2.3 Storage (optional, logos / highlights)

Needed only if you upload guild logos or Adventurer Guild highlights.

1. Project Settings → **API** → copy **Project URL** → `SUPABASE_URL`
2. Copy the **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (backend only; never put this in the frontend)
3. Storage → create a **public** bucket named `guild-assets`

---

## 3. Environment files (reference)

Copy examples, then fill values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### Backend (`backend/.env`) — required at boot

See `backend/.env.example`. Required by `backend/src/config/env.js`:

- Discord: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`
- OAuth: `OAUTH_REDIRECT_URI`
- Session: `SESSION_SECRET` (any long random string)
- Postgres: `DATABASE_URL`

**Strongly recommended (not in the fatal list, but needed for real use):**

- `FRONTEND_URL` — exact SPA origin, no trailing slash (`http://localhost:3000` or your Vercel URL)
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — logos / highlights

**Optional:** `ATTENDANCE_POST_HOUR` (default `10`), `PROXY_URL` (if Discord blocks Render IPs), `PORT` (Render sets this).

### Frontend (`frontend/.env`)

See `frontend/.env.example`:

- `VITE_BACKEND_API_URL` — backend origin **without** `/auth/callback`
  - Local: `http://localhost:5001`
  - Prod: `https://YOUR-RENDER-SERVICE.onrender.com`
- Optional: `VITE_DISCORD_CLIENT_ID` (Sign-in uses the backend `DISCORD_CLIENT_ID` if this is unset)

---

## 4. Local development

1. Install Node.js LTS
2. Clone this repo and open a terminal in the repo root
3. Install dependencies:

```bash
npm install
```

4. Fill `backend/.env` and `frontend/.env` (local Discord redirect + `FRONTEND_URL=http://localhost:3000`)
5. Start both apps:

```bash
npm run dev
```

| App | URL |
| :--- | :--- |
| Frontend (Vite) | [http://localhost:3000](http://localhost:3000) |
| Backend | [http://localhost:5001](http://localhost:5001) — open `/` and expect `GuildName backend is online.` |

Vite proxies `/api` and `/auth` to port 5001. `/login` redirects to `/landing`.

**Cookies:** On HTTP localhost, sessions use `secure: false` and `sameSite: 'lax'`. Deployed HTTPS uses `secure: true` and `sameSite: 'none'`. The app also keeps a signed profile in `localStorage` / `x-user-profile` as a fallback.

The Discord bot clears leftover slash-command menus on startup. Job and role changes are on the attendance card.

---

## 5. Deploy backend on Render

1. Sign up at [https://render.com](https://render.com) and connect GitHub
2. **New** → **Web Service** → select this repository
3. Settings:

| Field | Value |
| :--- | :--- |
| **Root Directory** | `backend` |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |

If `@guildname/shared` fails to resolve from `backend` alone, set Root Directory to the **repo root**, Build Command to `npm install`, and Start Command to `npm --prefix backend start`.

4. **Environment** → add every backend variable from section 3  
   - `OAUTH_REDIRECT_URI=https://YOUR-SERVICE.onrender.com/auth/callback`  
   - `FRONTEND_URL` can be temporary until Vercel exists; update it after step 6  
5. Deploy. Open `https://YOUR-SERVICE.onrender.com/` and confirm the online message
6. In Discord Developer Portal, ensure the production redirect URL is listed (section 1.3)

**Free tier note:** Render may sleep inactive services; the first request after sleep can be slow. The Discord bot runs inside this same process — if the service sleeps, the bot is offline too.

If Discord API calls fail from Render with network/block errors, set optional `PROXY_URL` to a working HTTP(S) proxy.

---

## 6. Deploy frontend on Vercel

1. Sign up at [https://vercel.com](https://vercel.com) and import this GitHub repo
2. Configure:

| Field | Value |
| :--- | :--- |
| **Root Directory** | `frontend` |
| **Framework Preset** | Vite |
| **Build Command** | `npm run build` (default) |
| **Output Directory** | `dist` |

`frontend/vercel.json` already rewrites SPA routes to `index.html`.

3. **Environment Variables** — add `VITE_*` from section 3  
   - `VITE_BACKEND_API_URL=https://YOUR-SERVICE.onrender.com`
4. Deploy. Copy the site URL (e.g. `https://your-app.vercel.app`)

5. **Deployment hygiene** (recommended so GitHub / Vercel stay tidy):

   | Setting | Where | Recommended |
   | :--- | :--- | :--- |
   | `deployment_status` Events | Vercel → Project → **Settings → Git** | **Off** (unless a GitHub Action depends on them) |
   | Production retention | Vercel → Project → **Settings → Security → Deployment Retention** | **7 days (`1w`)** — not 1 day |
   | Preview / Canceled / Errored retention | Same | **1 day (`1d`)** |

   Every git push creates a Vercel deployment and a matching **GitHub Deployments** record. Retention only deletes Vercel artifacts; it does **not** clear GitHub’s list. One current production alias is enough — you do not need hundreds of old records.

   Apply retention via API (optional) and print the Git toggle reminder:

   ```bash
   export VERCEL_TOKEN=...          # https://vercel.com/account/tokens
   export VERCEL_PROJECT_ID=...     # Project Settings → General
   # export VERCEL_TEAM_ID=...      # if the project is under a team
   ./scripts/configure-vercel-deploy-hygiene.sh
   ```

   Clear accumulated GitHub deployment metadata (safe for the live site):

   ```bash
   gh auth login
   ./scripts/cleanup-github-deployments.sh --keep 1
   ```

---

## 7. Wire production URLs together

After both deploys exist:

1. **Render** → set `FRONTEND_URL=https://your-app.vercel.app` (no trailing slash) → redeploy if needed  
2. **Discord OAuth2 Redirects** → production `https://YOUR-SERVICE.onrender.com/auth/callback`  
3. **Vercel** → `VITE_BACKEND_API_URL` points at Render (redeploy so Vite rebuilds with the env)  
4. From a machine with prod Discord credentials in `backend/.env`, the bot clears old slash menus on ready (or run `npm --prefix backend run clear-commands`)

5. Open the Vercel site and follow [section 8](#8-tenants-guilds-using-the-live-site) for the first guild.

---

## 8. Tenants (guilds using the live site)

A tenant is **one Discord server**. They do not clone this repo and they do not create Supabase / Render / Vercel accounts. They only need:

- A Discord server they belong to
- For **creating** a workspace: **Manage Server** on that Discord server

They do **not** paste Discord channel IDs unless they enable **Ragnarok Origin**. Adventurer Guild never asks for them.

Hand them the Vercel URL. The bot they invite is the one you created in section 1.

### 8.1 Members (guild already on VALHALLA)

1. Open the site → **Sign in with Discord**
2. Pick that Discord server under **Your guilds**
3. Use whichever games officers enabled (Ragnarok Origin, Adventurer Guild, or both)

If Discord returns no servers, they must join a server first, then sign in again.

### 8.2 Create a workspace (first officer)

1. Open the site → **Get started with Discord** (needs Manage Server)
2. Under **Create a workspace**, pick the Discord server
3. **Invite bot to this server** (opens Discord). Until the bot is in, officer roles cannot load.
4. Guild display name, timezone, and at least one **officer Discord role**
5. **Choose a game** (this is when the paths split)
   - **Adventurer Guild** — done. No channel IDs. Home is Highlights; Events is a separate page. Officers can hide it later; data stays.
   - **Ragnarok Origin** — the next screen asks for Discord channel IDs so the bot knows where to post auction / attendance / war cards. Skip this entire step if you did not enable that game.

     Turn on **Developer Mode** only for this: Discord **gear** (bottom left) → left list **Advanced** (under the App Settings heading) → Developer Mode. Then right-click a channel → **Copy Channel ID**. On phone: avatar → gear → **Advanced** (some builds: **Appearance**).

     | Field | What to paste |
     | :--- | :--- |
     | Auction announce | Phase announcements / request snapshots |
     | Auction request / claim card | Interactive auction card |
     | General room | General text |
     | Weekly attendance thread parent | One text channel (thread is created here) |
     | War-announce | One text channel for war cards |
     | Voice war rooms 1–5 | Voice channel IDs |

     Change these later in **Game Settings**. Catalogs (jobs, items, events) and **Send** (post cards into mapped channels) are also Game Settings, not env.

6. **Workspace** (toolbar) — logo, timezone, officer roles, hide/enable games, **Re-invite bot**

**Who is an officer in that guild:** the Discord user who created the workspace, plus anyone whose Discord role is listed under officer roles. If no officer roles are saved, only the onboarder is an officer. **Manage Server** is for creating the workspace, not for day-to-day officer tools.

### 8.3 Another guild later

Same live site. Same bot. Get started → pick a *different* Discord server. That becomes a second tenant with its own data. Do not add a second Discord application or a second Supabase project for it.

---

## 9. Post-setup checklist

**Operator**

- [ ] Render `/` returns online text  
- [ ] Vercel site loads and Discord login returns you to the app  

**First tenant**

- [ ] Bot appears online in that Discord server  
- [ ] Onboarder / listed officer roles can open Workspace and Game Settings  
- [ ] Discord role names in Workspace match live server roles  
- [ ] If Ragnarok Origin is enabled: auction / attendance / party cards post into mapped channels; war room voice IDs match real voice channels  

---

## 10. Project scripts (quick reference)

| Location | Command | Purpose |
| :--- | :--- | :--- |
| Repo root | `npm install` | Install workspaces |
| Repo root | `npm run dev` | Frontend + backend together |
| `frontend` | `npm run build` | Production build |
| `backend` | `npm start` | Production API + bot |
| `backend` | `npm run migrate` | Apply Postgres schema |
| `backend` | `npm run test:isolation` | Tenant A/B isolation check |
| `backend` | `npm run clear-commands` | Clear leftover Discord slash-command menus |
| `scripts/` | `./scripts/configure-vercel-deploy-hygiene.sh` | Set Vercel retention (needs `VERCEL_TOKEN`) |
| `scripts/` | `./scripts/cleanup-github-deployments.sh --keep 1` | Delete old GitHub deployment records |

---

## 11. Troubleshooting

| Problem | What to check |
| :--- | :--- |
| Backend crashes on boot | Missing env from the required list in section 3 (`DATABASE_URL` + Discord OAuth + `SESSION_SECRET`) |
| OAuth “redirect_uri mismatch” | Discord Redirects must **exactly** equal `OAUTH_REDIRECT_URI` |
| Login works but API CORS errors | `FRONTEND_URL` must match the browser origin (scheme + host, no trailing slash) |
| Settings / officer tools locked | You must be the Discord user who created that workspace, or hold a Discord role listed under Workspace → officer roles |
| Create a workspace list is empty | You need **Manage Server** on a Discord server that is not onboarded yet |
| Officer role list empty on onboard | Invite the bot first, then reload |
| Bot offline on Render | Service sleeping / crashed; check Render logs; optional `PROXY_URL` |

---

## License / requirements

Functional requirements live in [Requirements/Requirements.md](Requirements/Requirements.md) (historical). This README covers platform install (sections 1–7) and tenant onboard (section 8).
