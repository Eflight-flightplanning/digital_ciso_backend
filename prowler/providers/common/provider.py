providers_path = "prowler.providers"

class Provider:
    @staticmethod
    def get_available_providers():
        return ["aws", "azure", "gcp", "kubernetes", "github", "m365"]

    @staticmethod
    def init_provider(provider_type, **kwargs):
        return None
