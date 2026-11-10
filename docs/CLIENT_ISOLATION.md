# Keeping clients apart

How identity, the database and files keep one client's data away from another's.
Microsoft Entra, per-client encryption keys and Azure Blob Storage come later.

## Database

The app connects as `ciso_app`, an ordinary login that row-level security applies to.
`postgres` is only for migrations and the sign-in lookups that happen before a client is known.
Never point `POSTGRES_USER` at a superuser: superusers skip every rule without any warning.

| Setting in `backend/.env` | Holds |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD` | The app login (`ciso_app`) |
| `POSTGRES_ADMIN_USER`, `POSTGRES_ADMIN_PASSWORD` | The admin login (`postgres`) |

Set up a database, then prove it is safe:

```powershell
python manage.py setup_app_db_role
python manage.py migrate --database admin
python manage.py verify_tenant_isolation
```

Run `verify_tenant_isolation` after any change to tables. It fails if the app login can skip the
rules, if a table with a `tenant_id` has no rules, or if any row shows up for the wrong client.

### Writing code

- A request is scoped automatically from its signed token (`api/tenant_scope.py`), and the scope
  is cleared when the request ends.
- Background threads and management commands start with no client and see nothing. Wrap the work:

  ```python
  from api.tenant_scope import tenant_scope

  with tenant_scope(tenant_id):
      run_the_work()
  ```

- `.using(MainRouter.admin_db)` skips the rules. Keep it to sign-in and account creation.
- A new client table needs rules. Add it to a migration like `api/migrations/0108_tenant_rls_gaps.py`.

## Identity

- Sign-up is by invitation only. `DJANGO_SIGNUP_ENABLED` is off by default.
- An invitation link is `/sign-up?invitation_token=<token>`.
- An authenticator app is required at every sign-in. `ENABLE_MFA=false` only counts when `DEBUG` is on.
- Each person sets up their authenticator at their first sign-in. The key is encrypted at rest and
  each code works once. Five wrong codes lock the check for 15 minutes.
- Lost phone: confirm who they are, then run `python manage.py reset_user_mfa --email <email>`.
- A user with no client cannot sign in. They are never added to a client automatically.

## Oracle Fusion users

These now live in the `oracle_cis_pod_user` table, per client. `api/real_pod_users.json` is no longer
read. To load a file for a client:

```powershell
python manage.py import_pod_users --tenant <client id> --file <path to json>
```

## Files

`api/client_storage.py` is the only place that touches client files. Each client has its own area,
locally `backend/client_files/<client id>/` (change it with the `CLIENT_FILES_DIR` setting). To
move to Azure Blob Storage, add a class with the same methods and return it from `get_storage()`.

Scan reports are still written to `DJANGO_TMP_OUTPUT_DIRECTORY/<client id>/<scan id>/`.

## Tests

```powershell
python -m django test oracle_cis --settings=oracle_cis.tests.settings
python -m django test nca --settings=nca.tests.settings
python manage.py verify_tenant_isolation
```

The first two run without PostgreSQL. The third is what checks the database rules.
