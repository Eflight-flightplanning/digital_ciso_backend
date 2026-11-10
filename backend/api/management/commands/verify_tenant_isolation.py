"""Prove on the real database that one client cannot reach another client's rows.

Uses the app's own login. Everything it writes is rolled back. Exits with an error on any failure.
"""
import uuid

from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from api.tenant_scope import NO_CLIENT

GLOBAL_TABLES_WITH_TENANT = {"saml_domain_index"}  # looked up by email domain before sign-in


class Command(BaseCommand):
    help = "Check row-level security with the app's own database login."

    def handle(self, *args, **opts):
        failures = []
        admin = connections["admin"]
        default = connections["default"]

        with default.cursor() as cursor:
            cursor.execute("SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
            user, is_super, bypass = cursor.fetchone()
            self.stdout.write(f"App login: {user}, superuser={is_super}, bypasses rules={bypass}")
            if is_super or bypass:
                failures.append("The app login ignores row-level security.")

        with admin.cursor() as cursor:
            cursor.execute("""
                SELECT c.relname FROM pg_class c
                JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind IN ('r', 'p') AND n.nspname = 'public' AND NOT c.relispartition
                AND NOT c.relforcerowsecurity ORDER BY 1
            """)
            unprotected = [t for (t,) in cursor.fetchall() if t not in GLOBAL_TABLES_WITH_TENANT]
            if unprotected:
                failures.append(f"Client tables with no rules: {', '.join(unprotected)}")
            cursor.execute("""
                SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind IN ('r', 'p') AND n.nspname = 'public' AND c.relforcerowsecurity ORDER BY 1
            """)
            protected = [t for (t,) in cursor.fetchall()]
            cursor.execute("""
                SELECT tablename FROM pg_tables t WHERE schemaname = 'public' AND rowsecurity
                AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = t.tablename)
            """)
            ruleless = [t for (t,) in cursor.fetchall()]
            if ruleless:
                self.stdout.write(f"Tables that refuse everyone (no rules yet): {', '.join(ruleless)}")

        checked = 0
        with transaction.atomic(using="default"):
            with default.cursor() as cursor:
                cursor.execute("SELECT set_config('api.tenant_id', %s, TRUE), set_config('api.user_id', '', TRUE)", [NO_CLIENT])
                for table in protected:
                    if table == "tenants":
                        continue
                    cursor.execute(f'SELECT count(*) FROM "{table}"')
                    if cursor.fetchone()[0]:
                        failures.append(f"{table}: rows visible with no client chosen")
                    checked += 1

                cursor.execute("SELECT set_config('api.tenant_id', %s, TRUE)", [str(uuid.uuid4())])
                for table in protected:
                    if table == "tenants":
                        continue
                    cursor.execute(f'SELECT count(*) FROM "{table}"')
                    if cursor.fetchone()[0]:
                        failures.append(f"{table}: rows visible to an unrelated client")

                sid = transaction.savepoint(using="default")
                try:
                    cursor.execute("""INSERT INTO oracle_cis_pod_user (tenant_id, username, position, data, updated_at)
                                      VALUES (%s, 'X', 0, '{}', now())""", [str(uuid.uuid4())])
                    failures.append("oracle_cis_pod_user: a row for another client was written")
                except Exception:  # noqa: BLE001 - the refusal is the pass
                    pass
                transaction.savepoint_rollback(sid, using="default")
            transaction.set_rollback(True, using="default")

        self.stdout.write(f"Checked {checked} protected tables.")
        if failures:
            for failure in failures:
                self.stderr.write(f"FAIL: {failure}")
            raise CommandError(f"{len(failures)} isolation problem(s) found.")
        self.stdout.write(self.style.SUCCESS("All isolation checks passed."))
