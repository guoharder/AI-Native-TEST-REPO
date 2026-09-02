# Repository Guidance (repo memory)

## Build / test / lint commands
- Test: `make test` — runs `python3 -m unittest discover -s tests`. Success = `OK`.
- Lint: `make lint` — `py_compile` must exit 0.

## Architecture map
- `src/auth.py` — session/token logic for the checkout-api demo. No external deps.
- `tests/` — unittest suite. One command runs everything.

## Conventions
- Python 3, standard library only (no third-party deps).
- Security-relevant behavior must have a locked reproduction test before the fix.

## Protected areas
- Once a reproduction test is committed, it is LOCKED: fix the implementation,
  never weaken or delete the test to make the suite pass.

## Definition of done
- `make test` is green, evidence (commands + output) captured, artifact chain
  (intent -> spec -> plan -> PR) linked in the PR. Merge to `main` requires a
  named human approval (production/protected-branch gate).
