class Audit_Metadata:
    pass

class Connection:
    is_connected = True
    partition = "aws"
    enabled_regions = []
    error = ""

class ProviderOutputOptions:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)
