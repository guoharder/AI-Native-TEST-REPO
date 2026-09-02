# REVIEW.md — auth-expired-token-001

## Review scope
Independent review of the fix diff touching `src/auth.py` and the new `tests/test_auth_expired.py`. Reviewer role: findings and recommendations only — no self-approval; merge requires a named human. Reviewer: QM (AI review agent), date: (record against merge record).

---

## Pass 1 — 意图与规格 (Intent & Spec)

**Finding R1-1 (Important): Spec/code drift — rejection model was decided as `ValueError`, implementation returns `None`.**
- spec.md Decision (OQ1, spec SYS-AUTH-001/002, AC-1) resolved: expired token → raise `ValueError` with a clear message. AC-1 asserted "抛出 `ValueError`,且无法取得会话".
- The submitted diff instead returns `None` (contract changed to a non-raising, null-session model, per the later-authored reproduction test asserting `assertIsNone`).
- Impact: two contract documents (spec AC-1 vs the implementation + new test) are now contradictory, and the earlier `ValueError` handling in downstream expectations (if any were written against spec) will not be exercised.
- Recommendation: this is not wrong on its own — but it must be reconciled before merge. Either (a) amend spec decision record to `returns None` model and update AC-1/AC-2 wording (returns-None held by spec; note OQ1 earlier chose exception), or (b) change implementation + test to raise per original spec. A reviewer cannot select one unilaterally; requires the named human decision per plan Human gates.
- Evidence anchor: spec "Decision & sign-off" OQ1 row; reproduction test comment "fix-first test: assert the returns-None contract this fix is driven to enforce" reveals the contract was unilaterally switched from the spec'd exception.

**Finding R1-2 (Nit): `None`-return rejection silently looks like "no session" but removes TypeError protection.** With `return None`, any caller that treats the result as a success gateway using truthiness gets correct behavior (`None` is falsy), but a caller indexing `session["user"]` without an explicit guard now gets `TypeError: 'NoneType' object is not subscriptable` rather than the spec'd clear `ValueError` message. Consistent with R1-1; resolves with it.

**Finding R1-3 (Nit): Docstring says "Fixed security defect (auth-expired-token-001)" with no date/review marker** — acceptable for demo, but the SDLC convention (completion claims after evidence) prefers the fix note cite the CI evidence (OK / lint exit 0), not just the design.

**Pass 1 verdict: Two sign-off decisions are silently contradicted (spec vs diff). Must go to the named human; not mergeable as-is on spec compliance.**

---

## Pass 2 — 正确性与回归 (Correctness & Regression)

- **Boundary logic:** `token_is_valid` returns `token.get("exp", 0) > now`. For `exp == now` (boundary), returns `0 > now`?? No — literal exp==now: `exp > now` is False → invalid → `create_session` returns None. Matches intent OQ3 "reject when `exp <= now`". Correct. The diff comment states "(exp <= now)" — consistent.
- **Missing `now`:** default `time.time()` handled identically in both functions before reuse. Correct per spec OQ2 default semantics.
- **Malformed token (missing `exp`):** `token_is_valid` → `token.get("exp", 0) > now` → if `now >= 0`, `0 > now` is False → invalid. Since `now` is time.time() or injected, `now > 0` always in practice → malformed tokens are rejected via None, matching spec SYS-AUTH-004 intent of no malformed token creating an authenticated session. Good.
- **Success path regression:** valid token (`exp > now`) → predicate True → returns `{"user": ..., "authenticated": True}` — structure unchanged. Existing tests in `tests/test_auth.py` (valid path) untouched and expected to stay green.
- **Test quality — `tests/test_auth_expired.py`:** asserts the returns-None case with explicit `now`. Standalone (`unittest.main()`) and discoverable by `make test`. It is a genuine regression binding: run against the original `src/auth.py` it would fail (session non-None), so it guards the defect. **Finding R2-1 (Important): the suite now contains two contract expectations that contradict each other** — the spec AC-1 (`ValueError`) is not in any test, and this new test locks `None`. A future "make spec AC-1 true" fix would break this test, or vice versa. Must match after R1-1 resolution.
- **Finding R2-2 (Nit): only the expired path is covered** — no malformed/missing-`exp` case and no explicit `exp == now` boundary case, though spec AC-2 wanted the malformed case covered and (plan V3) the boundary tested. plan.md V3 names "expired / missing-exp / boundary" three guards; only one is present.
- **Finding R2-3 (Nit): no negative-control evidence committed** (plan V4: capture red run of new test on old code). Should be recorded in the PR/proof rather than required in-tree, but noted since plan called for it as evidence-before-completion.

**Pass 2 verdict: logic itself is correct and non-regressive; test coverage is thinner than plan V3 and the two-contract contradiction surfaces here too.**

---

## Pass 3 — 安全与合规 (Security & Compliance)

- **Security fix effectiveness:** expired tokens now yield no authenticated session — the CWE-style gap (replay of past-dated token granting a live session) is closed with the shared predicate. Good.
- **Single source of truth:** `create_session` now calls `token_is_valid` — no second expiry calculation duplicated (spec SYS-AUTH-003 / AC-5). Compliant.
- **No exception-path info leakage:** under the returns-None model no exception message exists to leak; under the earlier ValueError design the message was to be generic (no internal detail). Either way no sensitive disclosure path added.
- **Missing `exp` handling** = reject (invalid) rather than silently succeed → correct posture for auth.
- **Privacy:** no new data collected/logged. **Dependencies:** no new imports beyond `time`/`unittest` — stdlib-only maintained. **Compliance:** no new footprint; still-not-a-full-token-validator (no signature check) is documented as Non-goal and not claimed otherwise. Compliant.
- **Finding R3-1 (Nit):** docstring states the fix without noting it is expiry-only (not signature validation) — fine internally, but operator trust could over-read "security defect fixed" as "token fully validated." Suggest one clarifying phrase.
- **Finding R3-2 (Nit):** no explicit notification/registry that callers of `create_session` transitioning from implicit-success to None must null-check — covered in R1-2.

**Pass 3 verdict: the security gap is genuinely closed; no new compliance issue. The unresolved spec/exception-vs-None question is the only blocking security-adjacent item (behavioral contract), not a code-level vuln.**

---

## Pass 4 — 架构与可运维 (Architecture & Operability)

- **Module cohesion:** the fix keeps auth logic in `src/auth.py`, predicate shared, single responsibility retained. The new test file is correctly co-located under `tests/` and discoverable by the single `make test` command per AGENTS.md. Good.
- **No signature changes, no new deps, no migration/schema/config** — matches Constraints. Rollback = revert commit (nothing durable). Operability clean.
- **Observability:** returns-None model is silent on *why* (expired vs malformed) — genuine observability gap: operators can't see at the log whether it's replay (expired valid-format token) vs malformed input. A `ValueError`-with-reason (spec'd earlier) or a counted/raised reason would make this distinguishable. **Finding R4-1 (Important):** recommends the human pick the ValueError-with-reason model precisely for this reason (also reconciles R1-1), OR accept None and add a dedicated invalid-token reason path if traceability matters. Demo-service-appropriate either way; flag since plan mentioned observability of rejection events.
- **Maintainability:** comment update is honest and marks the dropped BUG label; one rule-source preserved. Healthy.

**Pass 4 verdict: architecturally sound and easily reversible; the returns-None silence on reason is the operability concern that also argues for reconciling the exception question via the human.**

---

## Consolidated findings

| # | Pass | Sev | Finding |
|---|---|---|---|
| R1-1 | P1 | Important | spec decided `ValueError`; diff + new test return `None`. Two contract sources now contradict — binding, needs named-human resolution before merge. |
| R1-2 | P1 | Nit | `None` return can crash naive `session["user"]` callers with bare `TypeError`, losing the spec'd clear reason. |
| R1-3 | P1 | Nit | Fix docstring cites no CI/evidence marker (completion-after-evidence convention). |
| R2-1 | P2 | Important | Test-side: suite now locks the `None` contract vs spec AC-1's `ValueError` — must be aligned when R1-1 resolves. |
| R2-2 | P2 | Nit | Only expired case tested; missing malformed (missing `exp`) and boundary `exp == now` cases per plan V3 / spec AC-2. |
| R2-3 | P2 | Nit | Negative-control red run (plan V4 evidence) not captured in PR. |
| R3-1 | P3 | Nit | Docstring could over-read as full token validation; clarify expiry-only scope. |
| R3-2 | P3 | Nit | No note to external callers that success-with-expired implicit behavior changed to None; align docs. |
| R4-1 | P4 | Important | Returns-None is silent on failure reason (replay vs malformed); ValueError-with-reason would give traceability — recommends the human pick one model. |

## Conclusion

- **Overall: NOT READY FOR MERGE — BLOCKED on a named human decision.**
- The code change is logically correct, non-regressive, closes the described security gap, keeps a single expiry-rule source, and is easily reversible — technically sound at implementation level.
- However the diff directly contradicts the signed spec decision on the rejection contract (`ValueError` per spec SYS-AUTH-001/002 & AC-1 vs `return None` in code + new test). Two required spec acceptance criteria (AC-1) are unmet by the submitted code, and the new test cements the *other* contract. Per plan Human gates HG1/HG2, merge to main requires named human authorization, and this is exactly a decision only a human signer may make (exception-vs-None outcomes have different external semantics).
- Recommend: named human authorizes EITHER (a) accept the returns-None model → amend spec decision record + AC-1/AC-2 wording to match and add the missing malformed/boundary tests (R2-2), or (b) restore the spec'd `ValueError` model → update `src/auth.py` + the new test. With (a), R1-2/R4-1's silence-on-reason stands as accepted tradeoff; with (b) it is resolved by construction.
- After the resolution, re-run `make test` (OK) + `make lint` (exit 0) and attach evidence before any completion or merge.

Reviewer: QM (independent AI review; no self-approval authority). Merge authorizer: ____________ (named human). Reviewer sign-off date / merge authorization record appended on human decision.
