import io
import os
import re
import sys
from pathlib import Path
import environ

env = environ.Env()
BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent

# Ensure the repository root (containing prowler/) is in sys.path
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def _normalize_dotenv(content: str) -> str:
    """
    Normalizes .env content to ensure compatibility with django-environ:
    1. Folds multiline quoted values (e.g. KEY="line1\nline2") into single-line strings.
    2. Recognizes bare or unquoted PEM blocks (-----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----)
       and attaches them to DJANGO_TOKEN_SIGNING_KEY / DJANGO_TOKEN_VERIFYING_KEY.
    3. Prevents 'Invalid line: "-----BEGIN PRIVATE KEY-----"' warnings/crashes in production.
    """
    lines = content.splitlines()
    out_lines = []
    i = 0
    n = len(lines)

    while i < n:
        raw_line = lines[i]
        line = raw_line.strip()
        i += 1

        if not line or line.startswith("#"):
            out_lines.append(raw_line)
            continue

        # Check for PEM block header (bare or assigned)
        # e.g.:
        # -----BEGIN PRIVATE KEY-----
        # DJANGO_TOKEN_SIGNING_KEY=-----BEGIN PRIVATE KEY-----
        # DJANGO_TOKEN_SIGNING_KEY="-----BEGIN PRIVATE KEY-----
        pem_header_match = re.match(
            r'^(?:(?:export\s+)?([A-Za-z_0-9]+)\s*=\s*)?(["\']?)-----\s*BEGIN\s+([A-Z0-9_\s]+)\s*-----(.*)$',
            line,
        )
        if pem_header_match:
            var_name = pem_header_match.group(1)
            quote = pem_header_match.group(2)
            key_type = pem_header_match.group(3).strip()
            rest = pem_header_match.group(4)

            if not var_name:
                if "PRIVATE" in key_type:
                    var_name = "DJANGO_TOKEN_SIGNING_KEY"
                elif "PUBLIC" in key_type:
                    var_name = "DJANGO_TOKEN_VERIFYING_KEY"
                else:
                    var_name = f"PEM_{key_type.replace(' ', '_')}"

            pem_lines = [f"-----BEGIN {key_type}-----" + (f" {rest}" if rest and not rest.endswith(quote) else "")]
            end_marker = f"-----END {key_type}-----"
            while i < n:
                next_line = lines[i].strip()
                i += 1
                if not next_line:
                    continue
                clean_next = next_line.rstrip('"\'')
                pem_lines.append(clean_next)
                if end_marker in next_line:
                    break

            combined_val = "\\n".join(pem_lines)
            out_lines.append(f'{var_name}="{combined_val}"')
            continue

        # Check for multiline quoted string: KEY="... or KEY='...
        quoted_match = re.match(r'^(?:export\s+)?([A-Za-z_0-9]+)\s*=\s*(["\'])(.*)$', line)
        if quoted_match:
            var_name = quoted_match.group(1)
            quote_char = quoted_match.group(2)
            first_part = quoted_match.group(3)

            # Check if closed on same line (and not escaped quote)
            if first_part.endswith(quote_char) and not first_part.endswith("\\" + quote_char):
                out_lines.append(raw_line)
                continue

            # Multiline accumulation
            accumulated = [first_part]
            while i < n:
                next_line = lines[i].strip()
                i += 1
                if next_line.endswith(quote_char) and not next_line.endswith("\\" + quote_char):
                    accumulated.append(next_line[:-1])
                    break
                accumulated.append(next_line)

            combined_val = "\\n".join(accumulated)
            out_lines.append(f'{var_name}="{combined_val}"')
            continue

        # Check standard KEY=VALUE
        if re.match(r'^(?:export\s+)?[A-Za-z_0-9]+\s*=', line):
            # Check if key was assigned empty, and if the next line is a PEM header
            if i < n and lines[i].strip().startswith("-----BEGIN "):
                m_var = re.match(r'^(?:export\s+)?([A-Za-z_0-9]+)\s*=', line)
                if m_var:
                    target_var = m_var.group(1)
                    lines[i] = f"{target_var}={lines[i]}"
                    continue
            out_lines.append(raw_line)
            continue

        # Non-matching stray line: comment out so environ.Env.read_env does not emit 'Invalid line' warnings
        out_lines.append(f"# [ignored invalid syntax]: {raw_line}")

    return "\n".join(out_lines)


def _load_env_file():
    candidates = [
        BASE_DIR / ".env",
        REPO_ROOT / ".env",
        Path.cwd() / ".env",
    ]
    seen = set()
    for env_path in candidates:
        try:
            resolved = env_path.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            if resolved.is_file():
                content = resolved.read_text(encoding="utf-8")
                normalized = _normalize_dotenv(content)
                environ.Env.read_env(io.StringIO(normalized))
        except Exception:
            pass


_load_env_file()
