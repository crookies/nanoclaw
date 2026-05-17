#!/usr/bin/env python3
"""Set the NanoScope dashboard password. Run via: make set-password"""
import getpass
import re
import sys
from pathlib import Path

try:
    import bcrypt
except ImportError:
    print("bcrypt not found. Install: uv pip install bcrypt --python backend/.venv/bin/python")
    sys.exit(1)

env_path = Path(__file__).parent.parent / "backend" / ".env"

password = getpass.getpass("New password: ")
if not password:
    print("Empty password rejected.")
    sys.exit(1)
confirm = getpass.getpass("Confirm password: ")
if password != confirm:
    print("Passwords do not match.")
    sys.exit(1)

hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

if env_path.exists():
    content = env_path.read_text()
    if "NANOSCOPE_PASSWORD_HASH=" in content:
        content = re.sub(
            r"^NANOSCOPE_PASSWORD_HASH=.*$",
            f"NANOSCOPE_PASSWORD_HASH={hashed}",
            content,
            flags=re.MULTILINE,
        )
    else:
        content = content.rstrip("\n") + f"\nNANOSCOPE_PASSWORD_HASH={hashed}\n"
    env_path.write_text(content)
else:
    env_path.write_text(f"NANOSCOPE_HOST=0.0.0.0\nNANOSCOPE_PORT=4123\nNANOSCOPE_PASSWORD_HASH={hashed}\n")

print(f"Password saved to {env_path}")
print("Restart NanoScope to apply.")
