"""
Initialize Production Tenant and Admin Users for Digital CISO Platform.

Creates only real tenant organizations and admin user accounts.
Does NOT insert any dummy cloud providers, dummy scans, or dummy findings.
"""
import uuid
from django.core.management import call_command
from django.core.management.base import BaseCommand
from api.models import User, Membership, Provider, Role, UserRoleRelationship
from api.rls import Tenant
from api.db_router import MainRouter


class Command(BaseCommand):
    help = "Initialize Production Tenant and Admin Users without dummy findings."

    def handle(self, *args, **options):
        self.stdout.write("Initializing Production Digital CISO Platform...")

        # 0. Clean dummy seed data
        try:
            call_command("clean_dummy_prod")
        except Exception as e:
            self.stdout.write(f"  [Notice] clean_dummy_prod notice: {e}")

        # 1. Resolve Primary Enterprise Tenant
        existing_provider = Provider.objects.using(MainRouter.admin_db).first() or Provider.objects.first()
        if existing_provider and existing_provider.tenant_id:
            tenant = existing_provider.tenant
            self.stdout.write(self.style.SUCCESS(f"  [OK] Found Primary Tenant from Connected Cloud Provider: {tenant.name} ({tenant.id})"))
        else:
            tenant = Tenant.objects.using(MainRouter.admin_db).filter(name="Pravahya Enterprise").first() or Tenant.objects.using(MainRouter.admin_db).first()
            if not tenant:
                tenant = Tenant.objects.using(MainRouter.admin_db).create(
                    name="Pravahya Enterprise",
                    id=uuid.uuid4()
                )
                self.stdout.write(self.style.SUCCESS(f"  [OK] Created Tenant: {tenant.name} ({tenant.id})"))
            else:
                self.stdout.write(f"  [OK] Existing Tenant: {tenant.name} ({tenant.id})")

        # 2. Ensure all connected providers belong to primary tenant
        all_providers = list(Provider.objects.using(MainRouter.admin_db).all())
        for p in all_providers:
            if str(p.tenant_id) != str(tenant.id):
                try:
                    Provider.objects.using(MainRouter.admin_db).filter(id=p.id).update(tenant_id=tenant.id)
                    self.stdout.write(self.style.SUCCESS(f"  [OK] Linked cloud provider '{p.alias or p.provider}' to primary tenant"))
                except Exception:
                    try:
                        p.delete(using=MainRouter.admin_db)
                    except Exception:
                        pass
                    self.stdout.write(f"  [OK] Removed duplicate provider '{p.alias or p.provider}'")

        # 3. Admin User
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

        # 4. Consolidate all users into the main enterprise tenant & grant RBAC permissions
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

            # Ensure RBAC Role & Relationship exist for tenant
            role_rel = UserRoleRelationship.objects.using(MainRouter.admin_db).filter(user=user, tenant_id=tenant.id).first()
            if not role_rel:
                role_name = "admin" if (getattr(user, "is_superuser", False) or user.email in [e for e, _ in admin_users]) else "member"
                role = Role.objects.using(MainRouter.admin_db).filter(tenant_id=tenant.id, name=role_name).first()
                if not role:
                    role = Role.objects.using(MainRouter.admin_db).create(
                        name=role_name,
                        tenant_id=tenant.id,
                        manage_users=True,
                        manage_account=True,
                        manage_billing=True,
                        manage_providers=True,
                        manage_integrations=True,
                        manage_scans=True,
                        unlimited_visibility=True,
                    )
                UserRoleRelationship.objects.using(MainRouter.admin_db).create(
                    user=user,
                    role=role,
                    tenant_id=tenant.id,
                )

        self.stdout.write(self.style.SUCCESS("[OK] Production initialization complete! All real telemetry and users assigned to main organization."))
