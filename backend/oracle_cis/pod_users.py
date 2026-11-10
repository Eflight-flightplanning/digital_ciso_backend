"""A client's Oracle Fusion users, kept per client in the database."""
from __future__ import annotations

from typing import Any

from django.db import transaction

from .models import OcisPodUser


def load_pod_users(tenant_id) -> list[dict[str, Any]]:
    return list(OcisPodUser.objects.filter(tenant_id=tenant_id).values_list("data", flat=True))


def save_pod_users(tenant_id, users: list[dict[str, Any]]) -> None:
    rows = [OcisPodUser(tenant_id=tenant_id, username=u.get("username", "").upper(), position=i, data=u)
            for i, u in enumerate(users) if u.get("username")]
    with transaction.atomic():
        OcisPodUser.objects.filter(tenant_id=tenant_id).delete()
        OcisPodUser.objects.bulk_create(rows, batch_size=500)


def merge_pod_users(tenant_id, new_records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    user_map = {u.get("username", "").upper(): dict(u) for u in load_pod_users(tenant_id) if u.get("username")}
    for rec in new_records:
        uname = rec.get("username", "").upper()
        if not uname:
            continue
        if uname in user_map:
            prev = user_map[uname]
            for k, v in rec.items():
                if k == "id":
                    continue  # preserve existing ID; reassigned below
                if v not in (None, "", [], 0) or k not in prev:
                    prev[k] = v
        else:
            user_map[uname] = rec

    # Always reassign sequential IDs after merge to prevent collisions
    merged = list(user_map.values())
    for seq, user in enumerate(merged, start=1):
        user["id"] = f"USR-HCM-{seq:04d}"
    save_pod_users(tenant_id, merged)
    return merged
