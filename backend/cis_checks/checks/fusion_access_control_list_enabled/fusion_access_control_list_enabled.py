from cis_checks.base import ManualCheck


class fusion_access_control_list_enabled(ManualCheck):
    """CIS 2.3: needs OCI tenancy access; not evaluable through the identity domain API."""
