# PR: reject expired tokens in create_session (auth-expired-token-001)

Branch: `sdlc/expired-token-fix` → `main`  ·  Status: **OPEN — awaiting named-human approval (gate)**

## Artifact chain
- Plan:   docs/sdlc/expired-token/intent.md
- Design: docs/sdlc/expired-token/spec.md
- Build:  docs/sdlc/expired-token/plan.md
- Review: docs/sdlc/expired-token/REVIEW.md

## Change (6 files changed, 463 insertions(+), 3 deletions(-))
- docs/sdlc/expired-token/intent.md
- docs/sdlc/expired-token/plan.md
- docs/sdlc/expired-token/spec.md
- run-chain.mjs
- src/auth.py
- tests/test_auth_expired.py

## Evidence
- Reproduction (RED): expired token created a session → test failed.
- After fix (GREEN): `make test` → OK (valid-token behavior unchanged).
- Provenance: intent/spec/plan/review = agent-generated; test=agent; fix=agent.

## Deterministic gate (command-policy-simulate on team:sdlc)
- `git push origin main` → **REQUIRE_APPROVAL** (受保护分支:走 PR + CODEOWNERS,不直推), source=scope
- Therefore the chain STOPS here. A named human must approve the merge (portal / branch-protection gate). The agent does not self-merge.
