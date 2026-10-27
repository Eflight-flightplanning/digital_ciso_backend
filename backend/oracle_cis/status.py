"""Maps a check's raw status string onto PASS, FAIL or MANUAL, plus badge flags."""
from .models import Status

PROVISIONAL = "provisional"
PARTIALLY_EVIDENCED = "partially_evidenced"
AUTOMATED_CHECK_FAILED = "automated_check_failed"
ASSESSOR_CONFIRMED = "assessor_confirmed"
# Internal: manual controls, checked by the assessor rather than by the tool.
REQUIRES_OTHER_ACCESS = "requires_other_access"


def normalize_status(raw):
    """Return (status, flags) for a check's raw status. Results are never changed by hand."""
    text = (raw or "").strip()
    lower = text.lower()
    first = text.split()[0].upper().rstrip(":") if text else ""
    confirmed = lower.endswith("(manual)")
    flags = []

    if first == "PASS":
        status = Status.PASS
    elif first == "FAIL":
        status = Status.FAIL
        if PROVISIONAL in lower:
            flags.append(PROVISIONAL)
    elif first == "PARTIAL":
        if confirmed:
            status = Status.FAIL
        else:
            status = Status.MANUAL
            flags.append(PARTIALLY_EVIDENCED)
    elif first == "ERROR":  # tested by the tool, but the check could not complete
        status = Status.MANUAL
        flags.append(AUTOMATED_CHECK_FAILED)
    else:  # MANUAL, or anything unrecognised: never silently PASS or FAIL
        status = Status.MANUAL

    if confirmed:
        flags.append(ASSESSOR_CONFIRMED)
    return status.value, flags
