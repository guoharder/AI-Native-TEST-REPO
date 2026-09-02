# Decision: ship fix for incident #2 (auth-missing-sub-001)

- **Incident:** GitHub issue #2 (SEV-2) — `create_session` returned HTTP 500
  (`KeyError: 'sub'`) for valid, non-expired bearer tokens missing the `sub` claim.
- **Intent:** `docs/sdlc/missing-sub/intent.md` — triage accepted by guo (release
  owner), risk = high.
- **Artifact chain:** intent → `spec.md` → `plan.md` → fix (`src/auth.py`) +
  regression test (`tests/test_auth_missing_sub.py`) → `REVIEW.md`.

## Contract decision
A non-expired token that lacks the `sub` claim raises `ValueError("missing sub
claim")` — the edge maps this to a 4xx. This is consistent with the existing
expired-token contract (`auth-expired-token-001`). No session is created. The
`exp` / expiry logic is unchanged (declared non-goal).

## Deterministic evidence
- GitHub Actions `lint-and-test` green on the PR (host-enforced status check).
- `make test` green locally (8 tests, incl. the new missing-sub regression).

## Authorization
guo (code owner + release owner) authorizes the merge. This repository has a
single owner, so the CODEOWNERS review requirement cannot be met by a second
reviewer; guo therefore authorizes via an explicit, recorded admin action, after
which the high-risk code-owner review gate is restored for subsequent changes.
In a multi-person team this step is a second human's code-owner approval.

## Permanent regression
- `evals/auth-missing-sub-001.yaml`
- `tests/test_auth_missing_sub.py`

**Result:** incident #2 closed.
