"""Copy an Oracle Fusion users JSON file into the database for one client. Leaves the file alone."""
import json

from django.core.management.base import BaseCommand, CommandError

from api.tenant_scope import tenant_scope
from oracle_cis.pod_users import load_pod_users, save_pod_users


class Command(BaseCommand):
    help = "Import a pod users JSON file for one client."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True, help="Client (tenant) id that owns these users")
        parser.add_argument("--file", required=True, help="Path to the JSON file")
        parser.add_argument("--replace", action="store_true", help="Replace users this client already has")

    def handle(self, *args, **opts):
        with open(opts["file"], encoding="utf-8-sig") as fp:
            users = json.load(fp)
        if not isinstance(users, list):
            raise CommandError("Expected a list of users.")
        with tenant_scope(opts["tenant"]):
            if load_pod_users(opts["tenant"]) and not opts["replace"]:
                raise CommandError("This client already has users. Use --replace to overwrite them.")
            save_pod_users(opts["tenant"], users)
            count = len(load_pod_users(opts["tenant"]))
        self.stdout.write(self.style.SUCCESS(f"{count} users saved for client {opts['tenant']}."))
