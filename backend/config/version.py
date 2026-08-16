from __future__ import annotations
import tomllib
from pathlib import Path

def _discover_release_id() -> str:
    here = Path(__file__).resolve()
    for directory in here.parents:
        candidate = directory / 'pyproject.toml'
        if candidate.is_file():
            with candidate.open('rb') as f:
                data = tomllib.load(f)
            project = data.get('project') or {}
            version = project.get('version', '1.0.0')
            if version:
                return version
    return '1.0.0'

RELEASE_ID: str = _discover_release_id()
API_VERSION: str = RELEASE_ID.split('.', 1)[0]
