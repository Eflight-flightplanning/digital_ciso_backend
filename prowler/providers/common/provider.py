providers_path = "prowler.providers"

class Provider:
    _global_provider = None

    @classmethod
    def set_global_provider(cls, provider):
        cls._global_provider = provider

    @classmethod
    def get_global_provider(cls):
        return cls._global_provider

    @staticmethod
    def get_available_providers():
        return [
            "aws",
            "azure",
            "gcp",
            "kubernetes",
            "github",
            "m365",
            "oraclecloud",
            "alibabacloud",
            "cloudflare",
            "okta",
        ]

    @staticmethod
    def init_provider(provider_type, **kwargs):
        return None
