"""Clear a user's authenticator, for a lost phone. Confirm who they are first.

They set up a new authenticator at their next sign-in.
"""
from django.core.management.base import BaseCommand, CommandError

from api.db_router import MainRouter
from api.models import User, UserMfa


class Command(BaseCommand):
    help = "Remove a user's authenticator so they enrol again at next sign-in."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)

    def handle(self, *args, **opts):
        user = User.objects.using(MainRouter.admin_db).filter(email__iexact=opts["email"]).first()
        if user is None:
            raise CommandError("No user with that email.")
        UserMfa.objects.using(MainRouter.admin_db).filter(user=user).delete()
        self.stdout.write(self.style.SUCCESS("Authenticator removed."))
