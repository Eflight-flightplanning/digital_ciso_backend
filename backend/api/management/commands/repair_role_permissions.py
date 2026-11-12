"""
Repair RBAC roles whose stored permission flags contradict their purpose.

  * Roles named as read-only (auditor / viewer / read-only) lose every
    manage_* write flag. (Enforcement already ignores those flags; this makes
    the stored data match.)
  * With --demote-members, roles named exactly "member" lose admin rights
    (users / account / billing / providers / integrations) and keep manage_scans.

Dry run by default; pass --apply to write.

    python manage.py repair_role_permissions
    python manage.py repair_role_permissions --apply
    python manage.py repair_role_permissions --demote-members --apply
"""

from api.db_router import MainRouter
from api.models import Role, UserRoleRelationship
from api.rbac.read_only import WRITE_PERMISSION_FIELDS, role_name_is_read_only
from django.core.management.base import BaseCommand
from django.db import transaction

MEMBER_ADMIN_FIELDS = tuple(f for f in WRITE_PERMISSION_FIELDS if f != "manage_scans")


class Command(BaseCommand):
    help = "Strip write permissions from read-only roles (and optionally admin rights from 'member' roles)."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Write the changes (default: dry run).")
        parser.add_argument(
            "--demote-members",
            action="store_true",
            help="Also remove admin rights from roles named 'member' (keeps manage_scans).",
        )

    def handle(self, *args, **options):
        apply = options["apply"]
        changes = []

        for role in Role.objects.using(MainRouter.admin_db).all():
            if role_name_is_read_only(role.name):
                fields = [f for f in WRITE_PERMISSION_FIELDS if getattr(role, f, False)]
            elif options["demote_members"] and (role.name or "").strip().lower() == "member":
                fields = [f for f in MEMBER_ADMIN_FIELDS if getattr(role, f, False)]
            else:
                continue
            if fields:
                changes.append((role, fields))

        if not changes:
            self.stdout.write(self.style.SUCCESS("No roles need repair."))
            return

        for role, fields in changes:
            users = UserRoleRelationship.objects.using(MainRouter.admin_db).filter(role=role).count()
            self.stdout.write(
                f"  {role.name!r} (tenant {role.tenant_id}, {users} user(s)): clear {', '.join(fields)}"
            )

        if not apply:
            self.stdout.write(self.style.WARNING(f"Dry run: {len(changes)} role(s) would change. Re-run with --apply."))
            return

        with transaction.atomic(using=MainRouter.admin_db):
            for role, fields in changes:
                for f in fields:
                    setattr(role, f, False)
                role.save(using=MainRouter.admin_db, update_fields=list(fields))
        self.stdout.write(self.style.SUCCESS(f"Repaired {len(changes)} role(s)."))
