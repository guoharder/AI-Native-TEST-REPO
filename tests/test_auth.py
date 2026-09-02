import unittest

from src.auth import create_session


class TestAuth(unittest.TestCase):
    def test_valid_token_creates_session(self):
        token = {"sub": "alice", "exp": 9_999_999_999}
        session = create_session(token, now=1000)
        self.assertIsNotNone(session)
        self.assertTrue(session["authenticated"])
        self.assertEqual(session["user"], "alice")


if __name__ == "__main__":
    unittest.main()
