# NCA ECC / CCC assessment for Oracle Cloud Infrastructure

Read-only assessment of the OCI tenancy registered as a provider in the platform (credentials come from the
database, the same encrypted secret the platform scans use; `--provider-id` / `provider_id` selects one when several
exist). When no usable provider exists it falls back to `~/.oci/config` (`NCA_OCI_CONFIG_FILE`, `NCA_OCI_PROFILE`) for
development machines. Frameworks bundled in
`prowler/compliance/oraclecloud/`:

| key | source file | controls |
|---|---|---|
| `nca_ecc_2.2024` | `nca_ecc_2.2024_oraclecloud.json` | 110 |
| `nca_ecc_1.2018` | `nca_ecc_1.2018_oraclecloud.json` | 114 |
| `nca_ccc_2.2024` | `nca_cscc_1.2024_oraclecloud.json` | 15 (Cloud *Tenant* controls only) |

The source files hold one entry per numbered control. The published ECC-2:2024 also defines ~92
sub-controls that these files do not contain; they are **not** invented here. CCC subdomains that
the real document assigns only to the Cloud Service Provider are likewise absent from the dataset.

## Run
```bash
cd backend
export PYTHONPATH=/d/security_platform:/d/security_platform/backend DJANGO_SETTINGS_MODULE=config.django.devel
.venv/Scripts/python.exe manage.py migrate nca --database admin        # once
.venv/Scripts/python.exe manage.py run_nca_assessment --json ../docs/nca/latest_assessment.json
#   --framework nca_ccc_2.2024   (repeatable)   --profile PROFILE   --tenant-id UUID
```
Or press **Run read-only assessment** in the NCA view of the Compliance page (POST `/api/v1/nca/assessments`).
Tests (SQLite, no OCI access): `python -m django test nca --settings=nca.tests.settings`.

## Semantics
* Check status: `PASS`, `FAIL`, `MANUAL`, `NOT_APPLICABLE` (reason `NO_RESOURCES`), `ERROR`
  (reason `API_ERROR`, `PERMISSION_DENIED`, `NOT_EXECUTED`, `UNSUPPORTED`).
  Prowler services swallow API errors into logs; the engine captures them so a permission failure is
  `ERROR`, never "no resources" and never `PASS`. Incomplete collection can never produce `PASS`.
* Control status = worst mapped check (FAIL > ERROR > MANUAL > PASS). `MANUAL` is reserved for controls that
  cannot be scanned through the OCI API (policies, reviews, HR, governance...). A scanned control whose checks all
  pass is `PASS` (reason `PARTIAL_AUTOMATION` notes the result covers the technical part). A control whose checks
  all found no resources (or could not be read) is "not tested" (`NOT_APPLICABLE` / `ERROR`). Any failing check
  fails the control; approved evidence cannot hide it.
* Controls without a mapped check are `MANUAL` with the reason they cannot be scanned (policy, review, HR...).
* **Coverage** (controls with a verdict, automated coverage) is reported separately from **pass rate**.
* Mapping: Prowler's own `Checks` arrays are used unchanged; `backend/nca/supplement_mapping.json`
  adds clearly-labelled `platform-supplement` check-to-control links plus two native checks
  (`oci_volume_backup_policy_assigned`, `oci_vss_host_scan_enabled`).

## Manual controls
Evidence (text, URL, file ≤10 MB, sha256 stored) → reviewer decision (`approved` / `rejected` /
`not_applicable`; comment required for the last two). Segregation of duties: the submitter cannot
review. New evidence resets the control to pending. Comments, history and an append-only audit log are kept.

## Remediation (off by default)
Only 3 automated fixers exist (bucket versioning, bucket public access, tenancy audit retention);
everything else shows the manual instructions from the check metadata. Execution requires:
`NCA_REMEDIATION_ENABLED=true` on the server, a prior dry-run (<24 h), the confirmation phrase
`APPLY <check_id> <resource_id>`, a written justification, and no drift since the dry-run. Before/after
state is stored, the change is re-read and verified, and everything is audit-logged.

## API (`/api/v1/nca/`)
`frameworks`, `assessments` (GET/POST), `assessments/latest`, `assessments/<id>/{controls,checks,findings,report?fmt=csv|json|md|html|text}`,
`controls/<fw>/<id>` + `/evidence` `/review` `/comments`, `evidence/<id>/download`,
`remediations` + `/dry-run` `/execute`, `audit-log`.
