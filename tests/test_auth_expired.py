"""Test that an expired token makes create_session raise ValueError.

Security defect (auth-expired-token-001): create_session must reject
expired tokens (exp <= now) by raising ValueError("token expired").
Only stdlib unittest is used.
"""
import unittest

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.auth import create_session


class ExpiredTokenTest(unittest.TestCase):
    def test_expired_token_raises_value_error(self):
        expired = {"sub": "mallory", "exp": 500}
        with self.assertRaises(ValueError):
            create_session(expired, now=1000)


if __name__ == "__main__":
    unittest.main()
