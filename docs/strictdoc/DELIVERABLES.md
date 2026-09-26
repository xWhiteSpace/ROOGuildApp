# ROO StrictDoc Deliverables — OPEN THIS FIRST

| Field | Value |
| --- | --- |
| **Project** | `ROO` |
| **Gym / repo** | `xWhiteSpace/ROOGuildApp` (live product **VALHALLA**) |
| **Production SoT** | `Develop@a8a1edd713d6db6db61d42ed4eacf6a9e8737d07` |
| **Export generated** | 2026-09-26T23:12:34+09:00 (JST) |
| **Copy onto Staging at** | `docs/strictdoc/` |
| **SSOT source** | published registries under `/workspace/ssot` (read-only at export) |

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
| 3 | [`requirements/usr.sdoc`](requirements/usr.sdoc) | All published USR | **42** (`USR-ROO-001`..`042`) |
| 4 | [`requirements/req.sdoc`](requirements/req.sdoc) | All published REQ + Parent→USR | **172** (`REQ-ROO-001`..`172`) |
| 5 | [`design/summary.sdoc`](design/summary.sdoc) | Lean left-side summary by domain | FNC 173 / API 114 / CMP 28 / INT 114 / UNT 183 |
| 6 | [`verification/tests.sdoc`](verification/tests.sdoc) | Published TST plans + honesty | **65** (`TST-ROO-001`..`065`); tip `TST-ROO-066` |
| 7 | [`tools/tol.sdoc`](tools/tol.sdoc) | Tool catalog present vs greenfield | **11** (`TOL-ROO-001`..`011`); tip `TOL-ROO-012` |
| 8 | [`strictdoc.toml`](strictdoc.toml) | Minimal StrictDoc project config | include `*.sdoc` |
| 9 | [`MANIFEST.json`](MANIFEST.json) | Machine-readable file list + counts | generated_at ISO |

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

**Auth:** `REQ-ROO-008`, `REQ-ROO-015`, `REQ-ROO-017`  
**Tenant live Discord:** `REQ-ROO-026`, `REQ-ROO-029`, `REQ-ROO-030`

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
