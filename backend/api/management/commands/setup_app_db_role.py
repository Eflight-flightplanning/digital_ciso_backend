"""Create the database login the app runs as: one that row-level security applies to.

Run with the admin connection set up (POSTGRES_ADMIN_USER), and POSTGRES_USER / POSTGRES_PASSWORD
naming the app login. Safe to run again. Never prints the password.
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections
from psycopg2 import sql


class Command(BaseCommand):
    help = "Create the non-superuser app login, give it table access and point the security rules at it."

    def handle(self, *args, **opts):
        role = settings.DATABASES["default"]["USER"]
        password = settings.DATABASES["default"]["PASSWORD"]
        admin = settings.DATABASES["admin"]
        if role == admin["USER"]:
            raise CommandError("POSTGRES_USER must be a different login from POSTGRES_ADMIN_USER.")
        if not role.replace("_", "").isalnum():
            raise CommandError("POSTGRES_USER may only hold letters, digits and underscores.")

        with connections["admin"].cursor() as cursor:
            quoted = sql.Identifier(role).as_string(cursor.connection)
            owner = sql.Identifier(admin["USER"]).as_string(cursor.connection)
            literal = sql.Literal(password).as_string(cursor.connection)
            options = "LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE"
            cursor.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", [role])
            verb = "ALTER" if cursor.fetchone() else "CREATE"
            cursor.execute(f"{verb} ROLE {quoted} WITH {options} PASSWORD {literal}")

            cursor.execute("SELECT current_database()")
            database = sql.Identifier(cursor.fetchone()[0]).as_string(cursor.connection)
            cursor.execute(f"""
                GRANT CONNECT ON DATABASE {database} TO {quoted};
                GRANT USAGE ON SCHEMA public TO {quoted};
                GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {quoted};
                GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {quoted};
                REVOKE INSERT, UPDATE, DELETE ON django_migrations FROM {quoted};
                ALTER DEFAULT PRIVILEGES FOR ROLE {owner} IN SCHEMA public
                    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {quoted};
                ALTER DEFAULT PRIVILEGES FOR ROLE {owner} IN SCHEMA public
                    GRANT USAGE, SELECT ON SEQUENCES TO {quoted};
            """)

            # Existing rules name the login that ran the original migrations.
            cursor.execute("""
                SELECT tablename, policyname, roles FROM pg_policies WHERE schemaname = 'public'
                AND NOT %s = ANY(roles)
            """, [role])
            moved = 0
            for table, policy, roles in cursor.fetchall():
                old = roles[0]
                name = policy.replace(f"{old}_", f"{role}_", 1)[:63]
                cursor.execute(f'ALTER POLICY "{policy}" ON "{table}" TO {quoted}')
                if name != policy:
                    cursor.execute(f'ALTER POLICY "{policy}" ON "{table}" RENAME TO "{name}"')
                moved += 1
        self.stdout.write(self.style.SUCCESS(f"Login {role} ready; {moved} security rules moved to it."))
