#!/usr/bin/env python3
"""
rename_metadata.py

Recursively scans a category-based directory tree and corrects application/
service names inside metadata files, using a fixed, explicit mapping
(ACTUAL NAME -> SHOULD BE). Folder names are NEVER renamed.

Corrections (nothing else is touched - no fuzzy matching, IDs or URLs):
  - Any JSON string value, under ANY key, at any depth, that EXACTLY matches
    an Actual Name (surrounding whitespace ignored) is set to the Should Be
    value.
  - A value that is already a Should Be name but padded with whitespace
    (e.g. "Box ") is trimmed.
  - The top-level "name" field has the form "<App>: <scenario>"; the <App>
    prefix is corrected the same way.
  - "description" fields: any Actual Name occurring as a whole word/phrase
    inside the text is corrected in place.
  - A blank "User Agent" is filled from a sibling "Client Name", or else from
    the (corrected) app prefix of the top-level "name". A non-blank User
    Agent is never overwritten.

Zero-mismatch guarantee:
  After --apply, a verification pass re-reads every file and re-runs the
  corrector on an in-memory copy. Anything it would still change is a HARD
  mismatch (exit code 2). It also reports SOFT warnings that cannot be fixed
  without guessing (casing variants not in the mapping, Client Name / User
  Agent disagreeing with the app prefix of "name").

Usage:
    python rename_metadata.py "Z:\\08" --dry-run
    python rename_metadata.py "Z:\\08" --apply     (verifies automatically)
    python rename_metadata.py "Z:\\08" --verify    (verify only, no changes)
"""

import argparse
import copy
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# The mapping: ACTUAL NAME (exact, case-sensitive) -> SHOULD BE
# ---------------------------------------------------------------------------
MAPPING = {
    "AajTak": "Aaj Tak",
    "aesthetic": "Aesthetic",
    "afreecaTV": "AfreecaTV",
    "amazon_chime": "Amazon Chime",
    "Amazon Instant video": "Amazon Instant Video",
    "Among us": "Among Us",
    "Among_us": "Among Us",
    "AMONG_US": "Among Us",
    "avast! Mobile Security": "Avast Mobile Security",
    "Avira AntiVirus": "Avira Antivirus",
    "Bigupload": "BigUpload",
    "Bing_with_copilot": "Bing with Copilot",
    "Bing_With_Copilot": "Bing with Copilot",
    "BOX": "Box",
    "CCTVBOX": "CCTV Box",
    "Character AI": "Character.AI",
    "CitrixReceiver": "Citrix Receiver",
    "Claude_AI": "Claude AI",
    "cloudfront": "CloudFront",
    "Confluence_Cloud": "Confluence Cloud",
    "ConfluenceCloud": "Confluence Cloud",
    "Counter Strike": "Counter-Strike",
    "deviantART": "DeviantArt",
    "Dota2": "Dota 2",
    "dropbox": "Dropbox",
    "Ebay": "eBay",
    "epix": "Epix",
    "Fifa": "FIFA",
    "Final FantasyXIV": "Final Fantasy XIV",
    "Free_TV": "Free TV",
    "Fubar": "fubar",
    "Garden_scapes": "Gardenscapes",
    "Garden_Scapes": "Gardenscapes",
    "Github": "GitHub",
    "Google Chrome": "Chrome",
    "Google_classroom": "Google Classroom",
    "Google_Earth": "Google Earth",
    "Google_Maps": "Google Maps",
    "Google_Meet": "Google Meet",
    "GoogleMeet": "Google Meet",
    "GoToMeeting": "GoTo Meeting",
    "Graden_Scapes": "Gardenscapes",
    "HOTTV": "Hot TV",
    "icloud": "iCloud",
    "Java_update": "Java Update",
    "Join_Clash": "Join Clash",
    "kotaku": "Kotaku",
    "Kugou": "KuGou",
    "Letv": "LeTV",
    "Linkedin": "LinkedIn",
    "METROFLOG": "MetroFLOG",
    "Microsoft_teams": "Microsoft Teams",
    "MLB.com_At_Bat": "MLB.com At Bat",
    "Money Control": "Moneycontrol",
    "Multiupload": "MultiUpload",
    "Mx player": "MX Player",
    "MX player": "MX Player",
    "MX_TakaTak": "MX TakaTak",
    "MySql": "MySQL",
    "Natepann": "NATE PANN",
    "NaverMap": "Naver Map",
    "NHL_GameCenter": "NHL GameCenter",
    "niconico": "Niconico",
    "Okta_SSO": "Okta SSO",
    "opera Browser": "Opera Browser",
    "Opera_Mini": "Opera Mini",
    "ppstream": "PPStream",
    "Robolox": "Roblox",
    "RTE_Player": "RTE Player",
    "rtsp": "RTSP",
    "Rutube": "RUTUBE",
    "SKY": "Sky",
    "skype": "Skype",
    "Snap Chat": "Snapchat",
    "SonyTV": "Sony TV",
    "SPB_TV": "SPB TV",
    "SubwaySurf": "Subway Surfers",
    "ThinkFree": "Thinkfree",
    "Tiles_Hop": "Tiles Hop",
    "Tinnychat": "Tinychat",
    "tinypic": "TinyPic",
    "TravelZoo": "Travelzoo",
    "TripAdvisor": "Tripadvisor",
    "tving": "TVING",
    "Tving": "TVING",
    "tvn player": "TVN Player",
    "tvn Player": "TVN Player",
    "twitvid": "Twitvid",
    "VideoJug": "Videojug",
    "Vsee": "VSee",
    "VUDU": "Vudu",
    "Websocket": "WebSocket",
    "Windows 10 update": "Windows 10 Update",
    "World Of War Crafts": "World of Warcraft",
    "Yahoomail": "Yahoo Mail",
    "yammer": "Yammer",
    "Youtube": "YouTube",
    "Youtube Music": "YouTube Music",
    "YouTube Over QUIC": "YouTube over QUIC",
}

BACKUP_DIRNAME = "_rename_metadata_backups"
LOG_DIRNAME = "_rename_metadata_logs"
SKIP_DIR_NAMES = {BACKUP_DIRNAME, LOG_DIRNAME}

SHOULD_BE_VALUES = set(MAPPING.values())

# The corrector must be idempotent: a Should Be value may never itself be an
# Actual Name, otherwise a second run would keep changing things.
_chained = SHOULD_BE_VALUES & set(MAPPING)
if _chained:
    raise SystemExit(f"Mapping is not idempotent; Should Be is also an Actual Name: {sorted(_chained)}")

# Longest-first so "Youtube Music" is matched before its prefix "Youtube".
_MAPPING_PATTERNS = [
    (key, re.compile(r"\b" + re.escape(key) + r"\b"))
    for key in sorted(MAPPING, key=len, reverse=True)
]
_SHOULD_BE_PATTERNS = [
    (sb, re.compile(r"\b" + re.escape(sb) + r"\b"))
    for sb in sorted(SHOULD_BE_VALUES, key=len, reverse=True)
]

# lower-cased name -> set of acceptable canonical spellings, for casing-variant warnings
_CANONICAL_BY_LOWER = {}
for _k, _v in MAPPING.items():
    _CANONICAL_BY_LOWER.setdefault(_k.lower(), set()).add(_v)
    _CANONICAL_BY_LOWER.setdefault(_v.lower(), set()).add(_v)


class Stats:
    def __init__(self):
        self.folders_scanned = 0
        self.metadata_files_scanned = 0
        self.metadata_names_checked = 0
        self.metadata_names_changed = 0
        self.user_agent_filled = 0
        self.errors = 0
        self.mapping_hits = set()
        self.should_be_seen = set()


class Logger:
    def __init__(self, log_path: Path, echo_to_console: bool = True):
        self.fh = open(log_path, "w", encoding="utf-8")
        self.echo = echo_to_console

    def block(self, text: str):
        self.fh.write(text + "\n\n")
        self.fh.flush()
        if self.echo:
            print(text)

    def line(self, text: str):
        self.fh.write(text + "\n")
        self.fh.flush()
        if self.echo:
            print(text)

    def close(self):
        self.fh.close()


def log_metadata_action(logger: Logger, file_path: Path, field: str, old_value: str,
                        new_value: str, status: str, occurrences: int = 1, note: str = ""):
    suffix = f" [{occurrences} occurrence(s) replaced]" if occurrences > 1 else ""
    if note:
        suffix += f" [{note}]"
    logger.block(
        "METADATA\n"
        f"{file_path}\n"
        f"{field}: {old_value}\n"
        "\u2192\n"
        f"{field}: {new_value}\n"
        f"STATUS: {status}{suffix}"
    )


# ---------------------------------------------------------------------------
# Correction
# ---------------------------------------------------------------------------
def correct_exact(value: str):
    """Return (new_value, matched_mapping_key_or_None) for a whole-value match.
    Handles Actual Name (whitespace-tolerant) and whitespace-padded Should Be."""
    stripped = value.strip()
    if stripped in MAPPING:
        return MAPPING[stripped], stripped
    if stripped != value and stripped in SHOULD_BE_VALUES:
        return stripped, None
    return value, None


def correct_description_text(text: str):
    """Replace every whole-word/phrase Actual Name inside free text."""
    modified = text
    total_count = 0
    matched_keys = []
    for key, pattern in _MAPPING_PATTERNS:
        modified, count = pattern.subn(MAPPING[key], modified)
        if count:
            total_count += count
            matched_keys.append(key)
    return modified, total_count, matched_keys


def walk_json_values(obj, changes: list, stats: Stats, field_label: str = ""):
    """Examine every JSON string value at any depth. 'description' fields get
    embedded replacement; every other field gets whole-value correction."""
    if isinstance(obj, dict):
        for key, value in obj.items():
            if isinstance(value, str):
                stats.metadata_names_checked += 1
                if key.lower() == "description":
                    for sb, pattern in _SHOULD_BE_PATTERNS:
                        if pattern.search(value):
                            stats.should_be_seen.add(sb)
                    new_text, count, matched_keys = correct_description_text(value)
                    if count:
                        obj[key] = new_text
                        changes.append((key, value, new_text, count, ""))
                        stats.mapping_hits.update(matched_keys)
                else:
                    if value.strip() in SHOULD_BE_VALUES:
                        stats.should_be_seen.add(value.strip())
                    new_value, matched_key = correct_exact(value)
                    if new_value != value:
                        obj[key] = new_value
                        changes.append((key, value, new_value, 1,
                                        "" if matched_key else "whitespace trimmed"))
                        if matched_key:
                            stats.mapping_hits.add(matched_key)
            elif isinstance(value, (dict, list)):
                walk_json_values(value, changes, stats, field_label=key)
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            if isinstance(item, str):
                stats.metadata_names_checked += 1
                if item.strip() in SHOULD_BE_VALUES:
                    stats.should_be_seen.add(item.strip())
                new_value, matched_key = correct_exact(item)
                if new_value != item:
                    obj[i] = new_value
                    label = f"{field_label}[{i}]" if field_label else f"[{i}]"
                    changes.append((label, item, new_value, 1,
                                    "" if matched_key else "whitespace trimmed"))
                    if matched_key:
                        stats.mapping_hits.add(matched_key)
            elif isinstance(item, (dict, list)):
                walk_json_values(item, changes, stats, field_label=field_label)


def fix_scenario_name_prefix(data, changes: list, stats: Stats):
    """Top-level "name" is '<App>: <scenario>'; correct the <App> prefix."""
    if not isinstance(data, dict):
        return
    name = data.get("name")
    if not isinstance(name, str) or ":" not in name:
        return
    prefix, rest = name.split(":", 1)
    new_prefix, matched_key = correct_exact(prefix)
    if new_prefix == prefix:
        return
    new_name = new_prefix + ":" + rest
    data["name"] = new_name
    changes.append(("name", name, new_name, 1, "app prefix"))
    if matched_key:
        stats.mapping_hits.add(matched_key)


def scenario_app_name(data):
    """App-name prefix of the top-level "name" field, or None."""
    name = data.get("name") if isinstance(data, dict) else None
    if isinstance(name, str) and ":" in name:
        prefix = name.split(":", 1)[0].strip()
        return prefix or None
    return None


def fill_missing_user_agents(obj, fallback_app_name, changes: list, stats: Stats):
    """Fill blank/whitespace-only "User Agent" from sibling "Client Name", else
    from the scenario app name. Never overwrites a non-blank value."""
    if isinstance(obj, dict):
        ua = obj.get("User Agent")
        if isinstance(ua, str) and ua.strip() == "":
            client_name = obj.get("Client Name")
            if isinstance(client_name, str) and client_name.strip():
                source, note = client_name.strip(), "filled from Client Name"
            elif fallback_app_name:
                source, note = fallback_app_name, "filled from scenario name"
            else:
                source, note = None, ""
            if source:
                obj["User Agent"] = source
                changes.append(("User Agent", ua if ua else "(empty)", source, 1, note))
                stats.user_agent_filled += 1
        for value in obj.values():
            if isinstance(value, (dict, list)):
                fill_missing_user_agents(value, fallback_app_name, changes, stats)
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, (dict, list)):
                fill_missing_user_agents(item, fallback_app_name, changes, stats)


def correct_data(data, stats: Stats):
    """Apply every correction to `data` in place; return the list of changes."""
    changes = []
    walk_json_values(data, changes, stats)
    fix_scenario_name_prefix(data, changes, stats)
    fill_missing_user_agents(data, scenario_app_name(data), changes, stats)
    return changes


# ---------------------------------------------------------------------------
# File / directory processing
# ---------------------------------------------------------------------------
def process_metadata_file(file_path: Path, dry_run: bool, backup_root: Path,
                          root: Path, logger: Logger, stats: Stats):
    stats.metadata_files_scanned += 1

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        stats.errors += 1
        logger.line(f"METADATA READ ERROR: {file_path} -> {e}")
        return

    try:
        changes = correct_data(data, stats)
    except Exception as e:
        stats.errors += 1
        logger.line(f"METADATA PARSE ERROR: {file_path} -> {e}")
        return

    if not changes:
        return

    if dry_run:
        for field, old_value, new_value, count, note in changes:
            log_metadata_action(logger, file_path, field, old_value, new_value,
                                "DRY-RUN (would change)", occurrences=count, note=note)
        stats.metadata_names_changed += sum(c[3] for c in changes)
        return

    try:
        rel_path = file_path.relative_to(root)
    except ValueError:
        rel_path = Path(file_path.name)
    backup_path = backup_root / rel_path
    try:
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "rb") as src, open(backup_path, "wb") as dst:
            dst.write(src.read())
    except OSError as e:
        stats.errors += 1
        logger.line(f"BACKUP ERROR: {file_path} -> {e}; metadata NOT modified")
        return

    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
    except OSError as e:
        stats.errors += 1
        for field, old_value, new_value, count, note in changes:
            log_metadata_action(logger, file_path, field, old_value, new_value,
                                f"ERROR: write failed - {e}", occurrences=count, note=note)
        return

    for field, old_value, new_value, count, note in changes:
        log_metadata_action(logger, file_path, field, old_value, new_value, "CHANGED",
                            occurrences=count, note=note)
    stats.metadata_names_changed += sum(c[3] for c in changes)


def process_directory(path: Path, dry_run: bool, backup_root: Path, root: Path,
                      logger: Logger, stats: Stats):
    stats.folders_scanned += 1
    try:
        entries = sorted(path.iterdir(), key=lambda p: p.name.lower())
    except OSError as e:
        stats.errors += 1
        logger.line(f"DIRECTORY READ ERROR: {path} -> {e}")
        return

    for entry in entries:
        try:
            is_dir = entry.is_dir()
        except OSError as e:
            stats.errors += 1
            logger.line(f"STAT ERROR: {entry} -> {e}")
            continue

        if is_dir:
            if entry.name in SKIP_DIR_NAMES:
                continue
            process_directory(entry, dry_run, backup_root, root, logger, stats)
        elif entry.suffix.lower() == ".json":
            process_metadata_file(entry, dry_run, backup_root, root, logger, stats)


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------
def iter_json_files(root: Path):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIR_NAMES)
        for fn in sorted(filenames):
            if fn.lower().endswith(".json"):
                yield Path(dirpath) / fn


def collect_soft_warnings(data):
    """Things we cannot safely auto-fix: return a list of warning strings."""
    warnings = []
    prefix = scenario_app_name(data)

    def visit(obj, path):
        if isinstance(obj, dict):
            for k, v in obj.items():
                p = f"{path}.{k}" if path else k
                if isinstance(v, str):
                    stripped = v.strip()
                    # casing variant of a known name that is not in the mapping
                    if (k.lower() != "description" and stripped
                            and stripped.lower() in _CANONICAL_BY_LOWER
                            and stripped not in _CANONICAL_BY_LOWER[stripped.lower()]
                            and stripped not in MAPPING):
                        want = " / ".join(sorted(_CANONICAL_BY_LOWER[stripped.lower()]))
                        warnings.append(f"{p}: {v!r} is a casing variant of {want!r} (not in mapping)")
                    # Client Name / User Agent disagreeing with the app prefix
                    if prefix and k in ("Client Name", "User Agent") and stripped and stripped != prefix:
                        warnings.append(f"{p}: {v!r} differs from app prefix {prefix!r}")
                else:
                    visit(v, p)
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                visit(item, f"{path}[{i}]")

    visit(data, "")
    return warnings


def verify_tree(root: Path, logger: Logger):
    """Re-read every file; return (hard_mismatch_count, warning_count, files_checked).
    Hard mismatch = the corrector would still change something (not idempotent)."""
    hard = warn = files = 0
    logger.line("")
    logger.line("=" * 70)
    logger.line("VERIFICATION PASS")
    logger.line("=" * 70)
    for file_path in iter_json_files(root):
        files += 1
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            logger.line(f"VERIFY READ ERROR: {file_path} -> {e}")
            hard += 1
            continue
        remaining = correct_data(copy.deepcopy(data), Stats())
        for field, old_value, new_value, _count, note in remaining:
            hard += 1
            logger.line(f"MISMATCH  {file_path}\n          {field}: {old_value!r} should be {new_value!r}"
                        + (f" [{note}]" if note else ""))
        for w in collect_soft_warnings(data):
            warn += 1
            logger.line(f"WARNING   {file_path}\n          {w}")
        # a blank User Agent with no available source can't be fixed automatically
        if _has_unfillable_blank_user_agent(data):
            warn += 1
            logger.line(f"WARNING   {file_path}\n          blank 'User Agent' with no Client Name or app prefix to fill from")

    logger.line("")
    logger.line(f"Files verified:          {files}")
    logger.line(f"Hard mismatches:         {hard}")
    logger.line(f"Warnings (manual check): {warn}")
    logger.line("RESULT: " + ("CLEAN - no mismatched metadata remains." if hard == 0
                              else "NOT CLEAN - see MISMATCH lines above."))
    return hard, warn, files


def _has_unfillable_blank_user_agent(obj):
    # Runs after correct_data would have filled everything fillable, so any blank left is unfillable.
    if isinstance(obj, dict):
        ua = obj.get("User Agent")
        if isinstance(ua, str) and ua.strip() == "":
            cn = obj.get("Client Name")
            if not (isinstance(cn, str) and cn.strip()) and not scenario_app_name(obj):
                return True
        return any(_has_unfillable_blank_user_agent(v) for v in obj.values() if isinstance(v, (dict, list)))
    if isinstance(obj, list):
        return any(_has_unfillable_blank_user_agent(v) for v in obj if isinstance(v, (dict, list)))
    return False


# ---------------------------------------------------------------------------
def main():
    # Windows consoles default to cp1252 and choke on the "→" in log blocks.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser =argparse.ArgumentParser(
        description="Correct application/service names inside metadata JSON using a fixed "
                    "mapping, then verify nothing mismatched remains. Folder names are never changed."
    )
    parser.add_argument("root", help=r'Root folder to scan, e.g. "Z:\08"')
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Preview changes only; modifies nothing.")
    mode.add_argument("--apply", action="store_true", help="Update metadata files, then verify.")
    mode.add_argument("--verify", action="store_true", help="Only verify; modifies nothing.")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"ERROR: root path does not exist or is not a directory: {root}", file=sys.stderr)
        sys.exit(1)

    dry_run = args.dry_run
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    mode_name = "verify" if args.verify else ("dryrun" if dry_run else "apply")

    log_dir = root / LOG_DIRNAME
    log_dir.mkdir(exist_ok=True)
    log_path = log_dir / f"rename_log_{mode_name}_{timestamp}.txt"
    backup_root = root / BACKUP_DIRNAME / timestamp

    logger = Logger(log_path)
    logger.line(f"rename_metadata.py run started: {datetime.now().isoformat()}")
    logger.line(f"Root: {root}")
    logger.line(f"Mode: {mode_name.upper()}")
    logger.line(f"Mapping entries: {len(MAPPING)}")
    logger.line("=" * 70)
    logger.line("")

    stats = Stats()
    hard = 0

    try:
        if not args.verify:
            process_directory(root, dry_run, backup_root, root, logger, stats)

            logger.line("")
            logger.line("=" * 70)
            logger.line("SUMMARY")
            logger.line("=" * 70)
            logger.line(f"Total folders scanned:          {stats.folders_scanned}")
            logger.line(f"Total metadata files scanned:   {stats.metadata_files_scanned}")
            logger.line(f"Total metadata names checked:   {stats.metadata_names_checked}")
            logger.line(f"Total metadata names changed:   {stats.metadata_names_changed}"
                        + (" (would change)" if dry_run else ""))
            logger.line(f"Total User Agent values filled: {stats.user_agent_filled}"
                        + (" (would fill)" if dry_run else ""))
            logger.line(f"Total errors:                   {stats.errors}")

            logger.line("")
            logger.line("=" * 70)
            logger.line("PER-MAPPING STATUS (ACTUAL NAME -> SHOULD BE)")
            logger.line("=" * 70)
            for key in sorted(MAPPING):
                should_be = MAPPING[key]
                logger.line(
                    f"  {key!r:35s} -> {should_be!r:30s} "
                    f"| ACTUAL found: {'YES' if key in stats.mapping_hits else 'no':3s} "
                    f"| SHOULD BE found: {'YES' if should_be in stats.should_be_seen else 'no':3s}"
                )
            neither = sorted(k for k in MAPPING
                             if k not in stats.mapping_hits and MAPPING[k] not in stats.should_be_seen)
            logger.line("")
            logger.line(f"Present nowhere at all: {len(neither)}")
            for k in neither:
                logger.line(f"  {k!r} -> {MAPPING[k]!r}")

        if not dry_run:
            hard, _warn, _files = verify_tree(root, logger)

        logger.line("")
        logger.line(f"Full log written to: {log_path}")
        if args.apply:
            logger.line(f"Metadata backups written to: {backup_root}")
    finally:
        logger.close()

    print()
    print(f"Done. Log file: {log_path}")
    if dry_run:
        print("This was a DRY RUN. Nothing was modified. Re-run with --apply to make changes.")
    if hard or stats.errors:
        sys.exit(2)


if __name__ == "__main__":
    main()
