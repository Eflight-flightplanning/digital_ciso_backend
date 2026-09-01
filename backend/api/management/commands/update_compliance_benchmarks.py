import glob
import json
import logging
import os
from uuid import uuid4
from django.core.management.base import BaseCommand
from django.utils import timezone
from api.models import (
    ComplianceOverview,
    ComplianceOverviewSummary,
    ComplianceRequirementOverview,
    Finding,
    Provider,
    Scan,
    StatusChoices,
    Tenant,
)

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Update ComplianceRequirementOverview and ComplianceOverview records in database with expanded official control specifications."

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("Synchronizing Compliance Requirement Overviews across all tenants..."))
        
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))
        compliance_files = glob.glob(os.path.join(base_dir, "prowler", "compliance", "**", "*.json"), recursive=True)

        cro_mgr = getattr(ComplianceRequirementOverview, "all_objects", ComplianceRequirementOverview.objects)
        co_mgr = getattr(ComplianceOverview, "all_objects", ComplianceOverview.objects)
        cos_mgr = getattr(ComplianceOverviewSummary, "all_objects", ComplianceOverviewSummary.objects)
        scan_mgr = getattr(Scan, "all_objects", Scan.objects)
        tenant_mgr = getattr(Tenant, "all_objects", Tenant.objects)

        tenants = list(tenant_mgr.all())
        if not tenants:
            self.stdout.write(self.style.WARNING("No tenants found in database."))
            return

        total_created = 0
        total_frameworks = 0

        for json_path in compliance_files:
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception as e:
                continue

            compliance_id = os.path.splitext(os.path.basename(json_path))[0]
            framework_name = data.get("Name") or data.get("Framework") or compliance_id
            version = str(data.get("Version") or "")
            description = data.get("Description") or ""
            requirements = data.get("Requirements", [])
            provider_type = str(data.get("Provider") or "").lower()

            if not requirements:
                continue

            for tenant in tenants:
                # Find matching scans for this provider
                scans = scan_mgr.filter(tenant=tenant)
                if provider_type:
                    scans = scans.filter(provider__provider__iexact=provider_type)
                
                scans_list = list(scans)
                if not scans_list:
                    # Fall back to any scan for tenant if specific provider scan not present
                    fallback_scan = scan_mgr.filter(tenant=tenant).first()
                    if fallback_scan:
                        scans_list = [fallback_scan]

                for scan in scans_list:
                    # Delete old requirements for this scan + compliance_id
                    cro_mgr.filter(tenant=tenant, scan=scan, compliance_id=compliance_id).delete()

                    # Find existing finding checks for this scan to determine real pass/fail
                    failed_check_ids = set(
                        Finding.all_objects.filter(
                            tenant=tenant,
                            scan=scan,
                            status=StatusChoices.FAIL,
                        ).values_list("check_id", flat=True)
                    )

                    new_rows = []
                    passed_req_count = 0
                    failed_req_count = 0
                    seen_req_ids = set()

                    for req in requirements:
                        base_req_id = str(req.get("Id") or req.get("Name") or uuid4())
                        req_id = base_req_id
                        counter = 1
                        while req_id in seen_req_ids:
                            counter += 1
                            req_id = f"{base_req_id}_{counter}"
                        seen_req_ids.add(req_id)

                        checks = req.get("Checks", [])
                        total_checks = len(checks)
                        req_desc = str(req.get("Description") or req.get("Name") or description)
                        
                        # Determine if this requirement is Manual, Pass, or Fail
                        is_manual = (
                            total_checks == 0
                            or req.get("AssessmentType") == "Manual"
                            or req.get("Manual") is True
                        )
                        
                        if is_manual:
                            req_status = StatusChoices.MANUAL
                            pass_chk = 0
                            fail_chk = 0
                        else:
                            is_failed = any(c in failed_check_ids for c in checks)
                            if is_failed:
                                req_status = StatusChoices.FAIL
                                failed_req_count += 1
                                pass_chk = max(0, total_checks - 1)
                                fail_chk = 1
                            else:
                                req_status = StatusChoices.PASS
                                passed_req_count += 1
                                pass_chk = total_checks
                                fail_chk = 0

                        new_rows.append(
                            ComplianceRequirementOverview(
                                id=uuid4(),
                                tenant=tenant,
                                inserted_at=timezone.now(),
                                compliance_id=compliance_id,
                                framework=framework_name,
                                version=version,
                                description=req_desc,
                                region="global",
                                requirement_id=req_id,
                                requirement_status=req_status,
                                passed_checks=pass_chk,
                                failed_checks=fail_chk,
                                total_checks=total_checks,
                                passed_findings=pass_chk,
                                total_findings=total_checks,
                                scan=scan,
                            )
                        )

                    if new_rows:
                        cro_mgr.bulk_create(new_rows, batch_size=500, ignore_conflicts=True)
                        total_created += len(new_rows)
                        total_frameworks += 1

                        # Update ComplianceOverview
                        co_mgr.update_or_create(
                            tenant=tenant,
                            compliance_id=compliance_id,
                            scan=scan,
                            defaults={
                                "framework": framework_name,
                                "description": description,
                                "version": version,
                                "requirements_passed": passed_req_count,
                                "requirements_failed": failed_req_count,
                                "total_requirements": len(new_rows),
                            },
                        )

                        # Update ComplianceOverviewSummary
                        cos_mgr.filter(tenant=tenant, scan=scan, compliance_id=compliance_id).delete()
                        cos_mgr.create(
                            tenant=tenant,
                            scan=scan,
                            compliance_id=compliance_id,
                            requirements_passed=passed_req_count,
                            requirements_failed=failed_req_count,
                            requirements_manual=0,
                            total_requirements=len(new_rows),
                        )

                        self.stdout.write(f"  [SYNCED] {compliance_id} ({scan.provider.provider if scan.provider else 'all'}) -> {len(new_rows)} requirements ({passed_req_count} Pass, {failed_req_count} Fail)")

        self.stdout.write(self.style.SUCCESS(f"Successfully synchronized {total_created} Compliance Requirements across {total_frameworks} framework scans!"))
