"""
Initialize Production Tenant and Admin Users for Digital CISO Platform.

Creates only real tenant organizations and admin user accounts.
Does NOT insert any dummy cloud providers, dummy scans, or dummy findings.
"""
import uuid
from django.core.management.base import BaseCommand
from api.models import User, Membership
from api.rls import Tenant
from api.db_router import MainRouter


class Command(BaseCommand):
    help = "Initialize Production Tenant and Admin Users without dummy findings."

    def handle(self, *args, **options):
        self.stdout.write("Initializing Production Digital CISO Platform...")

        # 1. Tenant
        tenant, created = Tenant.objects.using(MainRouter.admin_db).get_or_create(
            name="Pravahya Enterprise",
            defaults={"id": uuid.uuid4()}
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"  [OK] Created Tenant: {tenant.name} ({tenant.id})"))
        else:
            self.stdout.write(f"  [OK] Existing Tenant: {tenant.name} ({tenant.id})")

        # 2. Admin User
        admin_users = [
            ("digitalciso@eflight.aero", "Digital CISO Admin"),
        ]

        for user_email, user_name in admin_users:
            u = User.objects.filter(email=user_email).first()
            if not u:
                u = User.objects.create_user(
                    name=user_name,
                    email=user_email,
                    password="Admin1234!",
                    company_name="Pravahya Enterprise",
                )
                self.stdout.write(self.style.SUCCESS(f"  [OK] Created Admin user: {user_email} / Admin1234!"))
            else:
                u.set_password("Admin1234!")
                u.save()
                self.stdout.write(f"  [OK] Updated Admin user password: {user_email} / Admin1234!")

        # 3. Consolidate all users into the main enterprise tenant
        all_users = User.objects.using(MainRouter.admin_db).all()
        for user in all_users:
            memberships = list(Membership.objects.using(MainRouter.admin_db).filter(user=user))
            target_mem = next((m for m in memberships if str(m.tenant_id) == str(tenant.id)), None)

            if target_mem:
                for m in memberships:
                    if m.id != target_mem.id:
                        m.delete(using=MainRouter.admin_db)
                self.stdout.write(self.style.SUCCESS(f"  [OK] User {user.email} verified in primary tenant: {tenant.name}"))
            elif memberships:
                first_mem = memberships[0]
                first_mem.tenant_id = tenant.id
                first_mem.save(using=MainRouter.admin_db)
                for m in memberships[1:]:
                    m.delete(using=MainRouter.admin_db)
                self.stdout.write(self.style.SUCCESS(f"  [OK] Migrated user {user.email} membership to primary tenant: {tenant.name}"))
            else:
                Membership.objects.using(MainRouter.admin_db).create(
                    tenant_id=tenant.id,
                    user=user,
                    role=Membership.RoleChoices.OWNER if user.email in [e for e, _ in admin_users] else Membership.RoleChoices.MEMBER
                )
                self.stdout.write(self.style.SUCCESS(f"  [OK] Created membership for: {user.email}"))

        self.stdout.write(self.style.SUCCESS("[OK] Production initialization complete! All real telemetry and users assigned to main organization."))
