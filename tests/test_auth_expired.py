import unittest

from src.auth import create_session


class TestAuthExpiredSession(unittest.TestCase):
    """Regression guard for auth-expired-token-001.

    An expired token must not produce an authenticated session.
    Fix-first test: assert the returns-None contract this fix
    is driven to enforce.
    """

    def test_expired_token_creates_no_session(self):
        token = {"sub": "mallory", "exp": 500}  # expired: 500 <= now(1000)
        session = create_session(token, now=1000)
        self.assertIsNone(session)


if __name__ == "__main__":
    unittest.main()
