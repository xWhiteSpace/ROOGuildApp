# ROO StrictDoc Deliverables — OPEN THIS FIRST

| Field | Value |
| --- | --- |
| **Project** | `ROO` |
| **Gym / repo** | `xWhiteSpace/ROOGuildApp` (live product **VALHALLA**) |
| **Production SoT** | `Develop@a8a1edd713d6db6db61d42ed4eacf6a9e8737d07` |
| **Export generated** | 2026-09-26T23:12:34+09:00 (JST) |
| **Copy onto Staging at** | `docs/strictdoc/` |
| **SSOT source** | [`trace/ssot.json`](trace/ssot.json) (in-repo published census) |

---

## In-repo SSOT

[`trace/ssot.json`](trace/ssot.json) is the gym published node/edge census. DebugPage V, World, and `npm run debug:graph` read this file.

- `.sdoc` files are narrative and test plans, not the published census.
- `Requirements/Requirements.md` is not SoT.
- Published ≠ proven; no EVD.

If the JSON is missing, `npm run debug:graph` extracts it from [`trace/neighborhood.html`](trace/neighborhood.html).

---

## SSOT sync 2026-10-10 (JST) — graph 91

Regenerated from the published SSOT store (graph 91; tests index 26, units 26, structure 26, interfaces 30, requirements 16; source `xWhiteSpace/ROOGuildApp@f38e137`). The tables further down are the original 2026-09-26 export and are kept as history; they are not current.

| Project | Published nodes in SSOT |
| --- | --- |
| VAL (Valhalla platform) | USR 27 / REQ 106 / FNC 74 / API 31 / CMP 13 / INT 31 / UNT 81 / TST 124 |
| ROO (Ragnarok Origin) | USR 17 / REQ 105 / FNC 138 / API 87 / CMP 16 / INT 90 / UNT 142 / TST 134 |
| Combined gym census | USR 44 / REQ 211 / FNC 212 / API 118 / CMP 29 / INT 121 / UNT 223 / TST 258 |
| RO3 (Ragnarok 3) | USR 9 / REQ 22 / FNC 24 / API 51 / CMP 11 / INT 40 / UNT 41 / TST 46 |

| Path | What it is |
| --- | --- |
| [`requirements/usr.sdoc`](requirements/usr.sdoc) / [`requirements/req.sdoc`](requirements/req.sdoc) | VAL platform + ROO Origin USR / REQ (REQ → Parent USR) |
| [`verification/tests.sdoc`](verification/tests.sdoc) | VAL + ROO TST plans (258 published; 248 and 250 not minted in SSOT) |
| [`design/summary.sdoc`](design/summary.sdoc) | ROO left-side counts and next free ids |
| [`requirements/ro3_usr.sdoc`](requirements/ro3_usr.sdoc) / [`requirements/ro3_req.sdoc`](requirements/ro3_req.sdoc) | RO3 USR / REQ |
| [`verification/ro3_tests.sdoc`](verification/ro3_tests.sdoc) | RO3 TST plans (TST-RO3-001 .. TST-RO3-046) |
| [`design/ro3_summary.sdoc`](design/ro3_summary.sdoc) | RO3 left-side counts and next free ids |
| [`trace/ssot.json`](trace/ssot.json) | VAL + ROO published census (nodes + edges) |
| [`trace/neighborhood.html`](trace/neighborhood.html) | VAL + ROO standing map (V landing, focus, World) |
| [`trace/RO3/neighborhood.html`](trace/RO3/neighborhood.html) | RO3 standing map |
| [`trace/interfaces.sqlite`](trace/interfaces.sqlite) | Interface variables, ROO + RO3 rows with a `project` column |

ROO and RO3 are strictly isolated: no relation in one project points at the other. Counterpart ids appear only as plain text.
Every TST is a plan: execution_status `blocked_on_tooling`, evidence_status `none`. Nothing is marked passed; there is no EVD.
`design/onboarding.sdoc` and `design/gvg-readiness.sdoc` are Staging-authored and were not regenerated.
The `REQ-R3-*` / `TST-R3-*` sections in the ROO documents are Staging-authored legacy text and were left as they are.

Plan lineage, not proof.

---

## How to open

1. **Humans:** start here (`DELIVERABLES.md`), then follow links below.
2. **StrictDoc CLI** (optional HTML):

```bash
cd docs/strictdoc   # after copy into ROOGuildApp
strictdoc export . --config strictdoc.toml --output-dir output
# open output/html/index.html
```

3. **Primary narrative document:** [`deep_learn.sdoc`](deep_learn.sdoc) — V-model learnings, phase status, gaps.
4. **Traceable requirements:** [`requirements/usr.sdoc`](requirements/usr.sdoc) + [`requirements/req.sdoc`](requirements/req.sdoc) (REQ → Parent USR).

---

## Poison warning (do not forget)

**`Requirements/Requirements.md` is NOT SoT.**  
It is a historical Firebase RTDB SRS. Policy quarantine (`poison-srs-firebase-requirements-md`) refuses it as requirements registry content. Live Develop behavior + published SSOT nodes are the only requirements truth for this gym.

---

## Deliverable index

| # | Path | What it is | Counts / notes |
| --- | --- | --- | --- |
| 0 | [`README.md`](README.md) | HOW TO OPEN (short) | points here |
| 1 | **`DELIVERABLES.md`** (this file) | Single openable deliverables index | **start here** |
| 2 | [`deep_learn.sdoc`](deep_learn.sdoc) | Overview: V-model, phases, honesty, gaps | P1–P4 narrative |
| 3 | [`requirements/usr.sdoc`](requirements/usr.sdoc) | All published USR | **42** (numeric `001`..`042`; VAL or ROO by domain) |
| 4 | [`requirements/req.sdoc`](requirements/req.sdoc) | All published REQ + Parent→USR | **172** (numeric `001`..`172`; VAL or ROO by domain) |
| 5 | [`design/summary.sdoc`](design/summary.sdoc) | Lean left-side summary by domain | FNC 173 / API 114 / CMP 28 / INT 114 / UNT 183 |
| 6 | [`verification/tests.sdoc`](verification/tests.sdoc) | Published TST plans + honesty | **65** (numeric `001`..`065`; VAL or ROO by domain); tip `TST-ROO-066` |
| 7 | [`tools/tol.sdoc`](tools/tol.sdoc) | Tool catalog present vs greenfield | **11** (`TOL-ROO-001`..`011`); tip `TOL-ROO-012` |
| 8 | [`strictdoc.toml`](strictdoc.toml) | Minimal StrictDoc project config | include `*.sdoc` |
| 9 | [`MANIFEST.json`](MANIFEST.json) | Machine-readable file list + counts | generated_at ISO |
| 10 | [`trace/ssot.json`](trace/ssot.json) | In-repo published census | DebugPage + `npm run debug:graph` |
| 11 | [`trace/neighborhood.html`](trace/neighborhood.html) | 3D neighborhood knowledge graph | open in browser |
| 12 | [`trace/interfaces.sqlite`](trace/interfaces.sqlite) | Interface traceability database | open in DB Browser for SQLite |

---

## Phase checklist (honest)

| Phase | Status | Evidence in this package |
| --- | --- | --- |
| **P1** Requirements | **DONE** | USR 001–042, REQ 001–172 |
| **P2** Left-side design | **DONE** | Tips ≈ FNC-174, API-115, CMP-029, INT-115, UNT-184 (see design/summary) |
| **P3** Verification plans | **PAUSED** after Games `TST-065` | Auth+Tenant+Games plans only; tip `TST-066` |
| **P4** StrictDoc export | **THIS PACKAGE** | copy to Staging `docs/strictdoc/` |

---

## Honesty board (read before claiming “done”)

| Claim | Truth at export |
| --- | --- |
| USR/REQ published | Yes — P1 complete |
| Left-side FNC/API/CMP/INT/UNT published | Yes — P2 complete |
| TST published | Yes — 65 plans (`001`..`065`) |
| TST executed / green | **NO** — `execution_status=blocked_on_tooling` |
| EVD / evidences edges | **ZERO** |
| “Auth/Tenant/Games verified” | **REFUSED** — plans ≠ proof |

### Open must gaps

**Auth:** `REQ-VAL-008`, `REQ-VAL-015`, `REQ-VAL-017`  
**Tenant live Discord:** `REQ-VAL-026`, `REQ-VAL-029`, `REQ-VAL-030`

Greenfield TOL blocking execution: `TOL-ROO-006` Vitest, `TOL-ROO-007` MSW, `TOL-ROO-008` Playwright, `TOL-ROO-011` @vitest/coverage-v8 (catalogued; not pinned for runs).

---

## Domain map (requirements)

| Domain | USR | REQ |
| --- | ---: | ---: |
| Platform/Auth | 5 | 20 |
| Tenant/Workspace | 5 | 18 |
| Games catalog | 2 | 10 |
| Billing/Capacity | 4 | 13 |
| Discord bot/Channels | 4 | 16 |
| Auction/Requests | 4 | 23 |
| Attendance/Roster | 3 | 13 |
| Scheduler/RSVP | 2 | 9 |
| Raid compose/Party | 2 | 10 |
| Live Raid/Voice | 3 | 14 |
| OCR/GVG Attendance | 1 | 5 |
| Adventurer Guild | 2 | 6 |
| Data isolation/Storage | 3 | 9 |
| Frontend shell/UX | 2 | 6 |

---

## Tips (next free IDs)

| KIND | Tip |
| --- | --- |
| FNC | `FNC-ROO-174` |
| API | `API-ROO-115` |
| CMP | `CMP-ROO-029` |
| INT | `INT-ROO-115` |
| UNT | `UNT-ROO-184` |
| TOL | `TOL-ROO-012` |
| TST | `TST-ROO-066` |

---

## What was intentionally NOT inlined

- Full FNC/API/CMP/INT/UNT node bodies (size control) — see domain ranges in `design/summary.sdoc`; JSON remains in SSOT.
- Any invented requirements — export is SSOT JSON only.
- GitHub push — package stays under `/workspace/roo-gym/strictdoc-export/` until humans copy to Staging.

---

*Generated for WhiteSpace ROO gym · StrictDoc classic text format · 2026-09-26T23:12:34+09:00 JST*
