from cis_checks.base import ManualCheck


class oci_fusion_admins_scoped_to_fusion_resources(ManualCheck):
    """CIS 1.4: needs OCI tenancy access; not evaluable through the identity domain API."""
