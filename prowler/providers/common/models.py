class Audit_Metadata:
    def __init__(self, **kwargs):
        self.services_scanned = kwargs.get("services_scanned", 0)
        self.expected_checks = kwargs.get("expected_checks", [])
        self.completed_checks = kwargs.get("completed_checks", 0)
        self.audit_progress = kwargs.get("audit_progress", 0)
        for k, v in kwargs.items():
            setattr(self, k, v)

class Connection:
    def __init__(self, **kwargs):
        self.is_connected = True
        self.partition = "azure"
        self.enabled_regions = []
        self.error = ""
        for k, v in kwargs.items():
            setattr(self, k, v)

class ProviderOutputOptions:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)
