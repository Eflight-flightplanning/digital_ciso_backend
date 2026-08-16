import sys
from pathlib import Path
import environ
import os

env = environ.Env()
BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent

# Ensure the repository root (containing prowler/) is in sys.path
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Read .env file from project root into environ and os.environ
env_file = BASE_DIR / ".env"
if env_file.exists():
    environ.Env.read_env(env_file)