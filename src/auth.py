"""Minimal auth for the checkout-api demo service."""
import time

SESSION_TTL = 3600


def create_session(token, now=None):
    """Create an authenticated session from a bearer token.

    A token is a dict like {"sub": "<user>", "exp": <unix_ts>}.

    BUG: token expiry ("exp") is never checked, so an expired token still
    produces an authenticated session. This is the security defect that the
    SDLC artifact chain is driven to fix.
    """
    now = now if now is not None else time.time()
    return {"user": token["sub"], "authenticated": True}


def token_is_valid(token, now=None):
    now = now if now is not None else time.time()
    return token.get("exp", 0) > now
