import hashlib
import hmac
import time

import bcrypt

from config import settings

_TOKEN_MAX_AGE = 30 * 24 * 3600  # 30 days


def _secret() -> bytes:
    src = settings.nanoscope_password_hash or "no-auth"
    return hashlib.sha256(src.encode()).digest()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_session() -> str:
    ts = str(int(time.time()))
    payload = f"user:{ts}"
    sig = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{sig}"


def is_valid_session(token: str) -> bool:
    if not token:
        return False
    try:
        user, ts, sig = token.rsplit(":", 2)
        expected = hmac.new(_secret(), f"{user}:{ts}".encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return False
        return 0 <= int(time.time()) - int(ts) <= _TOKEN_MAX_AGE
    except Exception:
        return False


def revoke_session(token: str) -> None:
    pass  # stateless — logout clears cookie client-side
