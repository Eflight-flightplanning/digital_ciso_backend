from pathlib import Path
import environ
import os

env = environ.Env()
BASE_DIR = Path(__file__).resolve().parent.parent

# Read .env file from project root into environ and os.environ
env_file = BASE_DIR / ".env"
if env_file.exists():
    environ.Env.read_env(env_file)