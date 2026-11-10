# Client file storage

Every client has its own storage area for evidence, test reports and uploaded documents.
Locally that is a folder. In Azure it is a private Blob Storage container.

Status: the code and its tests are complete. **Nothing has been created in Azure and the Azure
backend has never run against a real storage account.** The Azure tests use in-memory stand-ins.

## How it works

| Piece | Where | What it does |
|---|---|---|
| Storage backends | `backend/api/client_storage.py`, `client_storage_azure.py` | Same methods for a local folder or an Azure container. `CLIENT_STORAGE_BACKEND` picks one |
| Provisioning | `client_store/service.py` `provision`, `deprovision` | Creates the container (and key and encryption scope) when a client is created. Removes them when the client is deleted |
| File access layer | `client_store/service.py` `ClientFiles` | Upload, list, read, delete. Checks the client and the user's membership every time |
| Database records | `client_store/models.py` | `client_store_container` (one per client), `client_store_file` (one per file, always with `tenant_id`). Both have row-level security |
| API | `client_store/views.py` | `GET/POST /api/v1/client-files`, `GET/DELETE /api/v1/client-files/{id}` |

Naming: container, encryption scope and Key Vault key are all `client-<client uuid>`. The id is the
client's permanent internal id, so a rename changes nothing and the name reveals nothing.

## What keeps clients apart

1. **The client comes from the sign-in.** No address, form field or query names a client or a container. Anything like that in a request is ignored.
2. **Membership is checked on every operation.** `ClientFiles(tenant_id, user)` refuses a missing client, a missing user, and a user who is not a member.
3. **Files are found by database id, within the caller's client.** Another client's file id returns "not found".
4. **Row-level security.** Under the app's database login, rows of another client are invisible even if code forgets a filter.
5. **Keys are validated.** A blob key must match a strict pattern, so `..`, `/`, `?` and backslashes cannot reach another container.
6. **Per-client encryption (Azure).** Each container is locked to its client's encryption scope and key.

## Azure setup

Approval is needed before any of this is run: it creates paid resources.

1. Prerequisites: a virtual network with a subnet for private endpoints, the private DNS zone
   `privatelink.blob.core.windows.net` linked to it, a Key Vault with **purge protection** and
   **RBAC authorization**, a Log Analytics workspace, and the app's managed identity.
2. Review and deploy `infra/client-storage/main.bicep`:
   ```bash
   az deployment group what-if -g <resource group> -f infra/client-storage/main.bicep -p storageAccountName=<name> appPrincipalId=<id> privateEndpointSubnetId=<id> blobPrivateDnsZoneId=<id> keyVaultName=<name> logAnalyticsWorkspaceId=<id>
   ```
   Run `what-if` first and read the result. Then the same command with `create` instead of `what-if`.
3. App settings (none of these is a secret):
   ```
   CLIENT_STORAGE_BACKEND=azure
   AZURE_STORAGE_ACCOUNT_URL=https://<name>.blob.core.windows.net
   AZURE_STORAGE_MANAGED_IDENTITY_CLIENT_ID=<only for a user-assigned identity>
   AZURE_STORAGE_KEY_VAULT_URL=https://<vault>.vault.azure.net
   AZURE_STORAGE_SUBSCRIPTION_ID=<id>
   AZURE_STORAGE_RESOURCE_GROUP=<resource group>
   ```
   The app refuses to start storage if `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_KEY`,
   `AZURE_STORAGE_ACCOUNT_KEY`, `AZURE_STORAGE_ACCESS_KEY` or `AZURE_STORAGE_SAS_TOKEN` is set.
4. Database: `python manage.py migrate --database admin`
5. Existing clients: `python manage.py save_client_reports` creates each client's container and
   saves reports of finished tests. Evidence files uploaded before the switch must be copied
   from `backend/client_files/<client id>/evidence/` into the matching container, keeping the names.

What the template sets: public blob access off, account keys off, public network off with a private
endpoint, TLS 1.2, soft delete, diagnostic logs, an alert on refused requests, and least-privilege roles.

## First checks in Azure (not done yet)

- Create two test clients. Confirm two containers, two keys and two encryption scopes exist.
- Upload as each, then repeat the cross-client checks from `client_store/tests/test_files.py` by hand.
- Confirm a request with an account key is refused by Azure itself (`allowSharedKeyAccess: false`).
- Confirm the storage address does not resolve from outside the network.
- Delete a test client. Confirm the container is gone, the scope is disabled and the key is deleted.

## Deleting a client

Deleting the client removes its container, disables its encryption scope and deletes its key.
No immutability policy or legal hold is used, because either would block this.

Two delays are built into Azure and should be stated in the client contract:
- Soft delete keeps a deleted container restorable for `softDeleteDays` (default 7).
- Key Vault purge protection keeps a deleted key recoverable for the vault's retention period.
  Customer-managed keys require purge protection, so this cannot be turned off.

## Known gaps

- **Lifecycle rule:** Azure lifecycle prefixes start with the container name, so one rule cannot say
  "the `reports/` folder of every container". The template uses a blob index tag `category=reports`
  instead, and the app does not set that tag yet. Until it does, the rule matches nothing.
- **Large files:** downloads are read into memory. Fine for the 10 MB upload limit and current reports.
- **Scope creation rights:** the app's identity can create encryption scopes and keys. A stricter
  design moves provisioning to a separate identity used only at onboarding.
- **Cloud scan worker:** saving a cloud scan's report runs in the worker, which has not been run locally.

## Tests

```bash
python -m django test client_store --settings=client_store.tests.settings
python manage.py verify_tenant_isolation
```

The first runs every cross-client test against both the local and the Azure backend (in memory).
The second proves row-level security on the real database with the app's own login.
