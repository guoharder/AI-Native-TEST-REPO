## Desired outcome
`create_session(token, now=None)` refuses tokens whose `exp` has passed (i.e. rejects when `exp <= now`, and treats a missing `now` as `time.time()`, consistent with `token_is_valid`). An expired token raises a clear, non-authenticated outcome instead of returning a session. Valid tokens keep behaving exactly as today. The orphaned expiry logic in `token_is_valid()` and the new guard in `create_session()` should agree on the same rule (allowed gap), avoiding drift between the two.

## Affected users and systems
- Users holding bearer tokens for checkout-api demo service (theirs is the credential exposed by the defect).
- The checkout-api authentication/session path and its SESSION_TTL semantics.
- CI gate: `make test` and `make lint` (Python 3, no new external dependency).

## Constraints
- Python 3, standard library only — no external deps allowed.
- `make lint` (`py_compile`) must still exit 0.
- `make test` must pass its unittest suite (`OK`) — existing passing tests must not regress.
- No change in public function signatures or the success path's behavior for valid tokens.

## Non-goals
- Not redesigning the token format or adopting real JWT validation/signature verification.
- Not changing token issuance/refresh flows or SESSION_TTL value itself.
- Not hardening other auth paths beyond the `exp` check in `create_session()`.
- Not an end-to-end network/transport hardening change.

## Open questions
1. Rejection style: raise an explicit exception (e.g. `ValueError`) vs. returning a falsy/`authenticated: False` result — caller expectations need confirming before implementation.
2. Strictness on a missing `exp` (e.g. malformed token) — reject unconditionally, or mirror `token_is_valid()`'s `token.get("exp", 0)` default-0 (which also rejects)? Decide which semantic `create_session()` should own.
3. Clock tolerance: enforce plain `now >= exp` rejection (no grace), or allow a small skew window for expiry-at-transport? (Default proposal: reject when `exp <= now`, no added grace, unless Product pushes back.)
4. Should `token_is_valid()` become the single shared primitive `create_session()` calls, or should the check be inlined with a named helper to keep the diff minimal?

## Success evidence
- New unittest: expired token passed to `create_session()` (with explicit `now` greater than `exp`) yields no authenticated session — asserted exactly, mirroring the "Desired outcome" behavior. Malformed (missing `exp`) token case, if decided, also covered.
- Existing tests (valid-token path) still pass.
- `make test` ends in `OK`; `make lint` exits 0.
- Code review confirms one expiry rule source (no duplicated/divergent date math between `token_is_valid()` and `create_session()`).

## Decision record
(Empty until the change is implemented. To be filled with the agreed rejection style, the missing-`exp` policy, the shared `token_is_valid()`-primitive decision, and the resolution of the Open questions above.)
