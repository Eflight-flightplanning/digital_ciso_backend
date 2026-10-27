from cis_checks.base import ManualCheck


class oci_logging_pipelines_monitored(ManualCheck):
    """CIS 3.5: needs OCI tenancy access; not evaluable through the identity domain API."""
