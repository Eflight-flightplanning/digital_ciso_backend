"""Run the CIS Oracle SaaS assessment for one tenant from the command line (for example from a scheduler)."""
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError

from oracle_cis import services


class Command(BaseCommand):
    help = "Run the CIS Oracle SaaS assessment for a tenant and print the summary."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True, help="Tenant id (UUID)")

    def handle(self, *args, **opts):
        try:
            run = services.start_run(opts["tenant"], user="command", trigger="command")
        except IntegrityError as exc:
            raise CommandError("An assessment is already running for this tenant.") from exc
        run = services.execute_run(run.id)
        c = run.counts
        self.stdout.write(
            f"Run {run.id} {run.status}: {c.get('tested', 0)} controls tested by the tool (PASS {c.get('PASS', 0)}, "
            f"FAIL {c.get('FAIL', 0)}, could not complete {c.get('not_completed', 0)}), {c.get('manual_controls', 0)} manual controls."
        )
        if run.error:
            raise CommandError(run.error)
