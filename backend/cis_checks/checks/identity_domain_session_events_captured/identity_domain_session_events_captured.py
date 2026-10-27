from collections import Counter
from datetime import timedelta

from cis_checks.base import Check, env_int, excluded_actors, iso, utc_now

# Authentication lifecycle stages and the identity domain audit event ids that evidence them.
LIFECYCLE = [
    ("sign_in_success", "Successful sign-in / session created", ["sso.session.create.success"]),
    ("sign_in_failure", "Failed sign-in", ["sso.session.create.failure", "sso.authentication.failure"]),
    ("sign_out", "Sign-out / session terminated", ["sso.session.delete.success"]),
    ("session_modify", "Session refresh / modification", ["sso.session.modify.success", "sso.session.modify.failure"]),
    ("app_access", "Application access within a session", ["sso.app.access.success", "sso.app.access.failure"]),
]
ATTRIBUTES = ["eventId", "timestamp", "actorName", "clientIp"]
SAMPLE = 15


class identity_domain_session_events_captured(Check):
    def execute(self, api, ctx):
        days = env_int("EVENT_WINDOW_DAYS", 30)
        limit = env_int("EVENT_SAMPLE", 2000)
        now = utc_now()
        start = now - timedelta(days=days)
        excluded = excluded_actors()

        events = api.list(
            "AuditEvents",
            filter=f'timestamp ge "{iso(start)}" and eventId sw "sso."',
            attributes=ATTRIBUTES,
            sort_by="timestamp",
            sort_order="descending",
            limit=limit,
        )
        events = [e for e in events if (e.get("actorName") or "").lower() not in excluded]
        counts = Counter(e.get("eventId") for e in events)

        # Count each stage over the whole window with the API's totalResults; the sample above only
        # holds the newest EVENT_SAMPLE events, which can cover a few hours on a busy domain.
        window = f'timestamp ge "{iso(start)}"'

        def total(filter_):
            return int(api.get("/admin/v1/AuditEvents", {"filter": filter_, "count": 1, "attributes": "eventId"}).get("totalResults") or 0)

        lifecycle = []
        for key, label, ids in LIFECYCLE:
            per_id = {i: total(f'{window} and eventId eq "{i}"') for i in ids}
            found = sum(per_id.values())
            older = False
            if not found:
                older = any(total(f'eventId eq "{i}"') for i in ids)
            lifecycle.append({"key": key, "label": label, "event_ids": ids, "found": bool(found), "count": found,
                              "count_by_event": per_id, "found_only_in_older_history": older})

        with_ip = sum(1 for e in events if e.get("clientIp"))
        evidence = {
            "window": {"from": iso(start), "to": iso(now), "days": days, "sample_limit": limit, "truncated": len(events) >= limit},
            "lifecycle": lifecycle,
            "event_counts": {i: n for s_ in lifecycle for i, n in s_["count_by_event"].items()},
            "sample_event_counts": dict(counts.most_common()),
            "events_sampled": len(events),
            "pct_with_ip": round(100 * with_ip / len(events), 1) if events else None,
            "excluded_actors": len(excluded),
            "sample": [
                {"timestamp": e.get("timestamp"), "event_id": e.get("eventId"), "user": e.get("actorName"), "client_ip": e.get("clientIp")}
                for e in events[:SAMPLE]
            ],
        }

        missing = [s["label"] for s in lifecycle if not s["found"]]
        export_note = "Export to OCI Logging and forwarding to a SIEM are NOT assessed from here (needs OCI access)."
        if not events:
            reason = (
                f"Provisional: no sign-in or session events were returned for the last {days} days. Newer identity domains publish "
                f"these to OCI Audit instead of the AuditEvents API, so check there. {export_note}"
            )
            return self.result("FAIL (provisional)", reason, evidence)
        if missing:
            reason = f"Provisional: {len(missing)} lifecycle stage(s) had no events in the last {days} days: {', '.join(missing)}. {export_note}"
            return self.result("FAIL (provisional)", reason, evidence)
        total_events = sum(s_["count"] for s_ in lifecycle)
        # Agreed scope: the control passes on event capture. Export and forwarding are confirmed later.
        evidence["pass_basis"] = "All lifecycle events are captured. Export to OCI Logging and SIEM forwarding are not verified yet."
        reason = (
            f"All {len(lifecycle)} authentication lifecycle stages are recorded ({total_events:,} events in {days} days). "
            f"Export to OCI Logging and forwarding to a SIEM are NOT assessed yet and are to be confirmed later."
        )
        return self.result("PASS", reason, evidence)
