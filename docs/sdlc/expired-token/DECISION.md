# Decision Record — auth-expired-token-001 (Human Gate HG1)

- Gate: merge `sdlc/expired-token-fix` → `main`
- Deterministic control (unchanged): command-policy simulate `git push origin main` →
  **REQUIRE_APPROVAL** (受保护分支:走 PR + CODEOWNERS,不直推). The policy does NOT auto-flip;
  a named human authorization is what satisfies the gate.
- Finding (independent review): signed spec required `ValueError`; implementation/test used `return None`.
- **Decision (Path B):** code conforms to the signed spec. `create_session` now raises `ValueError`
  on expired tokens; the reproduction test is realigned to `assertRaises(ValueError)`.
  Note: the locked test was realigned to the *authoritative* contract under explicit human
  authorization + re-verification — this is spec-conformance, not a weakening to force green.
- Evidence: `make test` → OK (valid-token behavior unchanged; expired token raises).
- Convergence provenance: agent.
- **Authorized by (named human):** guo (release owner)
- Authorized at: 2026-09-02T14:38:53.640Z
- Merge authorization: GRANTED — proceed to merge into `main`.
