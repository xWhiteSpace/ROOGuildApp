# ROO StrictDoc export — HOW TO OPEN

**Open [`DELIVERABLES.md`](DELIVERABLES.md) first.** That file is the single human entry: deliverables table, poison warning, phase status, honesty board, and links into every `.sdoc`.

## Quick paths

| Need | Open |
| --- | --- |
| Deliverables index | [`DELIVERABLES.md`](DELIVERABLES.md) |
| V-model overview / gaps | [`deep_learn.sdoc`](deep_learn.sdoc) |
| User requirements | [`requirements/usr.sdoc`](requirements/usr.sdoc) |
| System requirements (Parent→USR) | [`requirements/req.sdoc`](requirements/req.sdoc) |
| Design tip summary | [`design/summary.sdoc`](design/summary.sdoc) |
| Test plans + honesty | [`verification/tests.sdoc`](verification/tests.sdoc) |
| Tools present vs greenfield | [`tools/tol.sdoc`](tools/tol.sdoc) |

## Install location (Staging)

Copy this entire directory to `xWhiteSpace/ROOGuildApp` at:

```text
docs/strictdoc/
```

## Optional HTML render

```bash
strictdoc export . --config strictdoc.toml --output-dir output
```

## Non-negotiables

- SoT: `Develop@a8a1edd713d6db6db61d42ed4eacf6a9e8737d07`
- **`Requirements/Requirements.md` is NOT SoT** (Firebase poison SRS)
- published ≠ proven; **zero EVD** at export
- Do not invent requirements; SSOT JSON only

Generated: 2026-09-26T23:12:34+09:00 (JST)
