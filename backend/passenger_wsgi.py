"""WSGI entrypoint for cPanel Passenger (Python)."""
import os
import sys
from pathlib import Path

# Ensure backend/ is on sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

# Load .env if present
try:
    from dotenv import load_dotenv
    load_dotenv(backend_dir / ".env")
except ImportError:
    pass

from app.main import app  # noqa: E402

# Passenger expects `application` WSGI callable
application = app
