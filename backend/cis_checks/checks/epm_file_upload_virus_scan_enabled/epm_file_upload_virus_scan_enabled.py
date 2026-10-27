from cis_checks.base import ManualCheck


class epm_file_upload_virus_scan_enabled(ManualCheck):
    """CIS 4.4: needs EPM Cloud access; not evaluable through the identity domain API."""
