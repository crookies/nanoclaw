import secrets

import bcrypt

_active_sessions: dict[str, None] = {}


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_session() -> str:
    token = secrets.token_urlsafe(32)
    _active_sessions[token] = None
    return token


def is_valid_session(token: str) -> bool:
    return bool(token) and token in _active_sessions


def revoke_session(token: str) -> None:
    _active_sessions.pop(token, None)
