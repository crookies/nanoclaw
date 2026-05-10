#!/usr/bin/env python3
"""Set the Crookery dashboard password. Run via: make set-password"""
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

password = getpass.getpass("Nouveau mot de passe : ")
if not password:
    print("Mot de passe vide refusé.")
    sys.exit(1)
confirm = getpass.getpass("Confirmer le mot de passe : ")
if password != confirm:
    print("Les mots de passe ne correspondent pas.")
    sys.exit(1)

hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

if env_path.exists():
    content = env_path.read_text()
    if "CROOKERY_PASSWORD_HASH=" in content:
        content = re.sub(
            r"^CROOKERY_PASSWORD_HASH=.*$",
            f"CROOKERY_PASSWORD_HASH={hashed}",
            content,
            flags=re.MULTILINE,
        )
    else:
        content = content.rstrip("\n") + f"\nCROOKERY_PASSWORD_HASH={hashed}\n"
    env_path.write_text(content)
else:
    env_path.write_text(f"CROOKERY_HOST=0.0.0.0\nCROOKERY_PORT=4123\nCROOKERY_PASSWORD_HASH={hashed}\n")

print(f"Mot de passe enregistré dans {env_path}")
print("Redémarrer Crookery pour appliquer.")
