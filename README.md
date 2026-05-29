# 🏆 Dynasty Guild Full-Stack System Requirements Specification

Welcome to the official **System Requirements Specification and Developer Architecture Manual** for the Dynasty Guild Full-Stack platform. This document serves as the absolute single source of truth (SSOT) tracking system mandates, legacy deprecations, and infrastructure migration items across both the backend services layer and the frontend web UI ecosystem.

---

## 🗺️ Architectural Transformation Roadmap

To support ongoing system stabilization, data modernization, and architectural decoupling, all functional requirements have been thoroughly cross-referenced against five central engineering milestones:

| Milestone ID | Core Technical Objective | Scope of Impact |
| :--- | :--- | :--- |
| **`Task001`** | **Firebase Database Integration Pass** | Transition stateful, calculated, and operational records from ephemeral memory / static tables to real-time synchronized Firebase nodes. |
| **`Task002`** | **LiveBidding Component Decommissioning** | Completely prune, disconnect, and safely delete live chat feeds, active message streaming routes, and related websocket frames. |
| **`Task003`** | **Dynamic Application Parameterization** | Extract hardcoded limits, schedules, and variables into configurable parameters managed via a central application setting tree. |
| **`Task004`** | **Legacy Google Sheets Pipeline Retirement** | Deprecate all modules mapping parameters, fetching historical columns, or parsing grid matrix rows from external Google Sheets. |
| **`Task005`** | **5S Security & Token Standardization** | Standardize header-driven identification strings and session profile key names to match uniform global tokens. |

---

## 🖥️ Part 1: Backend Server Architecture

### 🌐 Core Application Module: `backend/src/index.js`
This file serves as the core foundational driver for automated operations, coordinating long-polling sequences, background processing tickers, and discord channel message automation lines.

* **REQ001 (Server Status Confirmation):** When any network client issues a GET request targeting the root server path URL, the application must intercept the query and return a basic confirmation string verifying that the environment is fully operational.
* **REQ002 (Continuous Data Refresh Loop):** The backend execution runtime engine must automatically maintain a self-healing, recursive polling interval ticking strictly every **5,000 milliseconds (5 seconds)** to execute background sync routines across system data sets.
    * > ⚠️ **Developer Review Alert (`Task001`):** This local background looping loop is completely scheduled for migration. Data streams must connect via native Firebase live subscriptions, eliminating the manual 5-second polling requirement.
* **REQ003 (Morning Progress Update Broadcast):** The server scheduling engine must autonomously trigger an item-request aggregation compilation routine and publish a formatted progress snapshot directly into the designated Discord text channel at exactly **07:00 AM (Asia/Manila GMT+8)**.
* **REQ004 (Midday Progress Update Broadcast):** The server scheduling engine must autonomously trigger an item-request aggregation compilation routine and publish a formatted progress snapshot directly into the designated Discord text channel at exactly **12:00 PM (Noon Asia/Manila GMT+8)**.
* **REQ005 (Evening Progress Update Broadcast):** The server scheduling engine must autonomously trigger an item-request aggregation compilation routine and publish a formatted progress snapshot directly into the designated Discord text channel at exactly **07:00 PM (Asia/Manila GMT+8)**.
* **REQ006 (Nightly Lock Threshold & Final Broadcast):** The server scheduling engine must execute an absolute registration lockdown phase at exactly **10:15 PM (22:15 Asia/Manila GMT+8)**, freezing active configurations and generating a finalized, static master request summary block posted directly inside the live Discord feed.

---

### 🛣️ Client Registration Routers: `backend/src/api/request.routes.js`
This route segment establishes the public interface used by standard guild members to load active transaction thresholds, compile current baskets, process scroll requests, or drop pending selections.

* **REQ007 (User Identity Recognition & Session Enforcement):** All inbound requests targeting the registration endpoints must extract credentials out of the browser's active Discord cookie block or the alternative incoming application request token header. If the credential verification loop returns an anonymous or invalid payload state, the endpoint must terminate the process and return a strict `401 Unauthorized` block response.
* **REQ008 (Item Basket Hardcoded Boundaries):** The system enforces rigid basket allocation parameters per session transaction, restricting individual scroll limits exactly to:
    * **Puppet Scroll:** Maximum Allocation Limit = **1**
    * **Illusion Scroll:** Maximum Allocation Limit = **1**
    * **Light & Dark Scroll:** Maximum Allocation Limit = **3**
    * **Time & Space Scroll:** Maximum Allocation Limit = **5**
* **REQ009 (Saved Request Calculation Engine):** The script must dynamically scan through the player’s personal record rows inside the tracking document spreadsheet, aggregating overall requested amounts by adding entries labeled `Requested` and subtracting historical balances labeled `Canceled`.
    * > ⚠️ **Developer Review Alert (`Task001`):** Legacy tracking spreadsheet row scanning is completely scheduled for deletion. Active sums must run via optimized database query lookups against Firebase collections.
* **REQ010 (Live Queue State Synchronization):** Before passing calculated data payloads down to the client visual interface, the route processing logic must compare values against the ephemeral memory queue inside Firebase, instantly injecting or filtering out selections currently pending processing.
    * > ⚠️ **Developer Review Alert (`Task001`):** State computation must be consolidated into a unified real-time data repository to maintain structural balance.
* **REQ011 (Live Leaderboard Compiler Module):** The api must dynamically iterate over the active participant array, query current pending application markers, sort entries sequentially from the highest calculated priority score down to the baseline minimum, and output a list mapping the top 100 profiles.
    * > 🛑 **Deprecation Directive (`Task002`):** This ranking compiler is slated for complete code removal. Live bidding visual grids are being stripped from the platform architecture.
* **REQ012 (Submission Gate Cutoff Verification):** When a user pushes a basket submission transaction, the system configuration wrapper must verify the current time matrix to guarantee the registration gate is explicitly set to an `Open` state. If a transaction hits the engine during a locked phase, the request is immediately dropped with an active constraint message.
    * > ⚠️ **Developer Review Alert (`Task001` / `Task003`):** Schedule gate tracking logic must be pulled out of hardcoded calculations and moved into a centralized Firebase parameters block.
* **REQ013 (Priority Score Computation Engine):** When computing point parameters for a prospective selection, the system must parse backward through a user's chronological application history array until it detects the first instance of a `Selected` validation status. The compiler then aggregates a count of all subsequent rows marked with a `NotSelected` result, awarding exactly **+1 priority point** per occurrence.
    * > ⚠️ **Developer Review Alert (`Task001`):** History parsing routines must move to dedicated, indexed tables within Firebase.
* **REQ014 (Recording Validated Submissions):** Upon passing authorization, capacity checks, and schedule checks, the server must capture the system timestamp converted to localized Asia/Manila GMT+8 format, logging the transaction into the live database queue with an initial status string of `Requested` and selection criteria anchored to `Pending`.
    * > ⚠️ **Developer Review Alert (`Task001`):** Target path structure must map cleanly into your native JSON collection layout.
* **REQ015 (Unlocked Request Cancellation Override):** Users must be granted access to cancel pending selections at any point across the deployment calendar—even if standard submission gates are explicitly locked down. The system processes this transaction immediately, appending a state flag of `Canceled`, setting selection to `Pending`, and clearing the point allocation value to `0`.

---

### 💬 Live Interaction Routers: `backend/src/api/chat.routes.js`
> 🛑 **Deprecation Directive (`Task002`):** This entire file, along with its matching message routing chains, input validations, cross-origin workarounds, and database persistence routines, is designated for structural removal from the codebase.

* **REQ016 (Message Content Validation):** The endpoint must inspect inbound strings to confirm the payload contains valid alphanumeric structures. Blank inputs or payloads consisting exclusively of whitespace strings must be discarded without execution.
* **REQ017 (Sender Cross-Origin Identification):** The processing pipeline must scan incoming cookies for a valid session token tracking key. If browser privacy configurations block cookie passing (e.g., cross-site sandboxes or mobile platforms), the script must check for an explicit fallback header key labeled `x-authorized-user`. If both checks fail, the message is blocked.
    * > 📝 *Developer Note:* Security token layouts require refinement if preserved elsewhere; scheduled for deletion here due to overall feature removal.
* **REQ018 (Bot Lifecycle Startup Guard):** Before initiating a message delivery request, the routing logic must verify that the core Discord client wrapper is authenticated and listening to the gateway. If a message hits the route during a server reboot cycle while the socket handshake is warming up, the transmission must hold back, returning an error message requesting a 2-second delay before re-attempting.
* **REQ019 (Dynamic Profile Synchronization):** The system must query the active Discord server cache using the authenticated player's unique identifier to fetch their current server-specific custom nickname and avatar resource image path, preventing outdated profile data displays.
* **REQ020 (Identity-Preserving Webhook Mirroring):** Outbound text strings must route via an external Discord Webhook execution call target. This forces the message inside the target Discord channel layout to visually present the individual player's personalized avatar image and custom guild server nickname instead of a generic bot identity.
* **REQ021 (Real-Time Database Archive Insertion):** Simultaneously with external web hook firing, the routing script must compose a structured message document containing a unique tracking identifier, the resolved display name string, filtered text strings, millisecond-level epoch system clocks, and a hardcoded origin flag of `"app"`. This payload drops directly into the live Firebase `chat/messages` data tree.

---

### 📸 Status Broadcaster Service: `backend/src/services/discordSnapshot.js`
This module acts as the core orchestration framework for preparing, formatting, and executing the delivery of the guild’s current active item request lists straight to targeted Discord server feeds.

* **REQ022 (Broadcast Readiness Safety Verification):** Before initializing calculation arrays or constructing text blocks, the service layer must run pre-flight checks to guarantee that the core target sheet identifier is verified, the specific Discord destination text room identifier is loaded, and the underlying Discord client service is active on the network. If any dependency is absent, execution terminates instantly to avoid unexpected system crashes.
    * > 📝 *Architecture Verification Check:* Confirmed function role—this module operates as the primary tracking engine for formatting and compiling Request List distributions.
* **REQ023 (Silent Lock Window Suppression Filter):** Automated hourly updates (triggered via the 07:00, 12:00, and 19:00 routines) must immediately abort and remain completely silent if the schedule controller detects that the registration gate phase has passed a lockdown point. Only update calls explicitly embedded with an overriding `"Finalized"` flag are authorized to execute Discord message broadcasts during a lock phase.
* **REQ024 (Cross-Platform Accumulator Matrix):** The service calculation layer must download structural transaction history lines from the spreadsheet and programmatically combine them with active, pending transaction records pulled from the live Firebase database collections. The script cross-references quantity counts against logged cancellations to output an accurate net item demand count for every participant profile.
    * > ⚠️ **Developer Review Alert (`Task001` / `Task004`):** Calculations must be streamlined to read purely from native Firebase data nodes, removing the legacy spreadsheet compilation logic completely to prevent execution loops.
* **REQ025 (Snapshot Priority Ranking Engine):** The script loops across all individual item inventory classes (`Puppet`, `Illu`, `Light&Dark`, `Time&Space`), filtering out profiles that maintain zero net balance requests. The remaining active profiles are sorted by priority score metrics from highest to lowest, cutting off output formatting at exactly **100 entries per category**.
    * > ⚠️ **Developer Review Alert (`Task001`):** Data sorting and selection should hook straight to optimized database indices.
* **REQ026 (Manila-Time Message Compilation):** The aggregated leaderboard output array must translate into a structured, human-readable monospace text string. The header section must display an absolute time stamp calculated strictly within the localized **Asia/Manila GMT+8 (Asia/Manila)** timezone. When a finalized snapshot sequence is processed, the system must append an explicit header notice string stating: `(FINALIZED LIST - LOCKED)`.
* **REQ027 (Native Discord Channel Injection):** Once the text buffer payload is completely assembled and formatted, the bot execution framework must locate the target Discord channel mapping configuration and inject the text block natively into the chat stream.

---

### 🤖 Core Gateway Bot Client: `backend/src/discord-bot/client.js`
This module manages connection authentication, gateway protocol streams, event filters, and data transfers between Discord chat channels and the backend system databases.

* **REQ028 (Bot Server Permission Intent Mandates):** The background bot execution wrapper must initialize with specific gateway intent parameters declared, explicitly requiring permissions for Guild instance visibility (`Guilds`), message event observation (`GuildMessages`), text message string extraction (`MessageContent`), and structural member caching (`GuildMembers`).
* **REQ029 (Authentication Token Gateway Handshake):** During the module boot sequence, the client initialization process must pull the system level configuration secret labeled `DISCORD_BOT_TOKEN` to validate its connection against Discord's gateway servers. If the system configuration wrapper reports this token is empty or undefined, the process must throw a fatal initialization exception to prevent a silent boot failure.
* **REQ030 (Bot Status Confirmation Logging):** Upon completing a verified, authorized handshake protocol loop with the external Discord API servers, the bot instance must log an official validation string to the server stdout terminal displaying its verified account username tag.
* **REQ031 (Channel Activity Scope Filter):** The message observer pipeline must actively parse chat events occurring on the server but must immediately drop and discard any incoming message string that originates from a chat room index that does not match the hardcoded `DISCORD_AUCTION_CHANNEL_ID` parameter.
    * > 🛑 **Deprecation Directive (`Task002`):** This tracking layer is slated for complete code removal alongside the overall live bidding feature cleanup pass.
* **REQ032 (Anti-Loop Bot Protection Guard):** To isolate the platform against infinite echo routines, the message parser engine must check the author parameters of every incoming chat event. If the message creator is flagged as an official bot profile or matches the system's own client identifier, the transaction must drop out immediately.
    * > 🛑 **Deprecation Directive (`Task002`):** Decommissioned along with active bidding live feeds.
* **REQ033 (Raid Roster Server Nickname Resolver):** When an authentic player posts a message string within the filtered Discord chat channel, the bot must query the target guild cache to extract their customized server nickname or layout specific display name. If the query returns empty, the script falls back to parsing their base account username string.
    * > 🛑 **Deprecation Directive (`Task002`):** Slated for code removal.
* **REQ034 (Live Firebase Mirror Injection):** Upon resolving the player's identity and visual metrics, the service must pack the message ID, display name string, filtered message text, and millisecond epoch message creation time into an object block labeled with an origin source parameter of `"discord"`. This object is directly committed to the live Firebase real-time data stream.
    * > 🛑 **Deprecation Directive (`Task002`):** Slated for code removal.

---

### 🔑 Identity Access Provider: `backend/src/auth/discordOAuth.js`
This file implements the secure authentication pipelines, coordinating official Discord profile token handshakes, web user browser session generation, cookie encryption, and structural member identity mapping.

* **REQ035 (Guild Roster Synchronization & Cache Management):** The service layer must communicate with the target Discord server profile database to fetch the comprehensive array of active community members. To protect system performance against aggressive Discord API rate-limiting thresholds, this roster must lock into server memory within a localized **2-minute volatile cache**, while programmatically blocking concurrent, overlapping API network queries.
* **REQ036 (Secure Authentication Gateway Redirection):** When a user clicks the "Sign in with Discord" button link on the web layer, the authentication engine must generate a cryptographically random, single-use `state` string, save it inside the temporary tracking session, and redirect the browser to Discord's official secure portal with baseline identification scopes appended.
* **REQ037 (Profile Code Verification and Exchange):** When a user browser returns from the authentication loop, the engine must assert that the incoming tracking string matches the saved `state` token exactly. Upon successful validation, it issues an outbound request to exchange the temporary access code for an encrypted web token, utilizing it to pull down raw account identity parameters from the Discord metadata endpoint.
* **REQ038 (Raid Identity Nickname Overriding):** During authorization parsing, the server must query the cached server guild profile map to evaluate if the logging-in profile is a member of the guild. If the lookup catches a custom server nickname or server display layout name, the login manager must override their global system username parameter with this local server identity handle.
* **REQ039 (Session Preservation & Client Parameters Handshake):** Following successful identity resolution, the system must assemble an identity manifest data structure (containing the unique Discord identifier, username handle, custom avatar asset hash, and resolved display name) and write it into a secure, encrypted browser session cookie. The server then executes a client-side redirect, attaching these identity vectors as URL parameters to bootstrap the frontend web interface.
* **REQ040 (Active Login Verification Engine):** The route matrix must expose an explicit state validation endpoint. When the user navigates or reloads dashboard interfaces, the frontend scripts query this route to verify session cookie status and recover profile metadata, maintaining a persistent login experience.
* **REQ041 (Secure Session Destruction / Sign-Out):** When a user hits the sign-out trigger option, the authentication engine must completely purge the backend server-side session tracking arrays and clear out browser session tracking cookies, executing an absolute termination of the user's logged-in status.

---

### ⏱️ Timeline Scheduling Engine: `backend/src/config/timeWindow.js`
This configuration module holds the structural schedule parameters, cutoff calendars, and state automation conditions that dictate registration windows, block adjustments, and switch layout page views.

* **REQ042 (Absolute GMT+8 Time Zone Enforcement):** The scheduling evaluation engine must programmatically normalize all system date strings and server runtime clock assessments strictly to the **Asia/Manila GMT+8** timezone. This ensures deadline thresholds execute perfectly on schedule regardless of the timezone configuration of the cloud provider hosting the code.
    * > ⚠️ **Developer Review Alert (`Task003`):** This hardcoded timezone conversion routine must transition into an adjustable setting node within the centralized Firebase system properties dashboard.
* **REQ043 (Raid Registration Timeline Matrix):** The system manages signup boundaries, lock phases, and target operations based on a rigid weekly loop structure:
    * **Tuesday Raid Operation:** Registration opens Sunday evening at **10:15 PM** $ightarrow$ absolute hard lockdown locks on Monday evening at **10:15 PM (22:15) GMT+8**.
    * **Thursday Raid Operation:** Registration opens Tuesday evening at **10:15 PM** $ightarrow$ absolute hard lockdown locks on Wednesday evening at **10:15 PM (22:15) GMT+8**.
    * **Sunday Raid Operation:** Registration opens Thursday evening at **10:15 PM** $ightarrow$ absolute hard lockdown locks on Saturday evening at **10:15 PM (22:15) GMT+8**.
    * > ⚠️ **Developer Review Alert (`Task003`):** The weekly scheduling calendar array must be extracted from hardcoded files and migrated into configurable database parameter lists.
* **REQ044 (Automated 3-Phase State Processor):** The core configuration script must continuously evaluate the active system clock against schedule metrics to automatically drop the full-stack system layout into one of three unique operational states:
    * **Phase 1 (Bid Request Open):** Registration paths are fully accessible; members can open dashboards and modify scroll selection values.
    * **Phase 2 (Bid Request Locked):** The signup calendar deadline has passed; participant baskets are completely frozen and block further data updates.
    * **Phase 3 (Event + Live Auction):** Triggers on active raid nights (Tuesday, Thursday, Sunday) commencing precisely at **08:55 PM (20:55) GMT+8**, dropping client screens into the automated live auction presentation tracker panels.
    * > ⚠️ **Developer Review Alert (`Task003`):** Phase evaluation formulas must shift to dynamically read boundaries out of live Firebase setting nodes.
* **REQ045 (Dashboard Timetable Visual Banners):** The script must process calendar boundaries to produce explicit, cleanly formatted string readouts detailing the operational execution windows (e.g., `"Sun 22:15 ~ Mon 22:15 GMT+8"`). These text representations are transferred to frontend layout managers to construct informational banners.
    * > ⚠️ **Developer Review Alert (`Task003`):** String generation modules must support customizable calendar changes pulled from database nodes.

---

### 💾 Persistent Chat Services: `backend/src/services/chatService.js`
> 🛑 **Deprecation Directive (`Task002`):** This data pipeline service module is slated for complete structural code removal. All database archiving routes, console diagnostic triggers, and raw delivery hooks for live messaging are being stripped out.

* **REQ046 (Secure Database Chat Archiving):** When a validated chat transmission event occurs, the data layer service must capture the telemetry block and push it securely into the path tree located under `chat/messages` inside the Firebase Realtime database.
* **REQ047 (Server Console Save Confirmation):** Upon successfully committing a chat object record to the cloud database persistence nodes, the script must execute a millisecond-level callback function to print a diagnostic transaction confirmation directly to the server terminal.
    * > 📝 *Scope Check:* Confirmed as a development console tool; completely eliminated along with the core chat service parent framework.
* **REQ048 (Bot Channel Readiness Verification):** Before executing an outbound message dispatch routine, the utility must confirm that the parent Discord client instance is running on the gateway and assert that the target text channel index matches a valid, accessible text room configuration.
* **REQ049 (Raw Bot Text Delivery Wrapper):** The module must expose an internal execution interface allowing the system to pass unformatted, raw text strings directly to the target Discord channel feed through the bot account.

---

### 🪝 External Webhook Dispatcher: `backend/src/services/webhookService.js`
> 🛑 **Deprecation Directive (`Task002`):** This webhook dispatch manager module is slated for complete deletion. All programmatic webhook discoveries, automated endpoint generations, URL link caching structures, and transmission handlers are being decommissioned.

* **REQ050 (Programmatic Webhook Discovery & Generation):** When a user message routes to Discord from the web portal, the engine must query the destination channel's active endpoint map to search for an existing webhook registry matching the specific name `"DynastyGuild"`. If the search returns empty, the service must execute a request to automatically create a brand new webhook for that target channel on the fly.
* **REQ051 (Webhook Connection URL Link Caching):** Upon resolving or generating a valid webhook data block, the service must store the underlying access token and address string inside server runtime memory, eliminating redundant HTTP calls to Discord's configuration tables during subsequent transmissions.
* **REQ052 (Identity-Preserved Webhook Content Delivery):** The webhook transaction framework must format outgoing HTTP requests to pass the raw string message content alongside explicit overrides for the visual avatar image path and the player's resolved guild server nickname string, formatting the message box inside Discord to render like a native user profile post.
* **REQ053 (Transmission Acknowledgment Wait Verification):** The outbound webhook execution endpoint address must append a explicit query parameter flag tracking string set to `wait=true`. This forces the internal thread runner to wait until the external Discord server returns a verified response receipt and a unique message tracking ID before concluding the function execution context.

---

### ☁️ Cloud Infrastructure Manager: `backend/src/config/firebase.js`
This configuration file manages the establishment, initialization, and verification of administrative authorization pipelines connecting the server application code to your cloud project infrastructure.

* **REQ054 (Prevent Duplicate Connection Instances):** During the application boot cycle, the configuration script must evaluate the runtime environment's global memory footprint to check if an active Firebase application connection instance has already been initialized. If a valid instance is caught, the module must reuse the existing connection pool instead of attempting to create a duplicate connection.
* **REQ055 (Secure Certificate Authorization Engine):** The script must parse environment secrets (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`) to construct a secure identity object to gain administrative management privileges over your database infrastructure.
* **REQ056 (Cryptographic Key Character Repair Utility):** When pulling down the `FIREBASE_PRIVATE_KEY` string array from the host environment setup, the module must automatically scan the character stream to find any escaped text literal `
` character combinations, converting them back into authentic cryptographic newline break commands to prevent decryption failures.
* **REQ057 (Realtime Database Connection Pipeline Binding):** The service configuration constructor must explicitly hook the initialized application instance handler directly to your designated cloud database address location defined under the environment variable string key `FIREBASE_DATABASE_URL`, opening the pipe for real-time reads and writes.

---

### 🛡️ Runtime Guard Services: `backend/src/config/env.js`
This module acts as a strict programmatic gatekeeper during server startup, scanning the host machine's configuration profiles to guarantee all required variables are fully loaded before allowing code initialization.

* **REQ058 (Mandatory Environment Variable Whitelist):** The validation manager must maintain a rigid, unalterable master configuration schema containing the exact string keys required for safe environment operation: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `OAUTH_REDIRECT_URI`, `SESSION_SECRET`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, and `FIREBASE_DATABASE_URL`.
* **REQ059 (Fatal Crash-on-Missing Exception Enforcement):** During startup, the validation scanner parses the running environment variables. If even a single tracking key specified in the master schema is found to be missing, null, or blank, the server process must instantly trigger a fatal exit exception, printing a detailed diagnostic listing every missing key to standard error to prevent the app from running in an unstable state.

---

### 🔄 Legacy Synchronizer Routers: `backend/src/routes/syncRouter.js`
> 🛑 **Deprecation Directive (`Task004`):** This legacy routing component, along with all internal parsing pipelines, background spreadsheet connections, roster synchronization routines, and system time anchoring triggers, is completely retired and scheduled for deletion.

* **REQ060 (Legacy Spreadsheet Tab Parsing Pipelines):** The module orchestrates automated download requests targeting multiple sub-tabs within the legacy Google Spreadsheet data matrix (`Puppet`, `Illu`, `Light&Dark`, `Time&Space`), executing counting operations on resolved bids and empty slots to build visual summary stats.
* **REQ061 (Active Community Roster Synchronization):** The routine queries rows contained inside the `Participants` spreadsheet layout block to map out community profile listings alongside their matching sub-team assignment filters.
* **REQ062 (System Execution Date Anchor Discovery):** The script scans data rows inside the historical `LootHistory` sheet block to isolate the most chronologically recent date stamp, automatically clamping that date value as the active operational system anchor configuration across the web framework.
    * > 📝 *System Migration Check:* Feature completely covered—all time validation, active player lookups, and session tracking states move natively into real-time Firebase nodes, initialized cleanly via the interactive administrative `MimicBookTab` page layouts.

---

## 🎨 Part 2: Frontend Client Architecture

### 🎛️ Application Root Hub: `frontend/src/App.jsx`
This file acts as the primary layout coordinator and routing engine for the user interface, managing session restoral hooks, responsive frame views, and conditional page switches.

* **REQ063 (Automated Session Restoral Hook):** When the application mounts in the browser window, the framework must execute an initialization query targeting the backend profile status endpoints to check if an active, authenticated login cookie session is present on the machine. If a valid identity is confirmed, the system automatically logs the user in without requiring manual login interactions.
* **REQ064 (Identity Backup Caching System):** Upon a successful user authentication sequence, the login controller must serialize the player's primary metadata profile (display name handle, avatar asset route, and unique Discord identifier) and write a static backup string into the browser's persistent Local Storage space. This cache provides an alternate authorization fallback mechanism to sustain sessions on strict mobile or tablet browsers that reject standard cross-domain tracking cookies.
    * > 🧼 **5S Pass Standardization (`Task005`):** The system profile header initialization blocks must be modified right here to normalize authorization tracking keys across all downstream full-stack server communications.
* **REQ065 (Global Application Layout Frame):** The component renders the persistent visual interface framework across the platform. It secures the primary vertical navigation sidebar against the absolute left boundary of the viewport while dedicating the remaining fluid viewport window as a dynamic content canvas.
* **REQ066 (Active View Multi-Page Router):** The interface engine must continuously observe the state variables tracking sidebar item selection, instantly mounting or unmounting specific visual dashboards within the content window based on the clicked menu path (e.g., swapping between the **Request Tab**, **Mimic Book Panel**, or placeholder layouts).

---

### 🧭 Navigation Sidebar Module: `frontend/src/components/LeftNavBar.jsx`
This layout component manages application navigation links, active page status indicators, user profile cards, and authentication triggers.

* **REQ067 (User Profile Identity Card Layout):** When the system tracking state reports an authenticated session, the menu layout must render a profile panel at the top of the container, drawing the user's custom Discord avatar graphic circle right next to their resolved nickname string.
    * > 📝 *UI Verification Note:* Confirmed functional scope—this block natively renders individual avatar images and nicknames directly within the left nav layout container.
* **REQ068 (Authentication State Action Toggling):** The layout controller must dynamically swap the primary authentication action trigger interface based on active login metrics:
    * **Guest Account State:** Displays an explicit, high-visibility **"Login with Discord"** button link designed to launch the OAuth handshake portal.
    * **Authenticated Account State:** Displays an explicit **"Logout"** icon button designed to execute session erasure routines.
* **REQ069 (Navigation Interface Links Matrix):** The navigation sidebar layout container must provide clear, interactive entry points to swap between core platform systems:
    * **Request Items:** Launches active bidding registration dashboards.
    * **Mimic Book:** Launches the secure administrative allocation panel.
    * **Request History:** Present as a visual layout placeholder.
    * **Past Auction:** Present as a visual layout placeholder.
    * **Submit Evidence:** Present as a visual layout placeholder.
    * > 📝 *UI Cleaning Status:* Visual layout navigation links for the placeholder dashboards are structurally preserved to support future updates, but data logic hooks are disconnected from old spreadsheet endpoints.
    * > 🛑 **Deprecation Directive (`Task002`):** The legacy `LiveBidding` chat dashboard tab layout must be entirely unmounted and deleted from the left menu panel.
* **REQ070 (Active Navigation Tab Highlighting):** The layout engine must match current location state variables against target navigation link paths, automatically applying distinctive contrast background styles to the active nav link box so players clearly understand what section they are navigating.
    * > 📝 *Layout Mechanics Note:* Responsive layout toggle mechanisms and sidebar minimization controllers are managed via parent style templates inside the global theme wrapper.

---

### 🎮 Player Selection Dashboard: `frontend/src/pages/RequestTab.jsx`
This file implements the interactive signup dashboard layout, allowing users to configure inventory selections, confirm hardcoded safety boundaries, and observe real-time priority listings.

```
[ GUEST VIEW CHECK ] ──(No Session)──> [ BLOCKING ACCESS OVERLAY ]
         │
  (Valid Session)
         ▼
[ SCHEDULE STATUS BANNER ] ──────────> (Displays: Open / Locked / Live Auction)
         │
         ▼
[ ITEM SELECTION CARDS ] ───────────> [ Puppets ] [ Illusions ] [ L&D ] [ T&S ]
                                           ▲             ▲         ▲       ▲
                                           └─────────────┴──── Task003 ────┘
         │
         ▼
[ ACTION BUTTONS ] ──────────────────> [ Submit Selection ]  [ Cancel Selection ]
                                                │                    │
                                          (Time Lock Check)    (Always Unlocked)
```

* **REQ071 (Guest Access Overlay Shield):** If an unauthenticated user opens this dashboard route, the component layer must intercept rendering, lock down all underlying interactive forms, and draw a clean blocking information card notice instructing them to complete a Discord login via the left navigation panel.
* **REQ072 (Dynamic Schedule State Information Banners):** The component must poll current database calendar schedules to dynamically render contextual layout banners at the top of the interface, explicitly updating the view status readout between `Open`, `Locked`, or `Live Raid Auction` to match active real-world phases.
* **REQ073 (Interactive Quantity Adjustment Matrix):** The user interface must present a sequence of 4 distinct visual card components representing each available scroll type (`Puppet Scroll`, `Illusion Scroll`, `Light & Dark Scroll`, `Time & Space Scroll`), with each card embedding custom interactive increment `(+)` and decrement `(-)` button controls.
* **REQ074 (Interface Hardcoded Boundary Locking):** The interactive increment buttons must automatically freeze and grey out if an input action attempts to cross hardcoded transactional parameter limits or fall below `0`:
    * **Puppet Scroll / Illusion Scroll:** Upper Allocation Ceiling Block = **1**
    * **Light & Dark Scroll:** Upper Allocation Ceiling Block = **3**
    * **Time & Space Scroll:** Upper Allocation Ceiling Block = **5**
    * > ⚠️ **Developer Review Alert (`Task003`):** These allocation boundary limits must be de-coupled from hardcoded frontend code structures and redesigned to read dynamically from a centralized system parameter layout block.
* **REQ075 (Submission Action State Safeguard):** The dashboard interface must feature a primary **"Submit Request"** action button. If the system schedule tracking state reports that the registration calendar window has closed, the component must apply disabled HTML attributes, dimming out the interface to block data submissions.
* **REQ076 (Instant Cancellation Override Interface):** The dashboard layout must provide a persistent **"Cancel Requests"** option. This interactive element must remain completely unlocked across the entire calendar cycle—even during active schedule lock phases—allowing users to drop their registrations from active evaluation arrays immediately.
* **REQ077 (Real-Time Leaderboard Sub-Nav Switcher):** The layout page must build a clean horizontal tab bar tracking the 4 scroll classifications, allowing visitors to click between tabs to view current signup registrations.
* **REQ078 (Live Ranking Summary Data Grid):** For the selected item classification tab, the screen must display a structured layout data table displaying relative ranking placement index, resolved participant name handle, net quantity numbers, and current priority calculation score.
    * > ⚠️ **Developer Review Alert (`Task001`):** The grid data provider must switch from periodic api fetching over to an open, live Firebase reference subscription node, enabling instantaneous visual rank updates without browser layout jitter.

---

### 👑 Administrative Allocation Center: `frontend/src/pages/MimicBookTab.jsx`
This file implements the secure administrative interface layer used by guild officers to configure active drop tallies, examine candidate prioritization scores, and control phase shifts.

* **REQ079 (Sequential Multi-Step Officer Wizard Workflow):** The interface must enforce a strict multi-step execution layout wizard to guide administrative users chronologically through operation steps: `Step 1: Loot Input` $ightarrow$ `Step 2: Evaluation Matrix` $ightarrow$ `Step 3: Live Session Controls`.
* **REQ080 (Drop Quantity & Capacity Matrix Form Inputs):** Within the Step 1 view container, the interface must render editable form lines allowing officers to input exact scroll volume drops recorded during the raid (`Puppet`, `Illu`, `Light & Dark`, `Time & Space`), alongside fields defining baseline transaction parameters, session caps, and active player selection counts.
    * > ⚠️ **Developer Review Alert (`Task001` / `Task003`):** Introduce an explicit Date Selection Picker component inside the Step 1 layout wrapper that directly updates the parameter key at `auction/active_session/date` within the core database, allowing item settings to be predefined before raid initialization.
* **REQ081 (Active Registration List Aggregation):** The configuration dashboard must automatically query all active participant selections from the system, linking item demand numbers right beside historical priority scores to organize clean profiles for officer evaluation.
    * > ⚠️ **Developer Review Alert (`Task001`):** Hook the list compiler directly to live real-time Firebase structural nodes, eliminating data reload sequences.
* **REQ082 (Interactive Allocation Processing Table Matrix):** Within the Step 2 view container, the dashboard must generate a comprehensive master evaluation grid grouping records by scroll classification type. The table must list user priority rankings and support custom row-click actions to allow manual adjustments to individual item distributions.
* **REQ083 (Live Auction Phase Controller Toggles):** Within the Step 3 view container, the layout must draw high-visibility control buttons enabling officers to update live item phases across the full-stack system. Interacting with these triggers directly modifies the database, shifting specific item states among:
    * **`Now`:** Active item layer currently presenting on participant screens.
    * **`Next`:** Upcoming item preview banner.
    * **`Done`:** Concluded item, locked down and archived.
* **REQ084 (Evaluation Draft Storage Erasure Utility):** The interface must provide an explicit administrative reset button function that completely flushes temporary local workspace matrices and returns the step layout wizard back to initial settings.

---

### 📺 Live Interaction Viewports: `frontend/src/components/ChatConsole.jsx`
> 🛑 **Deprecation Directive (`Task002`):** This interactive chat panel layout, along with its internal state animations, automated scroll locks, source color formatters, and outbound dispatch actions, is designated for absolute removal from the application layout.

* **REQ085 (Real-Time Database Stream Subscriptions):** The component must open an active data pipe targeting the Firebase `chat/messages` database address tree path, monitoring for child addition events to dynamically render messages into the layout frame without page reloads.
* **REQ086 (Automated Scroll-to-Bottom Layout Anchor):** The viewport scroll element container must watch data length variables. When a message appends or the component initializes, the system must trigger an automated transition script to force the scroll boundary down to the absolute bottom margin line.
    * > ✅ *Resolved Bug Task:* Successfully implements the scrolling layout fix addressing logged issues: `"di nag aauto scroll yung live feed"`.
* **REQ087 (Visual Transmission Source Color Formatting):** Incoming message panels must execute conditional styling checks to apply distinctive color formats based on the message origin network channel:
    * `source: "app"` $ightarrow$ Applies clean, custom dashboard panel frame theme boundaries.
    * `source: "discord"` $ightarrow$ Applies a stylized border layout themed around Discord's branding palette.
* **REQ088 (Interactive Form Submission Dispatcher):** The container provides a text entry bar element and an interactive `"Send"` delivery icon button. Pressing the Enter key or clicking the icon launches network delivery scripts and handles cleaning the input field.
* **REQ089 (Unauthenticated Component Typing Lockdown):** If an unauthenticated user mounts the view, the text entry area must freeze via hardcoded disabled elements, and present an announcement block reading: `"Please login to participate in the chat."`

---

### 🧮 Data Transport Connectors: `frontend/src/services/chatService.js`
> 🛑 **Deprecation Directive (`Task002`):** This data transport module is slated for absolute code removal from the client architecture.

* **REQ090 (Outbound Message Payload Forwarding):** The module implements an external HTTP connection script designed to receive string text, format it into a network payload block, and execute an outbound asynchronous POST request targeting the backend chat API routes.
* **REQ091 (Mobile Client Identification Header Injection):** To sustain connection authentication on touch devices or tablet platforms where standard security cookies are stripped away, the service must parse Local Storage parameters to fetch cached user metrics, appending the authorization string as a customized identification tracking header key labeled `x-authorized-user`.
    * > 🧼 **5S Pass Standardization (`Task005`):** If preserved elsewhere, tracking headers must be normalized to match standard secure web token names.

---

### 📋 Registration Data Services: `frontend/src/services/requestService.js`
This file implements the primary network connection routines for the registration interface layers, routing item basket changes, processing cancellations, and gathering leaderboard metrics.

* **REQ092 (Initial Registration State Loader):** When the player dashboard mounts, this service manages network connections to gather existing item allocation volumes, target deadline schedules, and current leaderboard rank matrices.
    * > ⚠️ **Developer Review Alert (`Task001`):** Network transport wrappers must migrate away from classic Express API endpoints. Connection hooks must use direct live reference subscriptions to Firebase database nodes to enable instant layout rendering.
* **REQ093 (Outbound Basket Request Delivery):** When a user completes a scroll adjustment selection sequence and clicks the primary save trigger, this service receives the transaction object, compiles quantity numbers, and issues an authorized POST transaction to append the choices into the server processing queues.
    * > ⚠️ **Developer Review Alert (`Task001`):** Refactor the transport data layout to write selection structures directly into native real-time database paths.
* **REQ094 (Instant Cancellation Core Signal Delivery):** When a user initiates an immediate cancellation action, this utility wrapper must transmit an overriding system signal to the backend handlers to instantly clear out all matching pending items from active rows.
    * > ⚠️ **Developer Review Alert (`Task001`):** Transition the cancellation controller to execute a direct, low-latency value reset action against the participant's specific Firebase entry node.
* **REQ095 (Mobile Request Session Header Injection):** To insulate mobile device sessions against aggressive cross-site tracking filters that isolate standard cookies, the module must extract the player's saved user identifier out of local storage and append it as a custom identification tracking header key labeled `x-user-profile` on all outbound configuration transactions.
    * > 🧼 **5S Pass Standardization (`Task005`):** Modify this custom header parameter tracking key to match the exact, uniform token configuration format deployed across the wider platform architecture.

---

### 🗃️ Feature Placeholders: `RequestHistoryTab.jsx` / `PastAuctionTab.jsx` / `SubmitEvidenceTab.jsx`
These modules layout the foundational template frameworks for upcoming portal dashboards, maintaining sidebar alignment while tracking future features.

* **REQ096 / REQ098 / REQ100 (Static Core Text Information Indicators):** The view wrappers must render clean, basic layout blocks presenting explicit development indicator strings:
    * `RequestHistoryTab.jsx` $ightarrow$ `"History entries will appear here..."`
    * `PastAuctionTab.jsx` $ightarrow$ `"Past auction summaries will display here."`
    * `SubmitEvidenceTab.jsx` $ightarrow$ `"Evidence submission form will be placed here."`
    * > 📝 *Implementation Timeline:* These panels are structurally locked as empty frameworks for the current release. Following the deprecation of legacy spreadsheet code blocks, they can connect directly to dedicated historical arrays inside Firebase (e.g., `auction/history/[memberName]`).
* **REQ097 / REQ099 / REQ101 (Persistent Sidebar Navigation Mounting):** The component endpoints must remain properly registered and mounted inside the parent sidebar routing tree, allowing standard application visitors to navigate to the tabs without generating application breaks or view rendering exceptions.
    * > 📝 *Task Alignment Check:* All visual placeholders are confirmed safe and correctly aligned; if any feature segment touches the live bidding module layer, it will be cleaned up under the `Task002` feature pass.

---

## ⚙️ Part 3: Full-Stack Project Root Configurations

### ⚙️ Master Server Bootstrapper: `./index.js`
This file serves as the main entry point and engine for the backend runtime environment, initializing middleware stacks, configuring cross-origin traffic parameters, bootstrapping external bots, and opening server network listening ports.

* **REQ102 (Core Express Framework Server Initialization):** The root initialization script must instantiate a structural Express application instance to manage full-stack web traffic, routing pools, and data pipeline tasks.
* **REQ103 (Security & Parser Middleware Layer Stack):** Before exposing any operational routing chains to the network, the application instance must chain a sequence of core parsing and security filters:
    * **CORS Management Framework:** Sets explicit origin authorization mappings to restrict cross-site data operations, anchoring communication lines down exclusively to verified application deployment domains (such as production Vercel targets).
    * **JSON Data Processing Parsers:** Binds automated processing filters to scan incoming raw text bodies and format them into accessible JavaScript objects.
    * **Cookie & Session Tracking Wrappers:** Loads cookie verification keys to decrypt incoming session cookies, mapping browser traffic back to authorized user Discord validation accounts.
* **REQ104 (Modular Route Binding Matrix):** The server instance must securely anchor specific sub-system routing controllers to clear path sub-domains:
    * Connects `discordOAuth.js` identity pathways cleanly under path `/auth/discord`.
    * Connects `request.routes.js` transactional endpoints under path `/api/requests`.
    * Connects `chat.routes.js` communication streams under path `/api/chat`.
    * > 🧼 **Spreadsheet Pipeline Decoupling Completed:** The legacy `/api/sync` routing route has been cleanly cut and unmounted from this core file, ensuring the server environment handles operations purely on automated database lines.
    * > 🛑 **Deprecation Directive (`Task002`):** The chat routing entry point mapping under `/api/chat` is scheduled for removal from this binding matrix during the next iteration cleanup pass.
* **REQ105 (Discord Bot Client Bootstrap Trigger):** Immediately prior to activating network listening ports, the server entry script must call the core Discord bot initialization wrappers to execute its gateway protocol handshake, forcing the Discord bot to log on simultaneously with the parent application web server.
* **REQ106 (Overarching Global Error Catch-All Filter):** The router configuration must insert a final, global error interception middleware route layer at the absolute base of the middleware stack. This layer must catch unhandled runtime execution exceptions, prevent node process crash sequences, log the stack trace to secure developer dashboards, and safely return a standardized error response down to the client.
* **REQ107 (Server Listener Port Activation):** The initialization script must bind the fully configured Express server application to the designated server environment network port (defaulting to port `5000` if no environment variable is passed) and print an official validation readout string to the server terminal verifying that the backend engine is fully active on the network.

---

### 🎨 Client Compilation Anchor: `frontend/src/main.jsx`
This file acts as the primary bootstrap coordinator for the frontend web interface, attaching the virtual React engine straight to document layouts.

* **REQ108 (React DOM Root Element Document Binding):** The compilation script must scan the base index HTML document file, isolate the absolute layout division tag defined with the exact element identifier `root`, and mount the full-stack React application framework directly to that node structure to display the website interface.
* **REQ109 (Strict Mode Application Stability Guard):** The render execution pipeline must wrap the parent layout components inside React's native `<StrictMode>` tag component wrapper. This mandates extra execution assertions and double-renders component lifecycles during local development setups to isolate memory leaks or formatting errors before code ships.
* **REQ110 (Global Structural Design Rule Compilation):** The module must explicitly import the primary design rules and core stylesheet styles (`index.css`) at the absolute top of the initialization script, ensuring that layout design colors, space vectors, and dark-theme blocks parse before the browser displays visual elements.
    * > 📝 *System Migration Status Check:* Confirmed clean—this entry point stays entirely isolated from database structural updates and will require zero modifications when the Google Sheets sync code is dropped.

---

### 🛠️ Build Asset Bundle Controller: `./vite.config.js`
This configuration script sets up the baseline packaging instructions, compiler definitions, asset builders, and dev proxy channels used to compile code for production or test environments.

* **REQ111 (React Fast-Refresh Plugin Integration):** The asset compilation constructor must inject the official React engine compiler plugin into its processing flow, enabling hot-reloading asset injections so visual user interface tweaks render inside the browser immediately without wiping out active layout state values.
* **REQ112 (Development Environment Network Proxy Routing):** While operating within a local execution space, the developer server wrapper must maintain automated proxy translation instructions. Any frontend data query aimed at paths `/api` or `/auth` must route to local address port `5000` behind the scenes, allowing developers to code without triggering browser CORS blocks.

---

### 📦 Project Manifest Blueprint: `./package.json`
This central project configuration manifest outlines metadata profiles, automated execution task commands, asset compilation workflows, and explicit version boundaries for all third-party libraries required across both the frontend web layouts and the backend server engines.

* **REQ113 (Monorepo Script Framework Tasks Expose):** The dependency manifest must expose standardized terminal execution scripts to manage full-stack operations, including shortcuts to launch local backend servers, activate the client Vite pipeline, or compile production-ready distribution folders.
* **REQ114 (Backend Engine Dependency Specifications):** The manifest document must strictly lock in version thresholds for the server layer's required third-party drivers:
    * **`express` & `cors`:** Manages underlying full-stack web communications and origin rules.
    * **`firebase-admin`:** Authenticates administrative manager read/write paths into database paths.
    * **`discord.js`:** Powers bot client connectivity sockets and channel event observers.
    * **`cookie-session`:** Encrypts user tracking keys inside client browser cookies.
    * > 🧼 **Dependency Matrix Decoupling Passed (`Task004`):** The legacy `googleapis` data library is completely scheduled for uninstallation from this configuration file, reducing production package weight and removing all references to old spreadsheet platforms.
* **REQ115 (Frontend Component Architecture Locking):** The dependency definitions must explicitly lock down version levels for the visual workspace elements, anchoring **`react`**, **`react-dom`**, and matching compilation engines to fully compatible version paths to guarantee dashboard layouts render smoothly across all mobile, tablet, and desktop devices.

---

## 📊 Requirements Inventory Validation Checklist

```
[ BACKEND CORES ]  ◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼ (REQ001 - REQ062)
[ FRONTEND UI   ]  ◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼ (REQ063 - REQ101)
[ ROOT ARTIFACTS]  ◼◼◼◼◼◼◼◼◼◼◼◼◼ (REQ102 - REQ115)
```

This checklist acts as your absolute master verification record, confirming that exactly **115 system requirements** across **26 files** have been programmatically parsed, organized, and categorized for development deployment tracking.