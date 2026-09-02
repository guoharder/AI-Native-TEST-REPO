import sys
import unittest

sys.path.insert(0, "src")

from auth import create_session

NOW = 1_000_000


def _token(**overrides):
    t = {"sub": "user-7", "exp": NOW + 100}
    t.update(overrides)
    return t


class MissingSubTest(unittest.TestCase):
    def test_unexpired_missing_sub_raises_valueerror(self):
        """A structurally valid but unexpired token without 'sub'
        must fail with the intended semantic error — no session."""
        token = _token()
        del token["sub"]
        with self.assertRaises(ValueError) as ctx:
            create_session(token, now=NOW)
        self.assertIn("missing sub claim", str(ctx.exception))

    def test_missing_sub_does_not_leak_keyerror(self):
        """The old uncaught KeyError path must be gone: the call must
        raise ValueError, and never a KeyError."""
        token = _token()
        del token["sub"]
        try:
            create_session(token, now=NOW)
        except ValueError:
            pass
        except (KeyError, Exception) as exc:  # pragma: no cover
            self.fail(f"unexpected exception type: {type(exc).__name__}: {exc}")
        else:  # pragma: no cover
            self.fail("expected ValueError for missing 'sub' claim")

    def test_valid_token_with_sub_unaffected(self):
        """A valid, unexpired token carrying 'sub' keeps its prior
        behaviour and still creates a session."""
        result = create_session(_token(), now=NOW)
        self.assertEqual(result, {"user": "user-7", "authenticated": True})


if __name__ == "__main__":
    unittest.main()
