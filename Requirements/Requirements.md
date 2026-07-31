# Guild Name — System Requirements Specification

Single source of truth for functional requirements of the Guild Name full-stack platform (Express + Discord bot backend, Vite/React frontend, Firebase Realtime Database).

This document reflects **current code behavior**. Historical chat / Google Sheets / LiveBidding requirements that no longer map to mounted code are listed under [Deleted requirements](#deleted-requirements).

For install and deploy instructions, see the root [README.md](../README.md).

---

## Architectural milestones

| Milestone | Objective | Status vs code |
| :--- | :--- | :--- |
| **Task001** | Firebase RTDB as primary state store | **Done** — Admin SDK + client SDK; no 5s poll loop |
| **Task002** | LiveBidding / chat decommission | **Done** — chat routes/UI removed |
| **Task003** | Dynamic app parameters via Settings | **Done** — `settings/configuration` + Settings desk |
| **Task004** | Retire Google Sheets pipeline | **Done** — `syncRouter` unmounted (file may remain) |
| **Task005** | Session / identity header standardization | **In use** — session cookie + `x-user-profile` / localStorage fallback |
| **Task006** | Auction vs Attendance macro hubs | **Done** — top macro switcher + context nav |
| **Task007** | Voice war-room telemetry | **Done** — `GuildVoiceStates` + live-raid monitoring |
| **Task008** | Dynamic raid-party grid geometry | **Done** — compositions from Firebase / Settings |
| **Task009** | Job / role catalogs via slash commands | **Done** — `/jobchange`, `/rolechange`, Settings catalogs |

---

## Part 1: Backend

### Core module — `backend/src/index.js`

* **REQ001 (Health check):** `GET /` returns a confirmation string that the backend is online.
* **REQ002 (Event-driven scheduling):** The backend must **not** run a fixed 5-second data poll loop. Background work is event-driven (Discord gateway, 60s announce tickers, live-raid resume on boot).
* **REQ003 (Phase announcements — config-driven):** Registration open / locked / live notices and Discord snapshots are driven by `settings/configuration.events.*.announcements` via the Discord bot ticker (`eventAnnounce`), not hardcoded clock strings in `index.js`.
* **REQ004 (Finalized / lock broadcasts):** When phase logic reaches a lock / finalize window, the announcer may post a finalized snapshot to `DISCORD_AUCTION_CHANNEL_ID` (idempotent markers under `scheduler/event_announcements/`).
* **REQ005 (CORS + session stack):** Express must enable CORS for the configured frontend origin(s), parse JSON, and use **`express-session`** with `secure: true` and `sameSite: 'none'` (HTTPS / cross-site cookie support).
* **REQ006 (Mounted route matrix):** Bind:
  * `/auth` → Discord OAuth
  * `/api/requests` → auction / settings / history
  * `/api/attendance` → roster, compositions, commitments, scheduler helpers
  * `/api/live-raid` → live raid session + voice monitoring
  * `GET /api/deploy-auction-card` → post interactive auction card to `DISCORD_AUCREQ_CHANNEL_ID`
* **REQ007 (Default listen port):** Listen on `process.env.PORT` or **5001**.
* **REQ008 (Bot + Firebase boot):** On startup, validate env, initialize Firebase Admin, initialize the Discord bot, then resume live-raid monitoring if a session was left Active.

### Request routers — `backend/src/api/request.routes.js`

* **REQ009 (Identity enforcement):** Protected request endpoints must resolve the user from the session cookie or signed `x-user-profile` header; otherwise return `401`.
* **REQ010 (Basket limits from config):** Per-item allocation ceilings come from `settings/configuration.events.<event>.loots` (seed defaults: Puppet 1, Illusion 1, Light & Dark 3, Time & Space 5).
* **REQ011 (Submit / cancel):** Authenticated users may submit baskets when the registration gate is open; cancellation of pending requests remains available while Phase 1/2 (open or locked), but is blocked once Phase 3 (Live Event / Auction) begins, to prevent members from canceling an app request after already bidding in-game.
* **REQ012 (Priority scoring):** Priority is computed from request history / lookback settings (`priorityLookbackDays` in configuration). Being marked `Selected` or `Absent` resets the streak to zero, except for items flagged `isHighValue` in the Master Inventory Registry, where an `Absent` outcome retains (and continues accumulating) priority instead of resetting it. Officers may force-reset a member's priority for a specific item via `POST /api/requests/reset-priority`.
* **REQ013 (Persist requests):** Valid submissions write into Firebase (`auction/web_requests` and related auction nodes) with status/selection fields.
* **REQ014 (Leaderboards):** APIs expose ranked participant lists for active item types (sorting via `sortingEngine`).
* **REQ015 (Settings unlock):** `POST /api/requests/settings/unlock` verifies `SETTINGS_MASTER_KEY` and marks the session as settings-unlocked.
* **REQ016 (Settings get + auto-seed):** `GET /api/requests/settings/get` returns `settings/configuration`. If missing, write `DEFAULT_CONFIGURATION` from `backend/src/config/defaultConfiguration.js` then return it. Optional `guildDisplayName` is a display-only brand string (browser title); it is not a tenant / data-partition key.
* **REQ017 (Settings save):** `POST /api/requests/settings/save` requires an unlocked settings session and overwrites `settings/configuration`.
* **REQ018 (Active session / Mimic Book APIs):** Endpoints support active session read/update/commit, roster sync, loot history, past auctions, and request history used by Mimic Book and history tabs.
* **REQ019 (Officer role checks):** Officer-only mutations compare the caller’s Discord guild roles against `settings/configuration.adminRoles` (defaults: `GUILD LEADER`, `Vice Guild Leader`, `Commander`).

### Attendance routers — `backend/src/api/attendance.routes.js`

* **REQ020 (Roster governance):** Officers can batch-update, vanish, or manage roster entries tied to Discord identities in `auction/members` / attendance trees.
* **REQ021 (Compositions CRUD):** Persist and load raid party compositions under `attendance/compositions`.
* **REQ022 (Commitments / RSVP):** Read/write `attendance/commitments` for schedule dates/events.
* **REQ023 (Week instances / special events):** Ensure scheduler week instances and special events under `scheduler/*`.
* **REQ024 (Announce week):** Officers can trigger weekly attendance Discord thread posting (`announce-week`).
* **REQ025 (Job targets / stats helpers):** Support expected attendance rate and job-target data for Statistics.

### Live Raid routers — `backend/src/api/liveRaid.routes.js`

* **REQ026 (Live session lifecycle):** Create, update cells, end, and cancel live raid sessions under `attendance/live_session` (and related history/archive paths).
* **REQ027 (Voice presence monitoring):** Resolve war-room channel IDs via `warRoomResolver` (`settings/configuration.warRooms[].envKey` → `DISCORD_WARROOM_ID_*`) and track voice presence for Active sessions.
* **REQ028 (Boot resume):** On server start, resume in-memory monitoring if a live session was left Active.

### Discord OAuth — `backend/src/auth/discordOAuth.js`

* **REQ029 (OAuth login):** `GET /auth/login` starts Discord OAuth with scope `identify` and a CSRF `state`.
* **REQ030 (Callback):** `GET /auth/callback` exchanges the code, loads profile, applies guild nickname when available, upserts `auction/members/{id}`, stores session user, redirects to `FRONTEND_URL` with `auth_user` query payload.
* **REQ031 (Session status):** `GET /auth/me` reports authenticated user from session.
* **REQ032 (Logout):** `POST /auth/logout` clears session.
* **REQ033 (Guild roster cache):** Member list fetches use a short TTL cache to reduce Discord rate limits (`/auth/discord-members`).

### Discord bot client — `backend/src/discord-bot/client.js`

* **REQ034 (Intents):** Bot initializes with `Guilds`, `GuildMessages`, `MessageContent`, `GuildMembers`, and `GuildVoiceStates`.
* **REQ035 (Token required):** Missing `DISCORD_BOT_TOKEN` is a fatal boot error.
* **REQ036 (Ready log):** On ready, log the bot username tag.
* **REQ037 (Interaction routing):**
  * `att:*` components → attendance announce handlers (any channel/thread)
  * Auction panel custom IDs → interactive auction handlers
  * Other slash/components → **only** in `DISCORD_GENROOM_ID_1`
* **REQ038 (Text job commands):** In the general room, text `/job` / `/jobchange` may update `auction/members/{uid}.jobCode` from `settings/configuration/jobs`.
* **REQ039 (Announce ticker):** ~60s loop runs weekly attendance announce + event phase announce.
* **REQ040 (Optional proxy):** If `PROXY_URL` is set, route Discord HTTP through that Undici proxy (datacenter IP blocks).

### Slash commands — `backend/src/discord-bot/commands/manifest.js` + `discordSlashcmd.js`

* **REQ041 (Registered commands):** Guild-scoped commands: `/jobchange`, `/rolechange`, `/namechange`, `/event`, `/myparty`.
* **REQ042 (`/jobchange` / `/rolechange`):** Ephemeral selects write `jobCode` / `roleCode` on `auction/members/{uid}` when catalogs exist; blocked when force-locked.
* **REQ043 (`/namechange`):** Sets the member’s Discord guild nickname (bot needs Manage Nicknames + role hierarchy).
* **REQ044 (`/event`):** RSVP matrix for upcoming schedule → commitments.
* **REQ045 (`/myparty`):** Reports the caller’s slot / party leader from the active live-session grid.

### Attendance announce — `backend/src/discord-bot/attendanceAnnounce.js`

* **REQ046 (Weekly thread):** On Sundays at/after `ATTENDANCE_POST_HOUR` (default 10, guild TZ), post/create a public thread in `DISCORD_ATTENDANCE_ID` with RSVP controls; marker under `scheduler/attendance_announcements/{weekMonday}`.
* **REQ047 (`att:*` buttons):** Confirm / leave / manage RSVP; refresh embed counts.

### Event announce + snapshot — `eventAnnounce.js` + `discordSnapshot.js`

* **REQ048 (Phase posts):** Config-driven P1/P2/P3 announcements to `DISCORD_AUCTION_CHANNEL_ID`, with optional request-list snapshots compiled from Firebase.
* **REQ049 (Force-lock silence):** Skip automated phase posts when `isForceLocked` is set (except explicit finalized paths as implemented).

### Interactive auction — `backend/src/services/discordInteractiveAuction.js`

* **REQ050 (Public card):** Deployable card in `DISCORD_AUCREQ_CHANNEL_ID` opens ephemeral claim UI.
* **REQ051 (Slot claims):** Claiming empty slots updates `auction/active_session` when Discord gate is open and member exists in roster.

### Firebase Admin — `backend/src/config/firebase.js`

* **REQ052 (Singleton app):** Reuse an existing Firebase app instance if already initialized.
* **REQ053 (Service account):** Build credentials from `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (unescape `\n`).
* **REQ054 (Database URL):** Attach Realtime Database using `FIREBASE_DATABASE_URL`.

### Env gate — `backend/src/config/env.js`

* **REQ055 (Required env whitelist):** Boot fails if any of these are missing: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `OAUTH_REDIRECT_URI`, `SESSION_SECRET`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_DATABASE_URL`, `DISCORD_AUCREQ_CHANNEL_ID`, `DISCORD_AUCTION_CHANNEL_ID`, `DISCORD_GENROOM_ID_1`, `DISCORD_ATTENDANCE_ID`, `DISCORD_WARROOM_ID_1` … `DISCORD_WARROOM_ID_5`.
* **REQ056 (Recommended env):** Document and expect in production: `FRONTEND_URL`, `DISCORD_GUILD_ID`, `SETTINGS_MASTER_KEY`, optional `ATTENDANCE_POST_HOUR`, `PROXY_URL`, `PORT`.

### Time / configuration — `timeWindow.js` + `defaultConfiguration.js`

* **REQ057 (Guild timezone):** Evaluate schedules in the configured timezone (default `Asia/Manila`).
* **REQ058 (Config cache):** Keep a live-ish cache of `settings/configuration` for gate / phase / announcement minute helpers.
* **REQ059 (Seed shape):** Default configuration includes timezone, `adminRoles`, items, events/phases/loots/announcements, warRooms, jobs/roles placeholders, live-raid limits.

### War room resolver — `backend/src/utils/warRoomResolver.js`

* **REQ060 (EnvKey mapping):** Map each configured war room’s `envKey` to the matching process env snowflake for voice monitoring.

---

## Part 2: Frontend

### App shell — `frontend/src/App.jsx`

* **REQ061 (Session restore):** On mount, prefer `auth_user` query → then `localStorage` (`guild_raid_session`) → verify with `GET /auth/me`.
* **REQ062 (Logout):** Clear local session and call backend logout.
* **REQ063 (Macro hub state):** Maintain Auction vs Attendance (`raid`) macro tab; layout swaps nav sets.
* **REQ064 (Route table):**

| Path | Page |
| :--- | :--- |
| `/` | RequestTab |
| `/mimic-book` | MimicBookTab |
| `/request-history` | RequestHistoryTab |
| `/past-auction` | PastAuctionTab |
| `/submit-evidence` | SubmitEvidenceTab (placeholder) |
| `/login` | LoginPage |
| `/settings-configuration` | SettingsTab |
| `/attendance/masterlist` | MasterListTab |
| `/attendance/raidparty` | RaidPartyTab |
| `/attendance/liveraid` | LiveRaidTab |
| `/attendance/history` | AttendanceHistoryTab |
| `/attendance/statistics` | StatisticsTab |
| `/attendance/scheduler` | Scheduler |

### Navigation — `LeftNavBar.jsx` + `MainLayout.jsx`

* **REQ065 (Auction nav):** Request, Mimic Book, Request History, Past Auction, Submit Evidence (+ Settings / Help as provided by layout).
* **REQ066 (Attendance nav):** MasterList, Raid Party, Live Raid, History, Statistics, Scheduler.
* **REQ067 (Auth panel):** Login with Discord vs Logout; show avatar/display name when authenticated.
* **REQ068 (Active link highlight):** Style the current route distinctly.

### Request tab — `RequestTab.jsx`

* **REQ069 (Guest gate):** Unauthenticated users see a blocking login prompt.
* **REQ070 (Schedule banner):** Show Open / Locked / Live (or equivalent) from gate APIs/config.
* **REQ071 (Quantity controls):** Per-item +/- within config loot caps.
* **REQ072 (Submit / Cancel):** Submit respects lock; Cancel remains available while Phase 1/2, but is disabled once Phase 3 (Live Event) begins.
* **REQ073 (Leaderboard views):** Tabs/tables for rankings by item type.

### Mimic Book — `MimicBookTab.jsx`

* **REQ074 (Officer wizard):** Multi-step loot input → evaluation matrix → live session / Discord gate controls.
* **REQ075 (Commit session):** Persist allocations / winners / session date via request APIs.
* **REQ076 (Discord gate toggle):** Control whether interactive Discord claiming is open (`isDiscordGateOpen`).

### Settings — `SettingsTab.jsx`

* **REQ077 (Master key unlock):** Unlock editing with `SETTINGS_MASTER_KEY` via unlock API.
* **REQ078 (Edit configuration):** Edit timezone, admin roles, items, events, announcements, jobs, roles, war rooms, help URLs, etc., and save to Firebase through the backend.
* **REQ079 (Announce week action):** Officers may trigger weekly attendance announce from Settings where exposed.

### History / past auction

* **REQ080 (Request History):** `RequestHistoryTab` loads live request ledger from API (filters as implemented).
* **REQ081 (Past Auction):** `PastAuctionTab` loads past auction summaries from API.
* **REQ082 (Submit Evidence):** Placeholder only — no submission pipeline required yet.

### Attendance UI

* **REQ083 (MasterList):** Officer roster CRUD / dummy / vanish; columns for identity, job, join metadata; participation styling must avoid hostile red call-outs for low attendance.
* **REQ084 (Raid Party):** Drag-and-drop compositions; geometry/tabs from configuration; member cards show avatar, nickname, job, id.
* **REQ085 (Live Raid):** Live raid deck UI backed by `/api/live-raid`.
* **REQ086 (Attendance History):** Browse archived live sessions.
* **REQ087 (Statistics):** Charts / job distribution / targets from attendance APIs.
* **REQ088 (Scheduler):** Calendar RSVP + special events; may use Admin-SDK polls and best-effort RTDB listeners.

### Data clients

* **REQ089 (API client):** `apiClient` targets `VITE_BACKEND_API_URL` and attaches identity headers when cookies fail.
* **REQ090 (Firebase web client):** `firebaseClient` initializes RTDB from `VITE_FIREBASE_*` for optional direct listeners.
* **REQ091 (Auth service):** Login redirect to backend `/auth/login`; logout via `/auth/logout`.

### Vite — `frontend/vite.config.js`

* **REQ092 (Dev port 3000):** Vite dev server listens on port **3000**.
* **REQ093 (Dev proxy):** Proxy `/api` and `/auth` to `http://localhost:5001`.

---

## Part 3: Data & integrations

### Firebase Realtime Database paths (primary)

* **REQ094 (Settings):** `settings/configuration` (+ nested jobs, roles, events, warRooms, …).
* **REQ095 (Auction):** `auction/members`, `auction/web_requests`, `auction/active_session`, `auction/loot_history`, `auction/past_auctions`.
* **REQ096 (Attendance):** `attendance/compositions`, `attendance/commitments`, `attendance/live_session`, `attendance/history`, `attendance/session_archive`.
* **REQ097 (Scheduler markers):** `scheduler/instances`, `scheduler/special_events`, `scheduler/attendance_announcements`, `scheduler/event_announcements`.

### Discord channel roles (env)

| Variable | Purpose |
| :--- | :--- |
| `DISCORD_GUILD_ID` | Guild for OAuth nicknames, slash deploy, roster |
| `DISCORD_GENROOM_ID_1` | Slash / text job commands |
| `DISCORD_AUCTION_CHANNEL_ID` | Phase announce + snapshots |
| `DISCORD_AUCREQ_CHANNEL_ID` | Interactive auction card |
| `DISCORD_ATTENDANCE_ID` | Weekly attendance thread parent |
| `DISCORD_WARROOM_ID_1`…`_5` | Voice rooms for live attendance |

---

## Deleted requirements

The following IDs from older SRS drafts are **removed** because the feature is deleted or unmounted:

| Former area | Former IDs (approx.) | Reason |
| :--- | :--- | :--- |
| Live chat routes / webhook / ChatConsole | chat REQ016–021, 046–053, 085–091 (old numbering) | Code removed; no `/api/chat` |
| Auction channel chat mirror | old REQ031–034 | LiveBidding removed |
| Google Sheets sync router | old REQ060–062 | `syncRouter.js` not mounted |
| Hardcoded 5s refresh loop in `index.js` | old REQ002 | Replaced by event-driven + 60s announce tickers |
| Fixed-only 07:00 / 12:00 / 19:00 / 22:15 in bootstrap | old REQ003–006 as bootstrap hardcodes | Now config-driven via Settings events |
| Placeholder-only Request History / Past Auction | old empty stubs | Implemented via API |

Legacy file that may still exist but must **not** be treated as a requirement: `backend/src/routes/syncRouter.js`.

---

## Requirements inventory (current)

```
[ BACKEND  ]  REQ001 – REQ060
[ FRONTEND ]  REQ061 – REQ093
[ DATA/INT ]  REQ094 – REQ097
```

Use this document for development tracking. For setup, see [README.md](../README.md).
