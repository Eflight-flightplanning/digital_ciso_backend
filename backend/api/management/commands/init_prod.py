"""
Initialize Production Tenant and Admin Users for Digital CISO Platform.

Creates only real tenant organizations and admin user accounts.
Does NOT insert any dummy cloud providers, dummy scans, or dummy findings.
"""
import uuid
from django.core.management.base import BaseCommand
from api.models import User, Membership
from api.rls import Tenant


class Command(BaseCommand):
    help = "Initialize Production Tenant and Admin Users without dummy findings."

    def handle(self, *args, **options):
        self.stdout.write("Initializing Production Digital CISO Platform...")

        # 1. Tenant
        tenant, created = Tenant.objects.get_or_create(
            name="Pravahya Enterprise",
            defaults={"id": uuid.uuid4()}
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"  [OK] Created Tenant: {tenant.name} ({tenant.id})"))
        else:
            self.stdout.write(f"  [OK] Existing Tenant: {tenant.name} ({tenant.id})")

        # 2. Admin Users
        admin_users = [
            ("digitalciso@eflight.aero", "Digital CISO Admin"),
            ("alex.ciso@eflight.aero", "Alex CISO"),
            ("akhilesh.merugu@pravahya.com", "Akhilesh Merugu"),
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

            Membership.objects.get_or_create(
                tenant=tenant,
                user=u,
                defaults={"role": Membership.RoleChoices.OWNER}
            )

        self.stdout.write(self.style.SUCCESS("✓ Production initialization complete! All real telemetry ready."))
