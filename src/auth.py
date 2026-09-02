"""Minimal auth for the checkout-api demo service."""
import time  # stdlib clock source for expiry checks

SESSION_TTL = 3600  # seconds; session lifetime hint (unchanged behavior)


def create_session(token, now=None):
    """Create an authenticated session from a bearer token.

    A token is a dict like {"sub": "<user>", "exp": <unix_ts>}.

    Fixed security defect (auth-expired-token-001): an expired token
    (exp <= now) previously still produced an authenticated session.
    Now it raises ValueError — no session is created — while a valid
    token (exp > now) behaves exactly as before.
    """
    now = now if now is not None else time.time()
    if not token_is_valid(token, now):
        raise ValueError("token expired")
    return {"user": token["sub"], "authenticated": True}


def token_is_valid(token, now=None):
    now = now if now is not None else time.time()
    return token.get("exp", 0) > now
