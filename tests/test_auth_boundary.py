"""Boundary tests for src.auth.create_session's expiry contract.

Fixed security defect auth-expired-token-001 requires that a token
whose exp is missing or not strictly greater than "now" raises
ValueError — no authenticated session is produced — while a valid
token (exp > now) returns an authenticated session as before.
"""
import sys
import types
import unittest

# Allow stdlib-only import of the module under test.
sys.path.insert(0, "src")
import auth

NOW = 1_700_000_000


class CreateSessionBoundaryTest(unittest.TestCase):
    """Boundary coverage of exp handling in auth.create_session."""

    def test_missing_exp_raises(self):
        """A token lacking 'exp' is invalid and must raise ValueError."""
        token = {"sub": "alice"}
        with self.assertRaises(ValueError):
            auth.create_session(token, now=NOW)

    def test_exp_equal_now_raises(self):
        """A token expiring exactly at 'now' is invalid, not valid."""
        token = {"sub": "alice", "exp": NOW}
        with self.assertRaises(ValueError):
            auth.create_session(token, now=NOW)

    def test_exp_just_after_now_authenticates(self):
        """A token valid strictly past 'now' yields an authenticated session."""
        token = {"sub": "alice", "exp": NOW + 1}
        session = auth.create_session(token, now=NOW)
        self.assertEqual(session, {"user": "alice", "authenticated": True})


if __name__ == "__main__":
    unittest.main()
