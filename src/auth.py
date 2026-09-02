"""Minimal auth for the checkout-api demo service."""
import time

SESSION_TTL = 3600  # seconds; session lifetime hint (unchanged behavior)


def create_session(token, now=None):
    """Create an authenticated session from a bearer token.

    A token is a dict like {"sub": "<user>", "exp": <unix_ts>}.

    Fixed security defect (auth-expired-token-001): an expired token
    (exp <= now) previously still produced an authenticated session.
    Now it raises ValueError — no session is created — while a valid
    token (exp > now) behaves exactly as before.

    Fixed security defect (auth-missing-sub-001): a structurally valid
    but unexpired token lacking the "sub" claim previously raised an
    uncaught KeyError, surfacing as an HTTP 500 with no session created.
    Now it raises ValueError("missing sub claim") — no session is
    created — while a valid token (exp > now, "sub" present) behaves
    exactly as before.
    """
    now = now if now is not None else time.time()
    if not token_is_valid(token, now):
        raise ValueError("token expired")
    if "sub" not in token:
        raise ValueError("missing sub claim")
    return {"user": token["sub"], "authenticated": True}


def token_is_valid(token, now=None):
    now = now if now is not None else time.time()
    return token.get("exp", 0) > now
