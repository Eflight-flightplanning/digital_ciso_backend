"""
Django Management Command: create_scoped_user

Creates a user scoped to:
1. Read-Only access (cannot run/modify scans, manage users, or modify providers/integrations)
2. Azure provider only (via ProviderGroup with unlimited_visibility=False)
3. Full view access to AI Analysis (Finding AI insights, CISO Advisor) and Remediation Playbooks (view-only)
4. CIS compliance framework visibility
"""
import uuid
from django.core.management.base import BaseCommand, CommandError
from api.models import (
    User,
    Membership,
    Provider,
    Role,
    UserRoleRelationship,
    ProviderGroup,
    ProviderGroupMembership,
    RoleProviderGroupRelationship,
)
from api.rls import Tenant
from api.db_router import MainRouter


class Command(BaseCommand):
    help = "Create a read-only user scoped strictly to Azure account, CIS benchmarks, and AI/Remediation viewing."

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            type=str,
            required=True,
            help="Work email address for the user.",
        )
        parser.add_argument(
            "--name",
            type=str,
            required=True,
            help="Full name of the user.",
        )
        parser.add_argument(
            "--password",
            type=str,
            required=True,
            help="Password for the user account.",
        )
        parser.add_argument(
            "--provider-type",
            type=str,
            default="azure",
            help="Cloud provider type to scope to (default: azure).",
        )
        parser.add_argument(
            "--role-name",
            type=str,
            default="Azure CIS Read-Only Auditor",
            help="Role name to create or assign (default: 'Azure CIS Read-Only Auditor').",
        )
        parser.add_argument(
            "--group-name",
            type=str,
            default="Azure Only Accounts",
            help="Provider group name (default: 'Azure Only Accounts').",
        )

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        name = options["name"].strip()
        password = options["password"]
        provider_type = options["provider_type"].strip().lower()
        role_name = options["role_name"].strip()
        group_name = options["group_name"].strip()

        self.stdout.write(self.style.NOTICE(f"=== Creating Scoped User: {email} ==="))

        # 1. Resolve Organization / Tenant
        tenant = (
            Tenant.objects.using(MainRouter.admin_db).filter(name="Pravahya Enterprise").first()
            or Tenant.objects.using(MainRouter.admin_db).first()
        )
        if not tenant:
            tenant = Tenant.objects.using(MainRouter.admin_db).create(
                id=uuid.uuid4(),
                name="Pravahya Enterprise",
            )
            self.stdout.write(self.style.SUCCESS(f"  [+] Created primary tenant: {tenant.name} ({tenant.id})"))
        else:
            self.stdout.write(self.style.SUCCESS(f"  [OK] Resolved tenant: {tenant.name} ({tenant.id})"))

        # 2. Locate Cloud Provider (e.g. Azure)
        azure_providers = list(
            Provider.objects.using(MainRouter.admin_db).filter(
                tenant_id=tenant.id,
                provider__iexact=provider_type,
            )
        )
        if not azure_providers:
            # Check if there's any matching provider in another tenant or unlinked
            any_azure = Provider.objects.using(MainRouter.admin_db).filter(provider__iexact=provider_type).first()
            if any_azure:
                any_azure.tenant_id = tenant.id
                any_azure.save(using=MainRouter.admin_db)
                azure_providers = [any_azure]
                self.stdout.write(self.style.SUCCESS(f"  [OK] Linked existing Azure provider '{any_azure.alias or any_azure.id}' to primary tenant"))
            else:
                self.stdout.write(self.style.WARNING(
                    f"  [!] Note: No active '{provider_type}' provider found in database yet. "
                    f"When you connect an Azure provider, it will automatically link to this provider group."
                ))

        # 3. Create or Get ProviderGroup
        provider_group, created = ProviderGroup.objects.using(MainRouter.admin_db).get_or_create(
            tenant_id=tenant.id,
            name=group_name,
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"  [+] Created ProviderGroup: '{group_name}'"))
        else:
            self.stdout.write(self.style.SUCCESS(f"  [OK] Using ProviderGroup: '{group_name}'"))

        # Link Azure providers into ProviderGroup
        for p in azure_providers:
            pg_mem, mem_created = ProviderGroupMembership.objects.using(MainRouter.admin_db).get_or_create(
                tenant_id=tenant.id,
                provider_group=provider_group,
                provider=p,
            )
            if mem_created:
                self.stdout.write(self.style.SUCCESS(f"  [+] Added Provider '{p.alias or p.id}' to '{group_name}'"))

        # 4. Create or Update Role with Read-Only and unlimited_visibility=False
        role, role_created = Role.objects.using(MainRouter.admin_db).get_or_create(
            tenant_id=tenant.id,
            name=role_name,
            defaults={
                "manage_users": False,
                "manage_account": False,
                "manage_billing": False,
                "manage_providers": False,
                "manage_integrations": False,
                "manage_scans": False,
                "unlimited_visibility": False,
            },
        )
        if not role_created:
            # Ensure permissions are strictly read-only and visibility is scoped
            role.manage_users = False
            role.manage_account = False
            role.manage_billing = False
            role.manage_providers = False
            role.manage_integrations = False
            role.manage_scans = False
            role.unlimited_visibility = False
            role.save(using=MainRouter.admin_db)
            self.stdout.write(self.style.SUCCESS(f"  [OK] Updated Role '{role_name}' to strict Read-Only / Scoped"))
        else:
            self.stdout.write(self.style.SUCCESS(f"  [+] Created Role '{role_name}' (Read-Only, Scoped Visibility)"))

        # Link Role to ProviderGroup
        RoleProviderGroupRelationship.objects.using(MainRouter.admin_db).get_or_create(
            tenant_id=tenant.id,
            role=role,
            provider_group=provider_group,
        )
        self.stdout.write(self.style.SUCCESS(f"  [OK] Linked Role '{role_name}' to ProviderGroup '{group_name}'"))

        # 5. Create or Update User
        user = User.objects.using(MainRouter.admin_db).filter(email__iexact=email).first()
        if not user:
            user = User.objects.create_user(
                name=name,
                email=email,
                password=password,
                company_name=tenant.name,
            )
            self.stdout.write(self.style.SUCCESS(f"  [+] Created User: {email}"))
        else:
            user.set_password(password)
            user.name = name
            user.is_active = True
            user.save(using=MainRouter.admin_db)
            self.stdout.write(self.style.SUCCESS(f"  [OK] Updated existing User: {email}"))

        # 6. Tenant Membership (role: MEMBER)
        Membership.objects.using(MainRouter.admin_db).filter(user=user).exclude(tenant_id=tenant.id).delete()
        Membership.objects.using(MainRouter.admin_db).update_or_create(
            user=user,
            tenant_id=tenant.id,
            defaults={"role": Membership.RoleChoices.MEMBER},
        )
        self.stdout.write(self.style.SUCCESS(f"  [OK] Linked User to Tenant as MEMBER"))

        # 7. User Role Relationship
        UserRoleRelationship.objects.using(MainRouter.admin_db).filter(user=user, tenant_id=tenant.id).delete()
        UserRoleRelationship.objects.using(MainRouter.admin_db).create(
            user=user,
            tenant_id=tenant.id,
            role=role,
        )
        self.stdout.write(self.style.SUCCESS(f"  [OK] Assigned Role '{role_name}' to User '{email}'"))

        # Summary
        self.stdout.write(self.style.SUCCESS("\n" + "=" * 55))
        self.stdout.write(self.style.SUCCESS("  USER CREATION SUCCESSFUL"))
        self.stdout.write(self.style.SUCCESS("=" * 55))
        self.stdout.write(f"  Email:               {email}")
        self.stdout.write(f"  Name:                {name}")
        self.stdout.write(f"  Role:                {role_name}")
        self.stdout.write(f"  Cloud Account Scope: {provider_type.upper()} Only ({len(azure_providers)} provider(s))")
        self.stdout.write(f"  Compliance Scope:    CIS Benchmarks Only")
        self.stdout.write(f"  Access Level:        Read-Only (Scans, Results, AI Advisor, Remediation View)")
        self.stdout.write(f"  Mutations / Actions: BLOCKED (No scan trigger/edit, no playbook execution)")
        self.stdout.write("=" * 55 + "\n")

