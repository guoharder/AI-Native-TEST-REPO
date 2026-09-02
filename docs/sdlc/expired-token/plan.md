# Plan: Enforce token expiry in create_session (auth-expired-token-001)

## Inputs
- intent.md auth-expired-token-001 (Accepted) — problem, desired outcome, constraints, non-goals, open questions.
- spec.md — SYS-AUTH-001…006, AC-1…AC-6, Decision & sign-off (OQ1–OQ4 resolved).
- Repository context provided in the defect intake: `src/auth.py` (source), `tests/test_auth.py` (existing suite), AGENTS.md (make targets, Python3-stdlib-only, no external deps, no signature changes, no external-suite regression).

Current code (from intake):
# src/auth.py
SESSION_TTL = 3600
def create_session(token, now=None):
    now = now if now is not None else time.time()
    return {"user": token["sub"], "authenticated": True}
def token_is_valid(token, now=None):
    now = now if now is not None else time.time()
    return token.get("exp", 0) > now

## Change map

| # | File | Change | Rationale / requirement |
|---|---|---|---|
| C1 | `src/auth.py` | `create_session()`: at entry, resolve `now` (default `time.time()`), then call the shared expiry predicate (`token_is_valid(token, now)`); if the token is not valid, raise `ValueError` with a clear message (e.g. "expired or invalid token: exp must be after now"). Valid token proceeds unchanged → return `{"user": token["sub"], "authenticated": True}`. | SYS-AUTH-001/002/004/005; shared predicate per SYS-AUTH-003/OQ4 (single expiry-rule source, AC-5). No signature change (SYS-AUTH-006). |
| C2 | `tests/test_auth_expired.py` (new) | New test module, unittest style, imported from `src.auth`. Add regression tests mirroring spec: (a) expired token with explicit `now` (> `exp`) raises `ValueError` and never yields `"authenticated": True`; (b) malformed token missing `exp` is rejected (per shared default-0 semantic) with an explicit, asserted outcome; (c) boundary `exp == now` rejected (OQ3 no-grace). Keep `token_is_valid()` truth fork present for parity where relevant. | AC-1 / AC-2; locks the defect closed (fix-first test). Covers intent.d one regression: `exp = 900, now = 1000`. |
| C3 | (unchanged) `tests/test_auth.py` | Left untouched — must keep passing (valid-token path). | AC-3; no public signature/suite regression. |
| C4 | (none) | No new dependency files, no config/migration, no Makefile change. | Constraints (stdlib-only); Non-goals respected. |

Build targets checked unchanged: `make test` (discover -s tests → OK), `make lint` (py_compile → exit 0).

## Execution sequence
1. (Evidence-first) Add `tests/test_auth_expired.py` regression cases (C2) hitting the current code — confirm they fail against the unfixed `src/auth.py` (proves the defect is real and the test guards it).
2. Patch `src/auth.py::create_session()` to route through the shared expiry predicate and raise `ValueError` on invalid/expired token (C1).
3. Run `make test` — expect `OK` (new tests green, existing valid-path tests green).
4. Run `make lint` — expect exit 0.
5. Code-review self-pass against AC-5/AC-6: confirm exactly one expiry-rule source, no external deps, no signature drift, no duplicated date math.
6. Commit authored change (fix + new test, atomic). Open PR/merge request for human sign-off (see Human gates).

## Verification plan
- V1: `make lint` exits 0 (py_compile clean).
- V2: `make test` prints `OK` — full unittest discovery over `tests/`.
- V3: New regression module passes; assert the three guards (expired / missing-exp / boundary `exp == now`) each yield no authenticated session.
- V4: Negative control documented: run the new test against the ORIGINAL `src/auth.py` before the fix and capture its red (failing) result as evidence the case binds the defect.
- V5: Manual trace on the intent.d reproduction (`{"sub": "alice", "exp": 900}`, `now=1000`) → `ValueError`, never `"authenticated": True`.
- V6: Review pass confirms single expiry source (AC-5) and no public-signature/dep change (AC-6).

## Risks & blast radius
- RB1: Existing callers that (incorrectly) relied on expired tokens succeeding will now hit `ValueError`. Mitigated by spec AC-4 plus review surcing all `create_session()` call sites pre-merge. Blast radius: only the auth/session path on the checkout demo; no data/schema touch.
- RB2: Boundary `exp == now` previously "succeeded" (implicit), now rejected — intended tightening per OQ3, no grace. Acceptable for the demo service; document nothing beyond the no-grace note.
- RB3: Two expiry rules drifting (`token_is_valid()` vs new guard) if inlined separately — prevented by routing C1 through the shared predicate and covered by AC-5.
- Blast radius summary: single function + one new test file; DAG has no migration. Rollback = revert the commit; suite returns to pre-change state exactly.

## Alternatives rejected
- AR1: Return `{"authenticated": False}` instead of raising — rejected: muddies the boolean with the valid-path truth value, hides "invalid credential" vs "legit-but-timed-out" distinction (spec A1).
- AR2: Soft-fail / log-only, still returning an authenticated session — rejected: violates intent's hard requirement (spec A2).
- AR3: Inline a fresh expiry check inside `create_session()` and leave `token_is_valid()` orphaned — rejected: creates a second, independent expiry source, violates SYS-AUTH-003/OQ4 and AC-5 (spec A3).
- AR4: Introduce a clock-tolerance/skew grace window in the check — rejected: no grace per intent OQ3; the demo path has no distributed-clock argument forcing skew tolerance (spec on OQ3).

## Human gates
- HG1 — Merge to `main` requires named human authorization. No AI-authored commit merges into `main` autonomously; approval must be recorded (reviewer name + date) before/at merge.
- HG2 — Any deviation from this plan's scope (signatures, dependency footprint, suite layout) requires human sign-off before proceeding; do not silently expand the diff.
- Gates: (1) named human reviewer approval of the PR; (2) named human authorizes the merge to `main`. Recorded: reviewer = ____________, date = ___________; merge authorizer = ____________, date = ___________.

## Plan deviations
- Deviation 0 (recorded at planning time): the execution sandbox image (`qm-sandbox-local:latest`) is not yet built, so no `execute`-based build/test can run in this authoring session; plan.md (like intent.md and spec.md) is produced as pure content from the provided repo context. Execution sequence V1–V4 must therefore be re-run in an environment where `make test`/`make lint` can actually execute before any completion/merge claim is made.
- Any later change to scope, files, or the verification steps above must be logged here with who/why/when before the merge gate HG1 is lifted.

That's the completed **plan.md** — all required sections present (Inputs, Change map table covering the src/auth.py fix and the new tests/test_auth_expired.py regression tests, Execution sequence, Verification plan, Risks & blast radius, Alternatives rejected, Human gates noting merge-to-main needs named human authorization, Plan deviations). Persist into the repo as `plan.md`.
