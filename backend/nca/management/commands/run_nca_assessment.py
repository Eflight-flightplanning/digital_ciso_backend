from django.core.management.base import BaseCommand, CommandError

from nca.catalog import FRAMEWORK_FILES
from nca.engine import run_assessment


class Command(BaseCommand):
    help = ("Run a READ-ONLY NCA ECC / NCA CCC assessment against the OCI provider registered in the platform "
            "(credentials from the database); falls back to ~/.oci/config / NCA_OCI_CONFIG_FILE when none can be used.")

    def add_arguments(self, parser):
        parser.add_argument("--framework", action="append", choices=sorted(FRAMEWORK_FILES),
                            help="Framework key (repeatable). Default: all.")
        parser.add_argument("--profile", help="OCI config profile (default DEFAULT / NCA_OCI_PROFILE)")
        parser.add_argument("--config-file", help="Path to OCI config file")
        parser.add_argument("--tenant-id", help="Platform tenant UUID to own the assessment")
        parser.add_argument("--provider-id", help="Platform OCI provider UUID (when several are registered)")
        parser.add_argument("--json", dest="json_path", help="Also write the full JSON report to this path")

    def handle(self, *args, **opts):
        a = run_assessment(frameworks=opts["framework"], profile=opts["profile"], tenant_id=opts["tenant_id"],
                           triggered_by="cli", config_file=opts["config_file"],
                           provider_id=opts["provider_id"])
        if a.status != "completed":
            raise CommandError(f"Assessment {a.id} failed: {a.error}")
        from nca.reports import build_report, render_text
        report = build_report(a)
        self.stdout.write(render_text(report))
        if opts["json_path"]:
            import json
            with open(opts["json_path"], "w", encoding="utf-8") as fh:
                json.dump(report, fh, indent=2, default=str)
            self.stdout.write(f"JSON report written to {opts['json_path']}")
        self.stdout.write(f"Assessment id: {a.id}")
