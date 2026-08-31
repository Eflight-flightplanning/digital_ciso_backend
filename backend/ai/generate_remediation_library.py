
"""
Verified Remediation Library
=============================
Maps real Prowler check_ids to curated, verified remediation templates.

Each RemediationTemplate has:
  cli            - Exact shell commands with {resource}, {rg}, {region}, {subscription_id},
                   {account_id}, {compartment_id}, {tenancy_id}, {resource_id} placeholders
  terraform      - Provider-version-pinned Terraform block
  manual         - Numbered step-by-step console guide
  compliance     - CIS / NIS2 / ISO 27001 / SOX control references
  references     - Official documentation URLs
  safe_to_automate - True only for non-destructive, idempotent CLI commands
"""
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class RemediationTemplate:
    check_id: str
    title: str
    cli: str
    terraform: str
    manual: list[str]
    compliance: list[str] = field(default_factory=list)
    references: list[str] = field(default_factory=list)
    safe_to_automate: bool = False


def get_remediation(check_id: str) -> "RemediationTemplate | None":
    """Look up a verified remediation template by check_id. Returns None if not found."""
    return REMEDIATION_LIBRARY.get(check_id.lower().strip())


def render_remediation_block(template: "RemediationTemplate", resource: str, **kwargs: str) -> str:
    """Render a remediation template as Markdown, substituting telemetry placeholders."""
    ctx = {"resource": resource, **kwargs}

    def _render(text: str) -> str:
        try:
            return text.format_map(ctx)
        except (KeyError, ValueError):
            return text

    cli = _render(template.cli)
    tf = _render(template.terraform)
    manual_steps = "\n".join(f"{i+1}. {_render(s)}" for i, s in enumerate(template.manual))
    compliance = " | ".join(f"`{c}`" for c in template.compliance) if template.compliance else "None listed"
    refs = "\n".join(f"- {r}" for r in template.references) if template.references else ""
    badge = "**Verified** (safe to automate)" if template.safe_to_automate else "**Review before running** - requires human approval"

    return (
        f"## Remediation Playbook: {template.title}\n\n"
        f"**Resource:** `{resource}`\n"
        f"**Compliance:** {compliance}\n"
        f"**Status:** {badge}\n\n"
        f"---\n\n"
        f"### 1. CLI (Immediate Fix)\n\n"
        f"```bash\n{cli}\n```\n\n"
        f"### 2. Terraform IaC (Permanent Baseline)\n\n"
        f"```terraform\n{tf}\n```\n\n"
        f"### 3. Management Console (Step-by-step)\n\n"
        f"{manual_steps}\n\n"
        f"### Official References\n{refs}\n"
    )


# ==============================================================
# AZURE - NETWORK
# ==============================================================

AZURE_NETWORK_SSH = RemediationTemplate(
    check_id="network_ssh_internet_access_restricted",
    title="SSH (port 22) access from internet must be restricted",
    cli=(
        "az network nsg rule create"
        " --resource-group \"{rg}\""
        " --nsg-name \"{resource}\""
        " --name \"Deny-SSH-Internet\""
        " --priority 100"
        " --direction Inbound"
        " --access Deny"
        " --protocol Tcp"
        " --destination-port-ranges 22"
        " --source-address-prefixes \"*\""
    ),
    terraform="""# azurerm provider >= 3.0
resource "azurerm_network_security_rule" "deny_ssh_internet" {
  name                        = "Deny-SSH-Internet"
  priority                    = 100
  direction                   = "Inbound"
  access                      = "Deny"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = "22"
  source_address_prefix       = "*"
  destination_address_prefix  = "*"
  resource_group_name         = var.resource_group_name
  network_security_group_name = "{resource}"
}""",
    manual=[
        "Open Azure Portal -> Network security groups.",
        "Select the affected NSG ({resource}).",
        "Click Inbound security rules.",
        "Find any rule with Source 0.0.0.0/0 and Destination port 22.",
        "Edit the rule: change Source to your corporate IP range OR set Action to Deny.",
        "Click Save.",
    ],
    compliance=["CIS Azure 6.1", "NIS2 Article 21(2)(h)", "ISO 27001 A.13.1.3"],
    references=["https://learn.microsoft.com/en-us/azure/network-watcher/network-watcher-nsg-flow-logging-overview"],
    safe_to_automate=False,
)

AZURE_NETWORK_RDP = RemediationTemplate(
    check_id="network_rdp_internet_access_restricted",
    title="RDP (port 3389) access from internet must be restricted",
    cli=(
        "az network nsg rule create"
        " --resource-group \"{rg}\""
        " --nsg-name \"{resource}\""
        " --name \"Deny-RDP-Internet\""
        " --priority 100"
        " --direction Inbound"
        " --access Deny"
        " --protocol Tcp"
        " --destination-port-ranges 3389"
        " --source-address-prefixes \"*\""
    ),
    terraform="""resource "azurerm_network_security_rule" "deny_rdp_internet" {
  name                        = "Deny-RDP-Internet"
  priority                    = 100
  direction                   = "Inbound"
  access                      = "Deny"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = "3389"
  source_address_prefix       = "*"
  destination_address_prefix  = "*"
  resource_group_name         = var.resource_group_name
  network_security_group_name = "{resource}"
}""",
    manual=[
        "Open Azure Portal -> Network security groups -> select {resource}.",
        "Click Inbound security rules -> find rules allowing port 3389 from Any or 0.0.0.0/0.",
        "Edit: restrict Source to corporate IP range or set Action to Deny.",
        "Consider enabling Azure Bastion instead for RDP access.",
    ],
    compliance=["CIS Azure 6.2", "NIS2 Article 21(2)(h)", "ISO 27001 A.9.4.2"],
    references=["https://learn.microsoft.com/en-us/azure/bastion/bastion-overview"],
    safe_to_automate=False,
)

AZURE_NETWORK_HTTP = RemediationTemplate(
    check_id="network_http_internet_access_restricted",
    title="HTTP (port 80) unrestricted access should be restricted",
    cli=(
        "az network nsg rule create"
        " --resource-group \"{rg}\""
        " --nsg-name \"{resource}\""
        " --name \"Deny-HTTP-Internet\""
        " --priority 110"
        " --direction Inbound"
        " --access Deny"
        " --protocol Tcp"
        " --destination-port-ranges 80"
        " --source-address-prefixes \"*\""
    ),
    terraform="""resource "azurerm_network_security_rule" "deny_http_internet" {
  name                        = "Deny-HTTP-Internet"
  priority                    = 110
  direction                   = "Inbound"
  access                      = "Deny"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = "80"
  source_address_prefix       = "*"
  destination_address_prefix  = "*"
  resource_group_name         = var.resource_group_name
  network_security_group_name = "{resource}"
}""",
    manual=[
        "Open Azure Portal -> Network security groups -> select {resource}.",
        "Click Inbound security rules -> find rules for port 80 from Any.",
        "Restrict source to known IP ranges or deny if traffic should flow over HTTPS only.",
    ],
    compliance=["CIS Azure 6.3", "NIS2 Article 21(2)(h)"],
    references=["https://learn.microsoft.com/en-us/azure/security/fundamentals/network-best-practices"],
    safe_to_automate=False,
)

AZURE_NETWORK_UDP = RemediationTemplate(
    check_id="network_udp_internet_access_restricted",
    title="UDP access from internet must be restricted",
    cli=(
        "az network nsg rule create"
        " --resource-group \"{rg}\""
        " --nsg-name \"{resource}\""
        " --name \"Deny-UDP-Internet\""
        " --priority 120"
        " --direction Inbound"
        " --access Deny"
        " --protocol Udp"
        " --destination-port-ranges \"*\""
        " --source-address-prefixes \"*\""
    ),
    terraform="""resource "azurerm_network_security_rule" "deny_udp_internet" {
  name                        = "Deny-UDP-Internet"
  priority                    = 120
  direction                   = "Inbound"
  access                      = "Deny"
  protocol                    = "Udp"
  source_port_range           = "*"
  destination_port_range      = "*"
  source_address_prefix       = "*"
  destination_address_prefix  = "*"
  resource_group_name         = var.resource_group_name
  network_security_group_name = "{resource}"
}""",
    manual=[
        "Open Azure Portal -> Network security groups -> select {resource}.",
        "Click Inbound security rules -> look for UDP rules with Source Any.",
        "Delete or restrict those rules to internal CIDR ranges only.",
    ],
    compliance=["CIS Azure 6.4", "NIS2 Article 21(2)(h)"],
    references=["https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview"],
    safe_to_automate=False,
)

AZURE_NETWORK_BASTION = RemediationTemplate(
    check_id="network_bastion_host_exists",
    title="Azure Bastion host should exist for secure RDP/SSH access",
    cli=(
        "# Create Azure Bastion (requires AzureBastionSubnet in the VNet)\n"
        "az network vnet subnet create"
        " --resource-group \"{rg}\""
        " --vnet-name your-vnet"
        " --name AzureBastionSubnet"
        " --address-prefixes 10.0.255.0/27\n"
        "az network public-ip create"
        " --resource-group \"{rg}\""
        " --name bastion-pip"
        " --sku Standard"
        " --location \"{region}\"\n"
        "az network bastion create"
        " --resource-group \"{rg}\""
        " --name bastion-host"
        " --public-ip-address bastion-pip"
        " --vnet-name your-vnet"
        " --location \"{region}\""
    ),
    terraform="""resource "azurerm_subnet" "bastion" {
  name                 = "AzureBastionSubnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = var.vnet_name
  address_prefixes     = ["10.0.255.0/27"]
}

resource "azurerm_public_ip" "bastion" {
  name                = "bastion-pip"
  location            = var.location
  resource_group_name = var.resource_group_name
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_bastion_host" "main" {
  name                = "bastion-host"
  location            = var.location
  resource_group_name = var.resource_group_name

  ip_configuration {
    name                 = "configuration"
    subnet_id            = azurerm_subnet.bastion.id
    public_ip_address_id = azurerm_public_ip.bastion.id
  }
}""",
    manual=[
        "Open Azure Portal -> Create a resource -> search Bastion -> click Create.",
        "Select the subscription, resource group, and VNet that needs Bastion.",
        "Azure will auto-create the AzureBastionSubnet - ensure it has at least a /27 prefix.",
        "Assign a new or existing Standard public IP.",
        "Click Review + Create -> Create.",
        "Once deployed, connect to VMs via Virtual Machines -> Connect -> Bastion.",
    ],
    compliance=["CIS Azure 6.8", "NIS2 Article 21(2)(h)"],
    references=["https://learn.microsoft.com/en-us/azure/bastion/bastion-overview"],
    safe_to_automate=False,
)

AZURE_NETWORK_WATCHER = RemediationTemplate(
    check_id="network_watcher_enabled",
    title="Network Watcher should be enabled in all regions",
    cli=(
        "az network watcher configure"
        " --resource-group NetworkWatcherRG"
        " --locations \"{region}\""
        " --enabled true"
    ),
    terraform="""resource "azurerm_network_watcher" "main" {
  name                = "nw-{region}"
  location            = "{region}"
  resource_group_name = "NetworkWatcherRG"
}""",
    manual=[
        "Open Azure Portal -> search Network Watcher -> select it.",
        "In Overview, regions with status Disabled are shown.",
        "Click the region row -> click Enable.",
    ],
    compliance=["CIS Azure 6.5", "ISO 27001 A.12.4.1"],
    references=["https://learn.microsoft.com/en-us/azure/network-watcher/network-watcher-monitoring-overview"],
    safe_to_automate=True,
)

AZURE_NETWORK_FLOW_LOG = RemediationTemplate(
    check_id="network_flow_log_captured_sent",
    title="NSG flow logs should be enabled and sent to storage",
    cli=(
        "az network watcher flow-log create"
        " --resource-group \"{rg}\""
        " --name \"{resource}-flow-log\""
        " --nsg \"{resource}\""
        " --storage-account /subscriptions/{subscription_id}/resourceGroups/{rg}/providers/Microsoft.Storage/storageAccounts/flowlogssa"
        " --enabled true"
        " --format JSON"
        " --log-version 2"
    ),
    terraform="""resource "azurerm_network_watcher_flow_log" "main" {
  network_watcher_name      = "NetworkWatcher_{region}"
  resource_group_name       = "NetworkWatcherRG"
  name                      = "{resource}-flow-log"
  network_security_group_id = "/subscriptions/{subscription_id}/resourceGroups/{rg}/providers/Microsoft.Network/networkSecurityGroups/{resource}"
  storage_account_id        = var.flow_log_storage_account_id
  enabled                   = true
  version                   = 2

  retention_policy {
    enabled = true
    days    = 90
  }
}""",
    manual=[
        "Open Azure Portal -> Network Watcher -> NSG flow logs.",
        "Click + Create and select the target NSG ({resource}).",
        "Choose a storage account and set retention to 90 days.",
        "Enable Traffic Analytics for deeper insights.",
        "Click Review + Create -> Create.",
    ],
    compliance=["CIS Azure 6.5", "NIS2 Article 21(2)(e)", "ISO 27001 A.12.4.1"],
    references=["https://learn.microsoft.com/en-us/azure/network-watcher/network-watcher-nsg-flow-logging-overview"],
    safe_to_automate=True,
)

AZURE_NETWORK_FLOW_LOG_90 = RemediationTemplate(
    check_id="network_flow_log_more_than_90_days",
    title="NSG flow log retention must be at least 90 days",
    cli=(
        "az network watcher flow-log update"
        " --resource-group NetworkWatcherRG"
        " --name \"{resource}\""
        " --retention 90"
    ),
    terraform="""resource "azurerm_network_watcher_flow_log" "main" {
  # existing config above
  retention_policy {
    enabled = true
    days    = 90
  }
}""",
    manual=[
        "Open Azure Portal -> Network Watcher -> NSG flow logs.",
        "Click the flow log {resource} -> Edit.",
        "Set Retention (days) to 90 or higher.",
        "Click Save.",
    ],
    compliance=["CIS Azure 6.5", "NIS2 Article 21(2)(e)"],
    references=["https://learn.microsoft.com/en-us/azure/network-watcher/network-watcher-nsg-flow-logging-overview"],
    safe_to_automate=True,
)

AZURE_NETWORK_DDOS = RemediationTemplate(
    check_id="network_vnet_ddos_protection_enabled",
    title="Azure DDoS Network Protection should be enabled on Virtual Networks",
    cli=(
        "# Create DDoS plan if needed\n"
        "az network ddos-protection create"
        " --resource-group \"{rg}\""
        " --name myDdosPlan"
        " --location \"{region}\"\n"
        "# Enable DDoS on the VNet\n"
        "az network vnet update"
        " --resource-group \"{rg}\""
        " --name \"{resource}\""
        " --ddos-protection true"
        " --ddos-protection-plan /subscriptions/{subscription_id}/resourceGroups/{rg}/providers/Microsoft.Network/ddosProtectionPlans/myDdosPlan"
    ),
    terraform="""resource "azurerm_ddos_protection_plan" "main" {
  name                = "ddos-plan"
  location            = var.location
  resource_group_name = var.resource_group_name
}

resource "azurerm_virtual_network" "main" {
  name                = "{resource}"
  location            = var.location
  resource_group_name = var.resource_group_name
  address_space       = ["10.0.0.0/16"]

  ddos_protection_plan {
    id     = azurerm_ddos_protection_plan.main.id
    enable = true
  }
}""",
    manual=[
        "Open Azure Portal -> Virtual networks -> select {resource}.",
        "Click DDoS protection in the left panel.",
        "Set DDoS protection to Enable.",
        "Select or create a DDoS Protection plan (Standard SKU - note cost).",
        "Click Save.",
    ],
    compliance=["CIS Azure 6.7", "NIS2 Article 21(2)(h)"],
    references=["https://learn.microsoft.com/en-us/azure/ddos-protection/ddos-protection-overview"],
    safe_to_automate=False,
)

AZURE_NETWORK_SUBNET_NSG = RemediationTemplate(
    check_id="network_subnet_nsg_associated",
    title="All subnets should have a Network Security Group associated",
    cli=(
        "az network vnet subnet update"
        " --resource-group \"{rg}\""
        " --vnet-name your-vnet"
        " --name \"{resource}\""
        " --network-security-group /subscriptions/{subscription_id}/resourceGroups/{rg}/providers/Microsoft.Network/networkSecurityGroups/nsg-{resource}"
    ),
    terraform="""resource "azurerm_subnet_network_security_group_association" "main" {
  subnet_id                 = "/subscriptions/{subscription_id}/resourceGroups/{rg}/providers/Microsoft.Network/virtualNetworks/your-vnet/subnets/{resource}"
  network_security_group_id = azurerm_network_security_group.main.id
}""",
    manual=[
        "Open Azure Portal -> Virtual networks -> select the VNet -> Subnets.",
        "Click the subnet {resource} -> Network security group.",
        "Select an existing NSG or create one.",
        "Click Save.",
    ],
    compliance=["CIS Azure 6.6", "NIS2 Article 21(2)(h)"],
    references=["https://learn.microsoft.com/en-us/azure/virtual-network/network-overview#network-security-groups"],
    safe_to_automate=False,
)

# ==============================================================
# AZURE - STORAGE
# ==============================================================

AZURE_STORAGE_PUBLIC_BLOB = RemediationTemplate(
    check_id="storage_blob_public_access_level_is_disabled",
    title="Azure Storage blob public access must be disabled",
    cli="az storage account update --name \"{resource}\" --resource-group \"{rg}\" --allow-blob-public-access false",
    terraform="""resource "azurerm_storage_account" "main" {
  name                     = "{resource}"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  allow_nested_items_to_be_public = false
}""",
    manual=[
        "Open Azure Portal -> Storage accounts -> select {resource}.",
        "Click Configuration (under Settings).",
        "Set Allow Blob public access to Disabled.",
        "Click Save.",
    ],
    compliance=["CIS Azure 3.5", "NIS2 Article 21(2)(c)", "ISO 27001 A.9.4.1"],
    references=["https://learn.microsoft.com/en-us/azure/storage/blobs/anonymous-read-access-prevent"],
    safe_to_automate=True,
)

AZURE_STORAGE_HTTPS = RemediationTemplate(
    check_id="storage_secure_transfer_required_is_enabled",
    title="Secure transfer (HTTPS only) must be enabled on Storage accounts",
    cli="az storage account update --name \"{resource}\" --resource-group \"{rg}\" --https-only true",
    terraform="""resource "azurerm_storage_account" "main" {
  name                     = "{resource}"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  enable_https_traffic_only = true
}""",
    manual=[
        "Open Azure Portal -> Storage accounts -> select {resource}.",
        "Click Configuration in the left panel.",
        "Set Secure transfer required to Enabled.",
        "Click Save.",
    ],
    compliance=["CIS Azure 3.1", "NIS2 Article 21(2)(c)", "ISO 27001 A.14.1.3"],
    references=["https://learn.microsoft.com/en-us/azure/storage/common/storage-require-secure-transfer"],
    safe_to_automate=True,
)

AZURE_STORAGE_TLS = RemediationTemplate(
    check_id="storage_ensure_minimum_tls_version_12",
    title="Minimum TLS version must be 1.2 on Storage accounts",
    cli="az storage account update --name \"{resource}\" --resource-group \"{rg}\" --min-tls-version TLS1_2",
    terraform="""resource "azurerm_storage_account" "main" {
  name                     = "{resource}"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  min_tls_version          = "TLS1_2"
}""",
    manual=[
        "Open Azure Portal -> Storage accounts -> select {resource}.",
        "Click Configuration in the left panel.",
        "Under Minimum TLS version select Version 1.2.",
        "Click Save.",
    ],
    compliance=["CIS Azure 3.2", "NIS2 Article 21(2)(c)", "PCI DSS 4.2.1"],
    references=["https://learn.microsoft.com/en-us/azure/storage/common/transport-layer-security-configure-minimum-version"],
    safe_to_automate=True,
)

AZURE_STORAGE_PUBLIC_NETWORK = RemediationTemplate(
    check_id="storage_account_public_network_access_disabled",
    title="Storage account public network access should be disabled",
    cli="az storage account update --name \"{resource}\" --resource-group \"{rg}\" --default-action Deny --public-network-access Disabled",
    terraform="""resource "azurerm_storage_account" "main" {
  name                     = "{resource}"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  public_network_access_enabled = false

  network_rules {
    default_action = "Deny"
    bypass         = ["AzureServices"]
  }
}""",
    manual=[
        "Open Azure Portal -> Storage accounts -> select {resource}.",
        "Click Networking in the left panel.",
        "Under Public network access, select Disabled.",
        "Click Save.",
    ],
    compliance=["CIS Azure 3.7", "NIS2 Article 21(2)(c)"],
    references=["https://learn.microsoft.com/en-us/azure/storage/common/storage-network-security"],
    safe_to_automate=False,
)

AZURE_STORAGE_KEY_ACCESS = RemediationTemplate(
    check_id="storage_account_key_access_disabled",
    title="Shared key access (storage account keys) should be disabled",
    cli="az storage account update --name \"{resource}\" --resource-group \"{rg}\" --allow-shared-key-access false",
    terraform="""resource "azurerm_storage_account" "main" {
  name                     = "{resource}"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  shared_access_key_enabled = false
}""",
    manual=[
        "Open Azure Portal -> Storage accounts -> select {resource}.",
        "Click Configuration in the left panel.",
        "Set Allow storage account key access to Disabled.",
        "Click Save. Ensure all applications use Azure AD authentication.",
    ],
    compliance=["CIS Azure 3.8", "NIS2 Article 21(2)(i)", "ISO 27001 A.9.4.3"],
    references=["https://learn.microsoft.com/en-us/azure/storage/common/shared-key-authorization-prevent"],
    safe_to_automate=False,
)

AZURE_STORAGE_VERSIONING = RemediationTemplate(
    check_id="storage_blob_versioning_is_enabled",
    title="Blob versioning should be enabled",
    cli="az storage account blob-service-properties update --account-name \"{resource}\" --resource-group \"{rg}\" --enable-versioning true",
    terraform="""resource "azurerm_storage_account_blob_service_properties" "main" {
  storage_account_id = azurerm_storage_account.main.id
  versioning_enabled = true
}""",
    manual=[
        "Open Azure Portal -> Storage accounts -> select {resource}.",
        "Click Data protection in the left panel.",
        "Check Enable versioning for blobs.",
        "Click Save.",
    ],
    compliance=["CIS Azure 3.11", "NIS2 Article 21(2)(c)", "ISO 27001 A.12.3.1"],
    references=["https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-overview"],
    safe_to_automate=True,
)

AZURE_STORAGE_SOFT_DELETE = RemediationTemplate(
    check_id="storage_ensure_soft_delete_is_enabled",
    title="Blob soft delete should be enabled (minimum 7 days)",
    cli="az storage account blob-service-properties update --account-name \"{resource}\" --resource-group \"{rg}\" --enable-delete-retention true --delete-retention-days 7",
    terraform="""resource "azurerm_storage_account_blob_service_properties" "main" {
  storage_account_id = azurerm_storage_account.main.id

  delete_retention_policy {
    days = 7
  }
}""",
    manual=[
        "Open Azure Portal -> Storage accounts -> select {resource}.",
        "Click Data protection in the left panel.",
        "Check Enable soft delete for blobs and set Days to 7.",
        "Click Save.",
    ],
    compliance=["CIS Azure 3.12", "ISO 27001 A.12.3.1"],
    references=["https://learn.microsoft.com/en-us/azure/storage/blobs/soft-delete-blob-overview"],
    safe_to_automate=True,
)

AZURE_STORAGE_CROSS_TENANT = RemediationTemplate(
    check_id="storage_cross_tenant_replication_disabled",
    title="Cross-tenant replication should be disabled",
    cli="az storage account update --name \"{resource}\" --resource-group \"{rg}\" --allow-cross-tenant-replication false",
    terraform="""resource "azurerm_storage_account" "main" {
  name                     = "{resource}"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  cross_tenant_replication_enabled = false
}""",
    manual=[
        "Open Azure Portal -> Storage accounts -> select {resource}.",
        "Click Object replication in the left panel.",
        "Remove any cross-tenant replication rules.",
        "Click Save.",
    ],
    compliance=["CIS Azure 3.9", "NIS2 Article 21(2)(c)"],
    references=["https://learn.microsoft.com/en-us/azure/storage/blobs/object-replication-overview"],
    safe_to_automate=True,
)

AZURE_STORAGE_NETWORK_DENY = RemediationTemplate(
    check_id="storage_default_network_access_rule_is_denied",
    title="Default network access to Storage account must be Deny",
    cli="az storage account update --name \"{resource}\" --resource-group \"{rg}\" --default-action Deny",
    terraform="""resource "azurerm_storage_account" "main" {
  name                     = "{resource}"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "GRS"

  network_rules {
    default_action = "Deny"
    bypass         = ["AzureServices", "Logging", "Metrics"]
    ip_rules       = ["YOUR_CORP_IP"]
  }
}""",
    manual=[
        "Open Azure Portal -> Storage accounts -> select {resource}.",
        "Click Networking in the left panel.",
        "Change to Enabled from selected virtual networks and IP addresses.",
        "Add your corporate IP ranges under Firewall -> Address range.",
        "Click Save.",
    ],
    compliance=["CIS Azure 3.7", "NIS2 Article 21(2)(c)", "ISO 27001 A.13.1.3"],
    references=["https://learn.microsoft.com/en-us/azure/storage/common/storage-network-security"],
    safe_to_automate=False,
)

AZURE_STORAGE_GEO = RemediationTemplate(
    check_id="storage_geo_redundant_enabled",
    title="Geo-redundant storage (GRS) should be enabled",
    cli="az storage account update --name \"{resource}\" --resource-group \"{rg}\" --sku Standard_GRS",
    terraform="""resource "azurerm_storage_account" "main" {
  name                     = "{resource}"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
}""",
    manual=[
        "Open Azure Portal -> Storage accounts -> select {resource}.",
        "Click Configuration in the left panel.",
        "Under Replication, select Geo-redundant storage (GRS).",
        "Click Save.",
    ],
    compliance=["CIS Azure 3.13", "ISO 27001 A.17.2.1"],
    references=["https://learn.microsoft.com/en-us/azure/storage/common/storage-redundancy"],
    safe_to_automate=True,
)

AZURE_STORAGE_KEY_ROTATION = RemediationTemplate(
    check_id="storage_key_rotation_90_days",
    title="Storage account keys should be rotated within 90 days",
    cli="az storage account keys renew --account-name \"{resource}\" --resource-group \"{rg}\" --key primary",
    terraform="""# Automate via Azure Key Vault rotation policy
resource "azurerm_key_vault_secret" "storage_key" {
  name            = "{resource}-key"
  value           = azurerm_storage_account.main.primary_access_key
  key_vault_id    = var.key_vault_id
  expiration_date = timeadd(timestamp(), "2160h")  # 90 days
}""",
    manual=[
        "Open Azure Portal -> Storage accounts -> select {resource}.",
        "Click Access keys in the left panel.",
        "Click Rotate key next to key1.",
        "Update any applications using the old key with the new value.",
        "Consider using Azure Key Vault with rotation policy for automatic rotation.",
    ],
    compliance=["CIS Azure 3.4", "NIS2 Article 21(2)(i)", "ISO 27001 A.9.4.3"],
    references=["https://learn.microsoft.com/en-us/azure/storage/common/storage-account-keys-manage"],
    safe_to_automate=False,
)

AZURE_STORAGE_ENTRA_AUTH = RemediationTemplate(
    check_id="storage_default_to_entra_authorization_enabled",
    title="Default authorization for Storage should be Microsoft Entra ID",
    cli="az storage account update --name \"{resource}\" --resource-group \"{rg}\" --default-to-oauth true",
    terraform="""resource "azurerm_storage_account" "main" {
  name                     = "{resource}"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  default_to_oauth_authentication = true
}""",
    manual=[
        "Open Azure Portal -> Storage accounts -> select {resource}.",
        "Click Configuration in the left panel.",
        "Enable Default to Microsoft Entra authorization in the Azure portal.",
        "Click Save.",
    ],
    compliance=["CIS Azure 3.8", "ISO 27001 A.9.4.1"],
    references=["https://learn.microsoft.com/en-us/azure/storage/common/authorize-data-access"],
    safe_to_automate=True,
)

AZURE_STORAGE_PRIVATE_ENDPOINT = RemediationTemplate(
    check_id="storage_ensure_private_endpoints_in_storage_accounts",
    title="Storage account should use private endpoints",
    cli=(
        "az network private-endpoint create"
        " --name pe-{resource}"
        " --resource-group \"{rg}\""
        " --vnet-name your-vnet"
        " --subnet PrivateEndpointSubnet"
        " --private-connection-resource-id /subscriptions/{subscription_id}/resourceGroups/{rg}/providers/Microsoft.Storage/storageAccounts/{resource}"
        " --group-id blob"
        " --connection-name pec-{resource}"
    ),
    terraform="""resource "azurerm_private_endpoint" "storage" {
  name                = "pe-{resource}"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.private_endpoint_subnet_id

  private_service_connection {
    name                           = "pec-{resource}"
    private_connection_resource_id = azurerm_storage_account.main.id
    subresource_names              = ["blob"]
    is_manual_connection           = false
  }
}""",
    manual=[
        "Open Azure Portal -> Storage accounts -> select {resource}.",
        "Click Networking -> Private endpoint connections -> + Private endpoint.",
        "Select the target VNet and subnet.",
        "Choose blob as the target sub-resource.",
        "Complete the wizard and click Create.",
        "After creation, disable public network access: Networking -> Disabled.",
    ],
    compliance=["CIS Azure 3.10", "NIS2 Article 21(2)(c)"],
    references=["https://learn.microsoft.com/en-us/azure/storage/common/storage-private-endpoints"],
    safe_to_automate=False,
)

AZURE_STORAGE_INFRA_ENCRYPTION = RemediationTemplate(
    check_id="storage_infrastructure_encryption_is_enabled",
    title="Storage account infrastructure encryption should be enabled",
    cli=(
        "# NOTE: Infrastructure encryption must be set at creation time.\n"
        "az storage account create"
        " --name \"{resource}-new\""
        " --resource-group \"{rg}\""
        " --location \"{region}\""
        " --sku Standard_GRS"
        " --require-infrastructure-encryption true"
    ),
    terraform="""resource "azurerm_storage_account" "main" {
  name                     = "{resource}"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  infrastructure_encryption_enabled = true
}""",
    manual=[
        "IMPORTANT: Infrastructure encryption can only be enabled at account creation time.",
        "Open Azure Portal -> Storage accounts -> + Create.",
        "In the Encryption tab, check Enable infrastructure encryption.",
        "Complete creation and migrate data from the old account to the new one.",
    ],
    compliance=["CIS Azure 3.3", "NIS2 Article 21(2)(c)"],
    references=["https://learn.microsoft.com/en-us/azure/storage/common/infrastructure-encryption-enable"],
    safe_to_automate=False,
)

# ==============================================================
# AZURE - ENTRA ID / IAM
# ==============================================================

AZURE_ENTRA_MFA_PRIVILEGED = RemediationTemplate(
    check_id="entra_privileged_user_has_mfa",
    title="MFA must be enabled for all privileged (admin) accounts",
    cli="""az rest --method POST \\
  --uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" \\
  --headers "Content-Type=application/json" \\
  --body '{"displayName": "Require-MFA-For-Privileged-Admins", "state": "enabled", "conditions": {"users": {"includeRoles": ["62e90394-69f5-4237-9190-012177145e10"]}, "applications": {"includeApplications": ["All"]}}, "grantControls": {"operator": "OR", "builtInControls": ["mfa"]}}'""",
    terraform="""resource "azuread_conditional_access_policy" "mfa_admins" {
  display_name = "Require-MFA-For-Privileged-Admins"
  state        = "enabled"

  conditions {
    client_app_types = ["all"]
    applications { included_applications = ["All"] }
    users {
      included_roles = [
        "62e90394-69f5-4237-9190-012177145e10",  # Global Administrator
        "f28a1f50-f6e7-4571-818b-6a12f2af6b6c",  # Security Administrator
      ]
    }
  }
  grant_controls {
    operator          = "OR"
    built_in_controls = ["mfa"]
  }
}""",
    manual=[
        "Open Microsoft Entra admin center -> Protection -> Conditional Access.",
        "Click + New policy -> Name it Require-MFA-Privileged-Admins.",
        "Under Users -> Include -> Directory roles -> choose all admin roles.",
        "Under Target resources -> All cloud apps.",
        "Under Grant -> Require multifactor authentication.",
        "Set Enable policy to On -> click Create.",
    ],
    compliance=["CIS Azure 1.2.3", "NIS2 Article 21(2)(j)", "ISO 27001 A.9.4.2"],
    references=["https://learn.microsoft.com/en-us/entra/identity/conditional-access/howto-conditional-access-policy-admin-mfa"],
    safe_to_automate=False,
)

AZURE_ENTRA_MFA_NON_PRIVILEGED = RemediationTemplate(
    check_id="entra_non_privileged_user_has_mfa",
    title="MFA should be enabled for all users",
    cli="""az rest --method POST \\
  --uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" \\
  --headers "Content-Type=application/json" \\
  --body '{"displayName": "Require-MFA-All-Users", "state": "enabled", "conditions": {"users": {"includeUsers": ["All"]}, "applications": {"includeApplications": ["All"]}}, "grantControls": {"operator": "OR", "builtInControls": ["mfa"]}}'""",
    terraform="""resource "azuread_conditional_access_policy" "mfa_all_users" {
  display_name = "Require-MFA-All-Users"
  state        = "enabledForReportingButNotEnforced"

  conditions {
    client_app_types = ["all"]
    applications { included_applications = ["All"] }
    users {
      included_users = ["All"]
      excluded_users = ["breakglass-account-object-id"]
    }
  }
  grant_controls {
    operator          = "OR"
    built_in_controls = ["mfa"]
  }
}""",
    manual=[
        "Open Microsoft Entra admin center -> Protection -> Conditional Access.",
        "Click + New policy -> Name it Require-MFA-All-Users.",
        "Under Users -> Include -> All users. Exclude break-glass accounts.",
        "Under Target resources -> All cloud apps.",
        "Under Grant -> Require multifactor authentication.",
        "Start with Report-only mode to assess impact, then switch to On.",
        "Click Create.",
    ],
    compliance=["CIS Azure 1.2.2", "NIS2 Article 21(2)(j)", "ISO 27001 A.9.4.2"],
    references=["https://learn.microsoft.com/en-us/entra/identity/conditional-access/howto-conditional-access-policy-all-users-mfa"],
    safe_to_automate=False,
)

AZURE_ENTRA_SECURITY_DEFAULTS = RemediationTemplate(
    check_id="entra_security_defaults_enabled",
    title="Security defaults should be enabled in Microsoft Entra ID",
    cli="""az rest --method PATCH \\
  --uri "https://graph.microsoft.com/v1.0/policies/identitySecurityDefaultsEnforcementPolicy" \\
  --headers "Content-Type=application/json" \\
  --body '{"isEnabled": true}'""",
    terraform="""resource "azuread_directory_security_defaults" "main" {
  security_defaults_enabled = true
}""",
    manual=[
        "Open Microsoft Entra admin center -> Overview -> Properties.",
        "At the bottom click Manage security defaults.",
        "Toggle Security defaults to Enabled.",
        "Click Save.",
        "Note: Security defaults cannot be used alongside Conditional Access policies.",
    ],
    compliance=["CIS Azure 1.2.1", "NIS2 Article 21(2)(j)"],
    references=["https://learn.microsoft.com/en-us/entra/fundamentals/security-defaults"],
    safe_to_automate=True,
)

AZURE_ENTRA_MFA_ADMIN_PORTAL = RemediationTemplate(
    check_id="entra_conditional_access_policy_require_mfa_for_admin_portals",
    title="Conditional Access should require MFA for Azure admin portals",
    cli="""az rest --method POST \\
  --uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" \\
  --headers "Content-Type=application/json" \\
  --body '{"displayName": "Require-MFA-Admin-Portals", "state": "enabled", "conditions": {"users": {"includeUsers": ["All"]}, "applications": {"includeApplications": ["MicrosoftAdminPortals"]}}, "grantControls": {"operator": "OR", "builtInControls": ["mfa"]}}'""",
    terraform="""resource "azuread_conditional_access_policy" "mfa_admin_portals" {
  display_name = "Require-MFA-Admin-Portals"
  state        = "enabled"

  conditions {
    client_app_types = ["all"]
    applications { included_applications = ["MicrosoftAdminPortals"] }
    users { included_users = ["All"] }
  }
  grant_controls {
    operator          = "OR"
    built_in_controls = ["mfa"]
  }
}""",
    manual=[
        "Open Microsoft Entra admin center -> Protection -> Conditional Access.",
        "Click + New policy -> Name it Require-MFA-Admin-Portals.",
        "Under Users -> All users.",
        "Under Target resources -> Cloud apps -> include Microsoft Admin Portals.",
        "Under Grant -> Require multifactor authentication.",
        "Click Create with policy On.",
    ],
    compliance=["CIS Azure 1.2.6", "NIS2 Article 21(2)(j)"],
    references=["https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-conditional-access-cloud-apps"],
    safe_to_automate=False,
)

AZURE_ENTRA_GLOBAL_ADMINS = RemediationTemplate(
    check_id="entra_global_admin_in_less_than_five_users",
    title="No more than 4 Global Administrators should be assigned",
    cli="""# List current Global Admins
az ad directory-role list --query "[?displayName=='Global Administrator'].id" -o tsv

# Remove a user from Global Admin role
az rest --method DELETE \\
  --uri "https://graph.microsoft.com/v1.0/directoryRoles/{global_admin_role_id}/members/USER_OBJECT_ID/$ref" """,
    terraform="""resource "azuread_directory_role_assignment" "global_admin" {
  for_each            = toset(var.global_admin_object_ids)  # Keep <= 4 UUIDs
  role_id             = "62e90394-69f5-4237-9190-012177145e10"
  principal_object_id = each.value
}""",
    manual=[
        "Open Microsoft Entra admin center -> Roles & admins -> Global administrator.",
        "Review the list - if more than 4 users are assigned, click Remove assignments.",
        "Select accounts that do not require Global Admin and remove the role.",
        "Assign more specific roles (Security Administrator, Exchange Administrator) instead.",
    ],
    compliance=["CIS Azure 1.1.1", "NIS2 Article 21(2)(j)", "ISO 27001 A.9.2.3"],
    references=["https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/best-practices"],
    safe_to_automate=False,
)

# ==============================================================
# AZURE - KEY VAULT
# ==============================================================

AZURE_KEYVAULT_RBAC = RemediationTemplate(
    check_id="keyvault_rbac_enabled",
    title="Key Vault should use RBAC for authorization",
    cli="az keyvault update --name \"{resource}\" --resource-group \"{rg}\" --enable-rbac-authorization true",
    terraform="""resource "azurerm_key_vault" "main" {
  name                       = "{resource}"
  location                   = var.location
  resource_group_name        = var.resource_group_name
  tenant_id                  = var.tenant_id
  sku_name                   = "standard"
  enable_rbac_authorization  = true
  purge_protection_enabled   = true
  soft_delete_retention_days = 90
}""",
    manual=[
        "Open Azure Portal -> Key vaults -> select {resource}.",
        "Click Access configuration in the left panel.",
        "Change Permission model from Vault access policy to Azure role-based access control (RBAC).",
        "Click Apply.",
        "Assign Key Vault Secrets Officer / Reader roles to required users/applications via Access control (IAM).",
    ],
    compliance=["CIS Azure 8.5", "ISO 27001 A.9.4.1"],
    references=["https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide"],
    safe_to_automate=False,
)

AZURE_KEYVAULT_RECOVERABLE = RemediationTemplate(
    check_id="keyvault_recoverable",
    title="Key Vault should have soft-delete and purge protection enabled",
    cli="az keyvault update --name \"{resource}\" --resource-group \"{rg}\" --enable-soft-delete true --enable-purge-protection true",
    terraform="""resource "azurerm_key_vault" "main" {
  name                       = "{resource}"
  location                   = var.location
  resource_group_name        = var.resource_group_name
  tenant_id                  = var.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days = 90
  purge_protection_enabled   = true
}""",
    manual=[
        "Open Azure Portal -> Key vaults -> select {resource}.",
        "Click Properties in the left panel.",
        "Verify Soft delete shows Enabled.",
        "Toggle Purge protection to Enable purge protection.",
        "Click Save. WARNING: Purge protection cannot be disabled once enabled.",
    ],
    compliance=["CIS Azure 8.4", "NIS2 Article 21(2)(c)", "ISO 27001 A.12.3.1"],
    references=["https://learn.microsoft.com/en-us/azure/key-vault/general/soft-delete-overview"],
    safe_to_automate=True,
)

AZURE_KEYVAULT_LOGGING = RemediationTemplate(
    check_id="keyvault_logging_enabled",
    title="Diagnostic logging must be enabled for Key Vault",
    cli=(
        "az monitor diagnostic-settings create"
        " --name kv-diagnostics"
        " --resource /subscriptions/{subscription_id}/resourceGroups/{rg}/providers/Microsoft.KeyVault/vaults/{resource}"
        " --logs '[{"category": "AuditEvent", "enabled": true, "retentionPolicy": {"days": 180, "enabled": true}}]'"
        " --metrics '[{"category": "AllMetrics", "enabled": true}]'"
        " --storage-account /subscriptions/{subscription_id}/resourceGroups/{rg}/providers/Microsoft.Storage/storageAccounts/diaglogs"
    ),
    terraform="""resource "azurerm_monitor_diagnostic_setting" "kv" {
  name               = "kv-diagnostics"
  target_resource_id = azurerm_key_vault.main.id
  storage_account_id = var.diagnostics_storage_account_id

  enabled_log {
    category = "AuditEvent"
    retention_policy {
      enabled = true
      days    = 180
    }
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }
}""",
    manual=[
        "Open Azure Portal -> Key vaults -> select {resource}.",
        "Click Diagnostic settings in the left panel.",
        "Click + Add diagnostic setting.",
        "Enable AuditEvent logs and route to a Log Analytics workspace or Storage Account.",
        "Set retention to 180 days or more.",
        "Click Save.",
    ],
    compliance=["CIS Azure 8.1", "NIS2 Article 21(2)(e)", "ISO 27001 A.12.4.1"],
    references=["https://learn.microsoft.com/en-us/azure/key-vault/general/howto-logging"],
    safe_to_automate=True,
)

AZURE_KEYVAULT_KEY_ROTATION = RemediationTemplate(
    check_id="keyvault_key_rotation_enabled",
    title="Key Vault keys should have automatic rotation enabled",
    cli=(
        "az keyvault key rotation-policy update"
        " --vault-name \"{resource}\""
        " --name your-key-name"
        " --value '{"lifetimeActions": [{"action": {"type": "Rotate"}, "trigger": {"timeAfterCreate": "P365D"}}], "attributes": {"expiryTime": "P545D"}}'"
    ),
    terraform="""resource "azurerm_key_vault_key" "main" {
  name         = "your-key-name"
  key_vault_id = azurerm_key_vault.main.id
  key_type     = "RSA"
  key_size     = 2048
  key_opts     = ["decrypt", "encrypt", "sign", "verify"]

  rotation_policy {
    automatic {
      time_after_creation = "P365D"
    }
    expire_after         = "P545D"
    notify_before_expiry = "P30D"
  }
}""",
    manual=[
        "Open Azure Portal -> Key vaults -> select {resource}.",
        "Click Keys in the left panel -> select the key.",
        "Click Rotation policy tab.",
        "Enable Automatic rotation and set Rotate at to 365 days after creation.",
        "Set Expiry to 545 days (18 months).",
        "Click Save.",
    ],
    compliance=["CIS Azure 8.2", "NIS2 Article 21(2)(i)", "ISO 27001 A.10.1.2"],
    references=["https://learn.microsoft.com/en-us/azure/key-vault/keys/how-to-configure-key-rotation"],
    safe_to_automate=True,
)

# ==============================================================
# AZURE - SQL SERVER
# ==============================================================

AZURE_SQL_AUDITING = RemediationTemplate(
    check_id="sqlserver_auditing_enabled",
    title="SQL Server auditing must be enabled",
    cli=(
        "az sql server audit-policy update"
        " --resource-group \"{rg}\""
        " --name \"{resource}\""
        " --state Enabled"
        " --blob-storage-target-state Enabled"
        " --storage-account /subscriptions/{subscription_id}/resourceGroups/{rg}/providers/Microsoft.Storage/storageAccounts/sqlauditlogs"
        " --retention-days 90"
    ),
    terraform="""resource "azurerm_mssql_server_extended_auditing_policy" "main" {
  server_id              = azurerm_mssql_server.main.id
  storage_endpoint       = var.audit_storage_account_endpoint
  retention_in_days      = 90
  log_monitoring_enabled = true
}""",
    manual=[
        "Open Azure Portal -> SQL servers -> select {resource}.",
        "Click Auditing in the left panel (under Security).",
        "Toggle Enable Azure SQL Auditing to On.",
        "Configure the audit log destination (Storage, Log Analytics, or Event Hub).",
        "Set retention to 90 days or more.",
        "Click Save.",
    ],
    compliance=["CIS Azure 4.1.1", "NIS2 Article 21(2)(e)", "ISO 27001 A.12.4.1"],
    references=["https://learn.microsoft.com/en-us/azure/azure-sql/database/auditing-overview"],
    safe_to_automate=True,
)

AZURE_SQL_AUDITING_RETENTION = RemediationTemplate(
    check_id="sqlserver_auditing_retention_90_days",
    title="SQL Server audit log retention must be at least 90 days",
    cli="az sql server audit-policy update --resource-group \"{rg}\" --name \"{resource}\" --retention-days 90",
    terraform="""resource "azurerm_mssql_server_extended_auditing_policy" "main" {
  server_id         = azurerm_mssql_server.main.id
  retention_in_days = 90
}""",
    manual=[
        "Open Azure Portal -> SQL servers -> select {resource}.",
        "Click Auditing in the left panel.",
        "Under Storage settings, set Retention (days) to 90.",
        "Click Save.",
    ],
    compliance=["CIS Azure 4.1.3", "NIS2 Article 21(2)(e)"],
    references=["https://learn.microsoft.com/en-us/azure/azure-sql/database/auditing-overview"],
    safe_to_automate=True,
)

AZURE_SQL_TDE = RemediationTemplate(
    check_id="sqlserver_tde_encryption_enabled",
    title="Transparent Data Encryption (TDE) must be enabled on SQL databases",
    cli="az sql db tde set --resource-group \"{rg}\" --server \"{resource}\" --database your-database-name --status Enabled",
    terraform="""resource "azurerm_mssql_database_transparent_data_encryption" "main" {
  database_id = azurerm_mssql_database.main.id
  state       = "Enabled"
}""",
    manual=[
        "Open Azure Portal -> SQL databases -> select the target database on server {resource}.",
        "Click Transparent data encryption in the left panel.",
        "Set Data encryption to On.",
        "Click Save.",
    ],
    compliance=["CIS Azure 4.1.2", "NIS2 Article 21(2)(c)", "ISO 27001 A.10.1.1"],
    references=["https://learn.microsoft.com/en-us/sql/relational-databases/security/encryption/transparent-data-encryption"],
    safe_to_automate=True,
)

AZURE_SQL_ENTRA_ADMIN = RemediationTemplate(
    check_id="sqlserver_azuread_administrator_enabled",
    title="An Azure AD administrator must be configured for SQL Server",
    cli=(
        "az sql server ad-admin create"
        " --resource-group \"{rg}\""
        " --server-name \"{resource}\""
        " --display-name SQL-Security-Admins"
        " --object-id YOUR_AAD_GROUP_OBJECT_ID"
    ),
    terraform="""resource "azurerm_mssql_server" "main" {
  name                = "{resource}"
  resource_group_name = var.resource_group_name
  location            = var.location
  version             = "12.0"

  azuread_administrator {
    login_username              = "SQL-Security-Admins"
    object_id                   = var.aad_admin_group_object_id
    azuread_authentication_only = true
  }
}""",
    manual=[
        "Open Azure Portal -> SQL servers -> select {resource}.",
        "Click Microsoft Entra admin in the left panel (under Settings).",
        "Click Set admin and search for an Azure AD user or group.",
        "Select the admin and click Select -> Save.",
    ],
    compliance=["CIS Azure 4.1.4", "NIS2 Article 21(2)(j)", "ISO 27001 A.9.2.3"],
    references=["https://learn.microsoft.com/en-us/azure/azure-sql/database/authentication-aad-configure"],
    safe_to_automate=False,
)

AZURE_SQL_DEFENDER = RemediationTemplate(
    check_id="sqlserver_microsoft_defender_enabled",
    title="Microsoft Defender for SQL should be enabled",
    cli=(
        "az sql server advanced-threat-protection-setting update"
        " --resource-group \"{rg}\""
        " --server \"{resource}\""
        " --state Enabled"
    ),
    terraform="""resource "azurerm_mssql_server_security_alert_policy" "main" {
  resource_group_name  = var.resource_group_name
  server_name          = "{resource}"
  state                = "Enabled"
  email_account_admins = true
  retention_days       = 90
}""",
    manual=[
        "Open Azure Portal -> SQL servers -> select {resource}.",
        "Click Microsoft Defender for SQL in the left panel.",
        "Click Enable Microsoft Defender for SQL.",
        "Configure vulnerability assessment settings and alert email addresses.",
        "Click Save.",
    ],
    compliance=["CIS Azure 4.2.1", "NIS2 Article 21(2)(b)"],
    references=["https://learn.microsoft.com/en-us/azure/azure-sql/database/azure-defender-for-sql"],
    safe_to_automate=True,
)

# ==============================================================
# AZURE - VM
# ==============================================================

AZURE_VM_JIT = RemediationTemplate(
    check_id="vm_jit_access_enabled",
    title="Just-in-Time (JIT) VM access should be enabled",
    cli=(
        "az security jit-policy create"
        " --resource-group \"{rg}\""
        " --vm-name \"{resource}\""
        " --location \"{region}\""
        " --policy '[{"virtualMachines": ["/subscriptions/{subscription_id}/resourceGroups/{rg}/providers/Microsoft.Compute/virtualMachines/{resource}"], "ports": [{"number": 22, "protocol": "TCP", "allowedSourceAddressPrefix": "VirtualNetwork", "maxRequestAccessDuration": "PT3H"}]}]'"
    ),
    terraform="# JIT is configured via Microsoft Defender for Cloud portal.\n# Recommended: block SSH/RDP at NSG level and use Azure Bastion instead.",
    manual=[
        "Open Azure Portal -> Microsoft Defender for Cloud -> Workload protections -> Just-in-time VM access.",
        "Select the Not configured tab and find VM {resource}.",
        "Click Enable JIT on VM -> configure allowed ports (22, 3389) and max access duration.",
        "Click Save.",
        "To request access: Defender for Cloud -> JIT VM access -> select VM -> Request access.",
    ],
    compliance=["CIS Azure 7.5", "NIS2 Article 21(2)(h)", "ISO 27001 A.9.4.2"],
    references=["https://learn.microsoft.com/en-us/azure/defender-for-cloud/just-in-time-access-usage"],
    safe_to_automate=False,
)

AZURE_VM_SSH_AUTH = RemediationTemplate(
    check_id="vm_linux_enforce_ssh_authentication",
    title="Linux VMs must enforce SSH key authentication (no password auth)",
    cli=(
        "az vm run-command invoke"
        " --resource-group \"{rg}\""
        " --name \"{resource}\""
        " --command-id RunShellScript"
        " --scripts \"sudo sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && sudo systemctl restart sshd\""
    ),
    terraform="""resource "azurerm_linux_virtual_machine" "main" {
  name                = "{resource}"
  resource_group_name = var.resource_group_name
  location            = var.location
  size                = "Standard_B2s"
  admin_username      = "azureuser"

  disable_password_authentication = true
  admin_ssh_key {
    username   = "azureuser"
    public_key = file("~/.ssh/id_rsa.pub")
  }
}""",
    manual=[
        "SSH into the VM {resource} using your current credentials.",
        "Edit /etc/ssh/sshd_config as root: sudo nano /etc/ssh/sshd_config",
        "Set: PasswordAuthentication no",
        "Ensure: PubkeyAuthentication yes",
        "Restart: sudo systemctl restart sshd",
        "Ensure your SSH public key is in ~/.ssh/authorized_keys before logging out.",
    ],
    compliance=["CIS Azure 7.6", "NIS2 Article 21(2)(h)", "ISO 27001 A.9.4.2"],
    references=["https://learn.microsoft.com/en-us/azure/virtual-machines/linux/create-ssh-secured-vm-from-template"],
    safe_to_automate=False,
)

AZURE_VM_BACKUP = RemediationTemplate(
    check_id="vm_backup_enabled",
    title="VM backup should be enabled via Azure Backup",
    cli=(
        "az backup vault create"
        " --resource-group \"{rg}\""
        " --name rsv-{rg}"
        " --location \"{region}\"\n"
        "az backup protection enable-for-vm"
        " --resource-group \"{rg}\""
        " --vault-name rsv-{rg}"
        " --vm \"{resource}\""
        " --policy-name DefaultPolicy"
    ),
    terraform="""resource "azurerm_backup_protected_vm" "main" {
  resource_group_name = var.resource_group_name
  recovery_vault_name = var.recovery_vault_name
  source_vm_id        = azurerm_linux_virtual_machine.main.id
  backup_policy_id    = var.backup_policy_id
}""",
    manual=[
        "Open Azure Portal -> Virtual machines -> select {resource}.",
        "Click Backup in the left panel.",
        "Select or create a Recovery Services vault.",
        "Choose a backup policy (Daily, with 30+ day retention).",
        "Click Enable backup.",
    ],
    compliance=["CIS Azure 7.4", "NIS2 Article 21(2)(c)", "ISO 27001 A.12.3.1"],
    references=["https://learn.microsoft.com/en-us/azure/backup/quick-backup-vm-portal"],
    safe_to_automate=True,
)

AZURE_VM_MANAGED_DISKS = RemediationTemplate(
    check_id="vm_ensure_using_managed_disks",
    title="VMs should use managed disks",
    cli="az vm convert --resource-group \"{rg}\" --name \"{resource}\"",
    terraform="""resource "azurerm_linux_virtual_machine" "main" {
  name                = "{resource}"
  resource_group_name = var.resource_group_name
  location            = var.location
  size                = "Standard_B2s"
  admin_username      = "azureuser"

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Premium_LRS"
    # Managed disk - no storage_uri needed
  }
}""",
    manual=[
        "Open Azure Portal -> Virtual machines -> select {resource}.",
        "Click Stop to deallocate the VM.",
        "Click Disks in the left panel -> click Migrate to managed disks.",
        "Click Migrate to confirm.",
        "Start the VM again after migration completes.",
    ],
    compliance=["CIS Azure 7.2", "ISO 27001 A.11.1.1"],
    references=["https://learn.microsoft.com/en-us/azure/virtual-machines/windows/convert-unmanaged-to-managed-disks"],
    safe_to_automate=False,
)

# ==============================================================
# AZURE - AKS
# ==============================================================

AZURE_AKS_RBAC = RemediationTemplate(
    check_id="aks_cluster_rbac_enabled",
    title="AKS cluster should have Kubernetes RBAC enabled",
    cli=(
        "# RBAC must be enabled at cluster creation time - cannot be enabled on existing clusters.\n"
        "az aks create"
        " --resource-group \"{rg}\""
        " --name \"{resource}\""
        " --enable-rbac"
        " --enable-azure-rbac"
        " --node-count 3"
        " --generate-ssh-keys"
    ),
    terraform="""resource "azurerm_kubernetes_cluster" "main" {
  name                = "{resource}"
  location            = var.location
  resource_group_name = var.resource_group_name
  dns_prefix          = "{resource}"

  role_based_access_control_enabled = true

  azure_active_directory_role_based_access_control {
    managed            = true
    azure_rbac_enabled = true
  }

  default_node_pool {
    name       = "default"
    node_count = 3
    vm_size    = "Standard_DS2_v2"
  }

  identity { type = "SystemAssigned" }
}""",
    manual=[
        "IMPORTANT: Kubernetes RBAC cannot be enabled on an existing AKS cluster.",
        "Create a new AKS cluster with RBAC enabled and migrate workloads.",
        "Open Azure Portal -> Kubernetes services -> + Create.",
        "In the Authentication tab, ensure Kubernetes RBAC is checked.",
        "Also enable Azure Active Directory authentication for full AAD-RBAC integration.",
    ],
    compliance=["CIS Azure 5.1.1", "NIS2 Article 21(2)(j)", "ISO 27001 A.9.2.3"],
    references=["https://learn.microsoft.com/en-us/azure/aks/concepts-identity#role-based-access-controls-rbac"],
    safe_to_automate=False,
)

AZURE_AKS_PRIVATE = RemediationTemplate(
    check_id="aks_clusters_public_access_disabled",
    title="AKS cluster API server should not be publicly accessible",
    cli=(
        "az aks update"
        " --resource-group \"{rg}\""
        " --name \"{resource}\""
        " --api-server-authorized-ip-ranges YOUR_CORP_CIDR/32"
    ),
    terraform="""resource "azurerm_kubernetes_cluster" "main" {
  name                = "{resource}"
  location            = var.location
  resource_group_name = var.resource_group_name
  dns_prefix          = "{resource}"

  api_server_access_profile {
    authorized_ip_ranges = ["YOUR_CORP_CIDR/32"]
  }
}""",
    manual=[
        "Open Azure Portal -> Kubernetes services -> select {resource}.",
        "Click Networking in the left panel.",
        "Under Cluster networking, click Set authorized IP ranges.",
        "Enter your corporate IP ranges (e.g. 203.0.113.0/24).",
        "For fully private access, enable Private cluster (requires re-creation).",
        "Click Save.",
    ],
    compliance=["CIS Azure 5.1.3", "NIS2 Article 21(2)(h)"],
    references=["https://learn.microsoft.com/en-us/azure/aks/api-server-authorized-ip-ranges"],
    safe_to_automate=False,
)

# ==============================================================
# AZURE - MONITOR
# ==============================================================

AZURE_MONITOR_DIAGNOSTIC_SETTINGS = RemediationTemplate(
    check_id="monitor_diagnostic_settings_exists",
    title="Azure Monitor diagnostic settings must be configured",
    cli=(
        "az monitor diagnostic-settings create"
        " --name subscription-diagnostics"
        " --resource /subscriptions/{subscription_id}"
        " --logs '[{"category": "Administrative", "enabled": true},{"category": "Security", "enabled": true},{"category": "ServiceHealth", "enabled": true},{"category": "Alert", "enabled": true},{"category": "Policy", "enabled": true}]'"
        " --workspace /subscriptions/{subscription_id}/resourceGroups/{rg}/providers/Microsoft.OperationalInsights/workspaces/law-security"
    ),
    terraform="""resource "azurerm_monitor_diagnostic_setting" "subscription" {
  name               = "subscription-diagnostics"
  target_resource_id = "/subscriptions/{subscription_id}"
  log_analytics_workspace_id = var.law_workspace_id

  enabled_log { category = "Administrative" }
  enabled_log { category = "Security" }
  enabled_log { category = "ServiceHealth" }
  enabled_log { category = "Alert" }
  enabled_log { category = "Policy" }
}""",
    manual=[
        "Open Azure Portal -> Monitor -> Diagnostic settings.",
        "Click + Add diagnostic setting for the subscription or resource.",
        "Enable log categories: Administrative, Security, Alert, Policy.",
        "Route logs to a Log Analytics workspace for centralized analysis.",
        "Click Save.",
    ],
    compliance=["CIS Azure 5.1.1", "NIS2 Article 21(2)(e)", "ISO 27001 A.12.4.1"],
    references=["https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/diagnostic-settings"],
    safe_to_automate=True,
)

# ==============================================================
# AWS - IAM
# ==============================================================

AWS_IAM_MFA_ROOT = RemediationTemplate(
    check_id="iam_root_hardware_mfa_enabled",
    title="Root account must have MFA enabled",
    cli="# MFA for root cannot be set via CLI - must be done in the Console.\naws iam get-account-summary --query 'SummaryMap.AccountMFAEnabled'",
    terraform="""# Root MFA cannot be managed via Terraform.
# Enforce via Service Control Policies:
resource "aws_organizations_policy" "require_mfa" {
  name = "RequireMFAForRoot"
  content = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Deny"
      Action   = "*"
      Resource = "*"
      Condition = {
        BoolIfExists = { "aws:MultiFactorAuthPresent" = "false" }
      }
    }]
  })
}""",
    manual=[
        "Sign in to AWS Management Console as the root user.",
        "Click the account name (top right) -> Security credentials.",
        "Under Multi-factor authentication (MFA) -> click Assign MFA device.",
        "Choose a virtual MFA app (Authenticator App) or hardware TOTP device.",
        "Follow the wizard to scan the QR code and confirm two consecutive MFA codes.",
        "Click Add MFA.",
    ],
    compliance=["CIS AWS 1.5", "NIS2 Article 21(2)(j)", "ISO 27001 A.9.4.2"],
    references=["https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user.html#id_root-user_manage_mfa"],
    safe_to_automate=False,
)

AWS_IAM_PASSWORD_POLICY = RemediationTemplate(
    check_id="iam_password_policy_uppercase",
    title="IAM password policy must be strong (uppercase, lowercase, numbers, symbols, min 14)",
    cli=(
        "aws iam update-account-password-policy"
        " --require-uppercase-characters"
        " --require-lowercase-characters"
        " --require-numbers"
        " --require-symbols"
        " --minimum-password-length 14"
        " --password-reuse-prevention 24"
        " --max-password-age 90"
    ),
    terraform="""resource "aws_iam_account_password_policy" "strict" {
  minimum_password_length        = 14
  require_uppercase_characters   = true
  require_lowercase_characters   = true
  require_numbers                = true
  require_symbols                = true
  allow_users_to_change_password = true
  max_password_age               = 90
  password_reuse_prevention      = 24
}""",
    manual=[
        "Open AWS Management Console -> IAM -> Account settings.",
        "Under Password policy click Edit.",
        "Check all requirements: Uppercase, Lowercase, Numbers, Symbols.",
        "Set Minimum password length to 14.",
        "Set Password expiration to 90 days.",
        "Set Prevent password reuse to 24.",
        "Click Save changes.",
    ],
    compliance=["CIS AWS 1.8", "NIS2 Article 21(2)(j)", "ISO 27001 A.9.4.3"],
    references=["https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_passwords_account-policy.html"],
    safe_to_automate=True,
)

AWS_ACCESS_ANALYZER = RemediationTemplate(
    check_id="accessanalyzer_enabled",
    title="AWS IAM Access Analyzer must be enabled",
    cli="aws accessanalyzer create-analyzer --analyzer-name security-analyzer-{region} --type ACCOUNT --region \"{region}\"",
    terraform="""resource "aws_accessanalyzer_analyzer" "main" {
  analyzer_name = "security-analyzer"
  type          = "ACCOUNT"
}""",
    manual=[
        "Open AWS Management Console -> IAM -> Access analyzer (left panel).",
        "Click Create analyzer.",
        "Enter a name (e.g. security-analyzer-prod) and select Account as the zone of trust.",
        "Click Create analyzer.",
        "Review any findings reported for publicly accessible resources.",
    ],
    compliance=["CIS AWS 1.20", "NIS2 Article 21(2)(e)", "ISO 27001 A.9.4.1"],
    references=["https://docs.aws.amazon.com/IAM/latest/UserGuide/what-is-access-analyzer.html"],
    safe_to_automate=True,
)

# ==============================================================
# AWS - S3
# ==============================================================

AWS_S3_PUBLIC_ACCESS_BLOCK = RemediationTemplate(
    check_id="s3_bucket_level_public_access_block",
    title="S3 bucket public access block settings must be enabled",
    cli=(
        "aws s3api put-public-access-block"
        " --bucket \"{resource}\""
        " --public-access-block-configuration"
        " BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
    ),
    terraform="""resource "aws_s3_bucket_public_access_block" "main" {
  bucket = "{resource}"

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}""",
    manual=[
        "Open AWS Management Console -> Amazon S3 -> select bucket {resource}.",
        "Click the Permissions tab.",
        "Under Block public access (bucket settings) -> click Edit.",
        "Check all 4 options: Block all public access.",
        "Click Save changes -> confirm by typing confirm.",
    ],
    compliance=["CIS AWS 2.1.2", "NIS2 Article 21(2)(c)", "ISO 27001 A.9.4.1"],
    references=["https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html"],
    safe_to_automate=True,
)

AWS_S3_SSL = RemediationTemplate(
    check_id="s3_bucket_ssl_requests_only",
    title="S3 bucket policy must deny HTTP (non-SSL) requests",
    cli=(
        "aws s3api put-bucket-policy"
        " --bucket \"{resource}\""
        " --policy '{"Version": "2012-10-17", "Statement": [{"Sid": "DenyNonSSL", "Effect": "Deny", "Principal": "*", "Action": "s3:*", "Resource": ["arn:aws:s3:::{resource}", "arn:aws:s3:::{resource}/*"], "Condition": {"Bool": {"aws:SecureTransport": "false"}}}]}'"
    ),
    terraform="""resource "aws_s3_bucket_policy" "enforce_ssl" {
  bucket = "{resource}"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyNonSSL"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [
        "arn:aws:s3:::{resource}",
        "arn:aws:s3:::{resource}/*"
      ]
      Condition = {
        Bool = { "aws:SecureTransport" = "false" }
      }
    }]
  })
}""",
    manual=[
        "Open AWS Management Console -> Amazon S3 -> select bucket {resource}.",
        "Click the Permissions tab -> Bucket policy -> Edit.",
        "Add a Deny statement for aws:SecureTransport: false.",
        "Click Save changes.",
    ],
    compliance=["CIS AWS 2.1.1", "NIS2 Article 21(2)(c)", "PCI DSS 4.2.1"],
    references=["https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html"],
    safe_to_automate=True,
)

AWS_S3_VERSIONING = RemediationTemplate(
    check_id="s3_bucket_versioning_enabled",
    title="S3 bucket versioning must be enabled",
    cli="aws s3api put-bucket-versioning --bucket \"{resource}\" --versioning-configuration Status=Enabled",
    terraform="""resource "aws_s3_bucket_versioning" "main" {
  bucket = "{resource}"
  versioning_configuration {
    status = "Enabled"
  }
}""",
    manual=[
        "Open AWS Management Console -> Amazon S3 -> select bucket {resource}.",
        "Click the Properties tab.",
        "Under Bucket Versioning -> click Edit -> select Enable.",
        "Click Save changes.",
    ],
    compliance=["CIS AWS 2.1.3", "NIS2 Article 21(2)(c)", "ISO 27001 A.12.3.1"],
    references=["https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html"],
    safe_to_automate=True,
)

# ==============================================================
# AWS - CLOUDTRAIL
# ==============================================================

AWS_CLOUDTRAIL = RemediationTemplate(
    check_id="cloudtrail_multi_region_enabled",
    title="CloudTrail multi-region logging must be enabled",
    cli=(
        "aws cloudtrail create-trail"
        " --name security-trail-global"
        " --s3-bucket-name cloudtrail-logs-{account_id}"
        " --is-multi-region-trail"
        " --enable-log-file-validation"
        " --include-global-service-events\n"
        "aws cloudtrail start-logging --name security-trail-global"
    ),
    terraform="""resource "aws_cloudtrail" "main" {
  name                          = "security-trail-global"
  s3_bucket_name                = aws_s3_bucket.cloudtrail_logs.id
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  include_global_service_events = true

  event_selector {
    read_write_type           = "All"
    include_management_events = true
  }
}

resource "aws_s3_bucket" "cloudtrail_logs" {
  bucket        = "cloudtrail-logs-{account_id}"
  force_destroy = false
}""",
    manual=[
        "Open AWS Management Console -> CloudTrail -> Trails.",
        "Click Create trail.",
        "Enable Apply trail to all regions (multi-region).",
        "Enable Log file validation and SSE-KMS encryption.",
        "Choose or create an S3 bucket for log storage.",
        "Enable Management events for all read/write activity.",
        "Click Create trail.",
    ],
    compliance=["CIS AWS 3.1", "NIS2 Article 21(2)(e)", "ISO 27001 A.12.4.1"],
    references=["https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-create-and-update-a-trail.html"],
    safe_to_automate=True,
)

# ==============================================================
# AWS - EC2 SECURITY GROUPS
# ==============================================================

AWS_SG_SSH = RemediationTemplate(
    check_id="ec2_securitygroup_allow_ingress_from_internet_to_port_22",
    title="Security group must not allow SSH (port 22) from the internet",
    cli=(
        "# Remove the overly permissive rule\n"
        "aws ec2 revoke-security-group-ingress --group-id \"{resource}\" --protocol tcp --port 22 --cidr 0.0.0.0/0\n"
        "# Add a restricted rule for your corporate IP\n"
        "aws ec2 authorize-security-group-ingress --group-id \"{resource}\" --protocol tcp --port 22 --cidr YOUR_CORP_IP/32"
    ),
    terraform="""resource "aws_security_group_rule" "restrict_ssh" {
  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = [var.corporate_cidr]  # e.g. "10.0.0.0/8"
  security_group_id = "{resource}"
  description       = "SSH restricted to corporate network"
}
# Do NOT include a 0.0.0.0/0 rule""",
    manual=[
        "Open AWS Management Console -> EC2 -> Security Groups.",
        "Select security group {resource}.",
        "Click the Inbound rules tab -> Edit inbound rules.",
        "Find the rule with Port 22 and Source 0.0.0.0/0 or ::/0.",
        "Change the Source to your corporate IP range or delete the rule.",
        "Consider using AWS Systems Manager Session Manager instead of SSH.",
        "Click Save rules.",
    ],
    compliance=["CIS AWS 5.2", "NIS2 Article 21(2)(h)", "ISO 27001 A.13.1.3"],
    references=["https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-rules.html"],
    safe_to_automate=False,
)

AWS_SG_RDP = RemediationTemplate(
    check_id="ec2_securitygroup_allow_ingress_from_internet_to_port_3389",
    title="Security group must not allow RDP (port 3389) from the internet",
    cli=(
        "aws ec2 revoke-security-group-ingress --group-id \"{resource}\" --protocol tcp --port 3389 --cidr 0.0.0.0/0\n"
        "aws ec2 authorize-security-group-ingress --group-id \"{resource}\" --protocol tcp --port 3389 --cidr YOUR_CORP_IP/32"
    ),
    terraform="""resource "aws_security_group_rule" "restrict_rdp" {
  type              = "ingress"
  from_port         = 3389
  to_port           = 3389
  protocol          = "tcp"
  cidr_blocks       = [var.corporate_cidr]
  security_group_id = "{resource}"
  description       = "RDP restricted to corporate network"
}""",
    manual=[
        "Open AWS Management Console -> EC2 -> Security Groups -> select {resource}.",
        "Click Inbound rules -> Edit inbound rules.",
        "Find the RDP rule (port 3389, source 0.0.0.0/0) and restrict source to corporate CIDR.",
        "Consider using AWS Systems Manager Fleet Manager for RDP instead.",
        "Click Save rules.",
    ],
    compliance=["CIS AWS 5.3", "NIS2 Article 21(2)(h)", "ISO 27001 A.13.1.3"],
    references=["https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-rules.html"],
    safe_to_automate=False,
)

# ==============================================================
# AWS - LAMBDA
# ==============================================================

AWS_LAMBDA_PUBLIC = RemediationTemplate(
    check_id="awslambda_function_not_publicly_accessible",
    title="Lambda function must not be publicly accessible",
    cli=(
        "# Remove the public resource-based policy statement\n"
        "aws lambda remove-permission --function-name \"{resource}\" --statement-id PublicAccess\n"
        "# Verify resulting policy\n"
        "aws lambda get-policy --function-name \"{resource}\""
    ),
    terraform="""# Only grant access to specific services/accounts - never Principal = "*"
resource "aws_lambda_permission" "internal_only" {
  statement_id  = "AllowInternalInvoke"
  action        = "lambda:InvokeFunction"
  function_name = "{resource}"
  principal     = "events.amazonaws.com"
  source_arn    = var.event_rule_arn
}""",
    manual=[
        "Open AWS Management Console -> Lambda -> select function {resource}.",
        "Click Configuration -> Permissions.",
        "Under Resource-based policy statements, review each statement.",
        "Delete any statement with Principal * or that grants access to all principals.",
        "Click Save.",
    ],
    compliance=["CIS AWS 3.10", "NIS2 Article 21(2)(h)", "ISO 27001 A.13.1.3"],
    references=["https://docs.aws.amazon.com/lambda/latest/dg/access-control-resource-based.html"],
    safe_to_automate=False,
)

AWS_LAMBDA_VPC = RemediationTemplate(
    check_id="awslambda_function_inside_vpc",
    title="Lambda function should run inside a VPC",
    cli=(
        "aws lambda update-function-configuration"
        " --function-name \"{resource}\""
        " --vpc-config SubnetIds=subnet-xxxxx,subnet-yyyyy,SecurityGroupIds=sg-zzzzz"
    ),
    terraform="""resource "aws_lambda_function" "main" {
  function_name = "{resource}"

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }
}""",
    manual=[
        "Open AWS Management Console -> Lambda -> select function {resource}.",
        "Click Configuration -> VPC.",
        "Click Edit and select the target VPC.",
        "Choose private subnets (not public-facing) and a security group.",
        "Click Save.",
    ],
    compliance=["CIS AWS 3.11", "NIS2 Article 21(2)(h)"],
    references=["https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html"],
    safe_to_automate=False,
)

# ==============================================================
# OCI - IDENTITY
# ==============================================================

OCI_IDENTITY_MFA = RemediationTemplate(
    check_id="identity_user_mfa_enabled_console_access",
    title="OCI console users must have MFA enabled",
    cli=(
        "# List users without MFA\n"
        "oci iam user list --all --query 'data[?\"is-mfa-activated\"==`false`].{name:name,id:id}'\n"
        "# Create policy requiring MFA for sensitive operations\n"
        "oci iam policy create"
        " --compartment-id \"{tenancy_id}\""
        " --name require-mfa-policy"
        " --description \"Require MFA for all console users\""
        " --statements '["Allow group Administrators to manage all-resources in tenancy where request.user.mfaTotpVerified=true"]'"
    ),
    terraform="""resource "oci_identity_policy" "require_mfa" {
  compartment_id = var.tenancy_id
  name           = "require-mfa-policy"
  description    = "Require MFA for all console users"
  statements = [
    "Allow group Administrators to manage all-resources in tenancy where request.user.mfaTotpVerified=true"
  ]
}""",
    manual=[
        "Sign in to OCI Console -> click your user name (top right) -> User Settings.",
        "Under Multi-Factor Authentication, click Enable Authenticator App.",
        "Scan the QR code with an authenticator app and enter the one-time code.",
        "Click Enable.",
        "For enforcement: Identity & Security -> Users -> select each user -> enable MFA.",
    ],
    compliance=["CIS OCI 1.9", "NIS2 Article 21(2)(j)", "ISO 27001 A.9.4.2"],
    references=["https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/usingmfa.htm"],
    safe_to_automate=False,
)

OCI_IDENTITY_API_KEYS = RemediationTemplate(
    check_id="identity_user_api_keys_rotated_90_days",
    title="OCI user API keys must be rotated within 90 days",
    cli=(
        "# List API keys\n"
        "oci iam user api-key list --user-id \"{resource}\"\n"
        "# Delete an old key\n"
        "oci iam user api-key delete --user-id \"{resource}\" --fingerprint OLD_KEY_FINGERPRINT\n"
        "# Upload a new key\n"
        "oci iam user api-key upload --user-id \"{resource}\" --key \"$(cat ~/.oci/oci_api_key_public.pem)\""
    ),
    terraform="""resource "oci_identity_api_key" "main" {
  user_id   = var.user_id
  key_value = var.api_public_key_content
}""",
    manual=[
        "Sign in to OCI Console -> Identity & Security -> Users -> select the user.",
        "Click API Keys in the left panel.",
        "Identify keys older than 90 days (check the Created date).",
        "Click the three-dot menu on the old key -> Delete.",
        "Click Add API Key to add a fresh key pair.",
        "Download the new private key and update the application configuration.",
    ],
    compliance=["CIS OCI 1.3", "NIS2 Article 21(2)(i)", "ISO 27001 A.9.4.3"],
    references=["https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingcredentials.htm"],
    safe_to_automate=False,
)

OCI_IDENTITY_PASSWORD_POLICY = RemediationTemplate(
    check_id="identity_password_policy_minimum_length_14",
    title="OCI password policy must enforce minimum 14 character length",
    cli=(
        "oci iam authentication-policy update"
        " --compartment-id \"{tenancy_id}\""
        " --password-policy '{"minimumPasswordLength": 14, "isUppercaseCharactersRequired": true, "isLowercaseCharactersRequired": true, "isNumericCharactersRequired": true, "isSpecialCharactersRequired": true, "isUsernameContainmentAllowed": false}'"
    ),
    terraform="""resource "oci_identity_authentication_policy" "main" {
  compartment_id = var.tenancy_id

  password_policy {
    minimum_password_length          = 14
    is_uppercase_characters_required = true
    is_lowercase_characters_required = true
    is_numeric_characters_required   = true
    is_special_characters_required   = true
    is_username_containment_allowed  = false
  }
}""",
    manual=[
        "Sign in to OCI Console -> Identity & Security -> Authentication Settings.",
        "Click Edit next to Password Policy.",
        "Set Minimum password length to 14.",
        "Enable Uppercase, Lowercase, Numbers, and Special characters requirements.",
        "Click Save.",
    ],
    compliance=["CIS OCI 1.7", "NIS2 Article 21(2)(j)", "ISO 27001 A.9.4.3"],
    references=["https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingpasswordrequirements.htm"],
    safe_to_automate=True,
)

# ==============================================================
# OCI - OBJECT STORAGE
# ==============================================================

OCI_OBJECTSTORAGE_PUBLIC = RemediationTemplate(
    check_id="objectstorage_bucket_not_publicly_accessible",
    title="OCI Object Storage bucket must not be publicly accessible",
    cli="oci os bucket update --name \"{resource}\" --namespace your-namespace --public-access-type NoPublicAccess",
    terraform="""resource "oci_objectstorage_bucket" "main" {
  compartment_id = var.compartment_id
  name           = "{resource}"
  namespace      = var.object_storage_namespace
  access_type    = "NoPublicAccess"
}""",
    manual=[
        "Sign in to OCI Console -> Storage -> Object Storage & Archive Storage -> Buckets.",
        "Select the bucket {resource}.",
        "Click Edit Visibility.",
        "Select Private (No Public Access).",
        "Click Save Changes.",
    ],
    compliance=["CIS OCI 4.1.1", "NIS2 Article 21(2)(c)", "ISO 27001 A.9.4.1"],
    references=["https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/managingbuckets.htm"],
    safe_to_automate=True,
)

# ==============================================================
# OCI - NETWORK
# ==============================================================

OCI_NETWORK_SSH_SECLIST = RemediationTemplate(
    check_id="network_security_list_ingress_from_internet_to_ssh_port",
    title="OCI Security List must not allow SSH (22) from the internet",
    cli=(
        "oci network security-list update"
        " --security-list-id \"{resource_id}\""
        " --ingress-security-rules '[{"source": "10.0.0.0/16", "protocol": "6", "isStateless": false, "tcpOptions": {"destinationPortRange": {"min": 22, "max": 22}}}]'"
    ),
    terraform="""resource "oci_core_security_list" "main" {
  compartment_id = var.compartment_id
  vcn_id         = var.vcn_id
  display_name   = "{resource}"

  ingress_security_rules {
    protocol  = "6"  # TCP
    source    = "10.0.0.0/16"  # Internal CIDR only
    stateless = false
    tcp_options {
      min = 22
      max = 22
    }
  }
}""",
    manual=[
        "Sign in to OCI Console -> Networking -> Virtual Cloud Networks -> select your VCN.",
        "Click Security Lists -> select the security list {resource}.",
        "Click Edit next to the SSH ingress rule with Source 0.0.0.0/0.",
        "Change Source CIDR from 0.0.0.0/0 to your corporate IP range (e.g. 10.0.0.0/16).",
        "Click Save Changes.",
        "Consider using OCI Bastion Service for secure SSH access instead.",
    ],
    compliance=["CIS OCI 2.1", "NIS2 Article 21(2)(h)", "ISO 27001 A.13.1.3"],
    references=["https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securityrules.htm"],
    safe_to_automate=False,
)

OCI_NETWORK_RDP_SECLIST = RemediationTemplate(
    check_id="network_security_list_ingress_from_internet_to_rdp_port",
    title="OCI Security List must not allow RDP (3389) from the internet",
    cli=(
        "oci network security-list update"
        " --security-list-id \"{resource_id}\""
        " --ingress-security-rules '[{"source": "10.0.0.0/16", "protocol": "6", "isStateless": false, "tcpOptions": {"destinationPortRange": {"min": 3389, "max": 3389}}}]'"
    ),
    terraform="""resource "oci_core_security_list" "main" {
  compartment_id = var.compartment_id
  vcn_id         = var.vcn_id
  display_name   = "{resource}"

  ingress_security_rules {
    protocol  = "6"
    source    = "10.0.0.0/16"
    stateless = false
    tcp_options {
      min = 3389
      max = 3389
    }
  }
}""",
    manual=[
        "Sign in to OCI Console -> Networking -> VCN -> Security Lists.",
        "Select the security list {resource} -> click Edit on the RDP rule (port 3389, source 0.0.0.0/0).",
        "Change Source CIDR to your corporate IP range.",
        "Click Save Changes.",
        "Consider using OCI Bastion instead of direct RDP access.",
    ],
    compliance=["CIS OCI 2.2", "NIS2 Article 21(2)(h)"],
    references=["https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securityrules.htm"],
    safe_to_automate=False,
)

OCI_NETWORK_SSH_NSG = RemediationTemplate(
    check_id="network_security_group_ingress_from_internet_to_ssh_port",
    title="OCI NSG must not allow SSH (22) from the internet",
    cli=(
        "oci network nsg-rules update"
        " --nsg-id \"{resource_id}\""
        " --security-rules '[{"direction": "INGRESS", "protocol": "6", "source": "10.0.0.0/16", "sourceType": "CIDR_BLOCK", "tcpOptions": {"destinationPortRange": {"min": 22, "max": 22}}}]'"
    ),
    terraform="""resource "oci_core_network_security_group_security_rule" "restrict_ssh" {
  network_security_group_id = "{resource_id}"
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "10.0.0.0/16"
  source_type               = "CIDR_BLOCK"
  tcp_options {
    destination_port_range {
      min = 22
      max = 22
    }
  }
}""",
    manual=[
        "Sign in to OCI Console -> Networking -> VCN -> Network Security Groups.",
        "Select NSG {resource} -> Security Rules.",
        "Find the rule allowing port 22 from 0.0.0.0/0 -> click the pencil icon to edit.",
        "Change Source CIDR to your corporate IP range.",
        "Click Save.",
    ],
    compliance=["CIS OCI 2.1", "NIS2 Article 21(2)(h)"],
    references=["https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/networksecuritygroups.htm"],
    safe_to_automate=False,
)

OCI_NETWORK_RDP_NSG = RemediationTemplate(
    check_id="network_security_group_ingress_from_internet_to_rdp_port",
    title="OCI NSG must not allow RDP (3389) from the internet",
    cli=(
        "oci network nsg-rules update"
        " --nsg-id \"{resource_id}\""
        " --security-rules '[{"direction": "INGRESS", "protocol": "6", "source": "10.0.0.0/16", "sourceType": "CIDR_BLOCK", "tcpOptions": {"destinationPortRange": {"min": 3389, "max": 3389}}}]'"
    ),
    terraform="""resource "oci_core_network_security_group_security_rule" "restrict_rdp" {
  network_security_group_id = "{resource_id}"
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "10.0.0.0/16"
  source_type               = "CIDR_BLOCK"
  tcp_options {
    destination_port_range {
      min = 3389
      max = 3389
    }
  }
}""",
    manual=[
        "Sign in to OCI Console -> Networking -> VCN -> Network Security Groups.",
        "Select NSG {resource} -> Security Rules -> find the RDP rule with source 0.0.0.0/0.",
        "Edit and change Source CIDR to corporate IP range.",
        "Click Save.",
    ],
    compliance=["CIS OCI 2.2", "NIS2 Article 21(2)(h)"],
    references=["https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/networksecuritygroups.htm"],
    safe_to_automate=False,
)

# ==============================================================
# OCI - KMS / AUDIT / CLOUD GUARD
# ==============================================================

OCI_KMS_ROTATION = RemediationTemplate(
    check_id="kms_key_rotation_enabled",
    title="OCI KMS keys must have automatic rotation enabled",
    cli=(
        "oci kms management key update"
        " --key-id \"{resource_id}\""
        " --endpoint https://YOUR_VAULT.kms.{region}.oraclecloud.com"
        " --auto-key-rotation-status Enabled"
        " --rotation-interval-in-days 365"
    ),
    terraform="""resource "oci_kms_key" "main" {
  compartment_id      = var.compartment_id
  display_name        = "{resource}"
  management_endpoint = var.vault_management_endpoint

  key_shape {
    algorithm = "AES"
    length    = 32
  }

  auto_key_rotation_details {
    rotation_interval_in_days = 365
    is_schedule_enabled       = true
  }
}""",
    manual=[
        "Sign in to OCI Console -> Identity & Security -> Vault -> select your vault.",
        "Click Master Encryption Keys -> select the key {resource}.",
        "Click Edit -> enable Auto-Rotation.",
        "Set rotation interval to 365 days.",
        "Click Save.",
    ],
    compliance=["CIS OCI 3.7", "NIS2 Article 21(2)(i)", "ISO 27001 A.10.1.2"],
    references=["https://docs.oracle.com/en-us/iaas/Content/KeyManagement/Tasks/rotating-keys.htm"],
    safe_to_automate=True,
)

OCI_AUDIT_LOG = RemediationTemplate(
    check_id="audit_log_retention_period_365_days",
    title="OCI Audit log retention must be at least 365 days",
    cli="oci audit config update --compartment-id \"{tenancy_id}\" --retention-period-days 365",
    terraform="""resource "oci_audit_configuration" "main" {
  compartment_id        = var.tenancy_id
  retention_period_days = 365
}""",
    manual=[
        "Sign in to OCI Console -> Identity & Security -> Audit.",
        "Click Audit Retention in the left panel.",
        "Set Retention period to 365 days.",
        "Click Save.",
    ],
    compliance=["CIS OCI 3.1", "NIS2 Article 21(2)(e)", "ISO 27001 A.12.4.1"],
    references=["https://docs.oracle.com/en-us/iaas/Content/Audit/Tasks/settingauditretenionperiod.htm"],
    safe_to_automate=True,
)

OCI_CLOUDGUARD = RemediationTemplate(
    check_id="cloudguard_enabled",
    title="OCI Cloud Guard must be enabled",
    cli=(
        "oci cloud-guard configuration update"
        " --compartment-id \"{tenancy_id}\""
        " --status ENABLED"
        " --reporting-region \"{region}\""
    ),
    terraform="""resource "oci_cloud_guard_cloud_guard_configuration" "main" {
  compartment_id   = var.tenancy_id
  reporting_region = var.region
  status           = "ENABLED"
}""",
    manual=[
        "Sign in to OCI Console -> Identity & Security -> Cloud Guard.",
        "Click Enable Cloud Guard.",
        "Select the Reporting Region closest to your workloads.",
        "Accept the defaults for detector and responder recipes.",
        "Click Enable.",
    ],
    compliance=["CIS OCI 3.5", "NIS2 Article 21(2)(b)", "ISO 27001 A.12.6.1"],
    references=["https://docs.oracle.com/en-us/iaas/cloud-guard/using/cloud-guard-enable.htm"],
    safe_to_automate=True,
)

# ==============================================================
# ORACLE SAAS
# ==============================================================

ORACLE_SAAS_MFA_ADMIN = RemediationTemplate(
    check_id="iam_mfa_not_enforced_admin",
    title="Oracle SaaS admin accounts must have MFA enforced",
    cli="""# Enforce MFA via Oracle IDCS REST API
curl -X PATCH \\
  -H "Authorization: Bearer YOUR_IDCS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"schemas": ["urn:ietf:params:scim:schemas:oracle:idcs:extension:mfaSettings:User"], "urn:ietf:params:scim:schemas:oracle:idcs:extension:mfaSettings:User": {"mfaStatus": "ENROLLED", "preferredAuthenticationFactor": "TOTP"}}' \\
  "https://your-idcs-tenant.identity.oraclecloud.com/admin/v1/Users/USER_OCID" """,
    terraform="""resource "null_resource" "enforce_mfa" {
  triggers = { always_run = timestamp() }
  provisioner "local-exec" {
    command = "python3 scripts/oracle_enforce_mfa.py --user-id ${var.user_id}"
  }
}""",
    manual=[
        "Sign in to Oracle Cloud Applications as a Security Administrator.",
        "Navigate to Tools -> Security Console -> Users.",
        "Search for the admin user -> click the username.",
        "Under Authentication -> enable Multi-Factor Authentication.",
        "Or enforce MFA at group level: Tools -> Security Console -> User Categories -> edit the admin group -> enable MFA.",
        "For IDCS enforcement: IDCS Console -> Security -> Sign-On Policies -> add MFA factor to the policy.",
    ],
    compliance=["CIS Oracle ERP 1.1", "SOX ITGC CC6.1", "NIS2 Article 21(2)(j)"],
    references=["https://docs.oracle.com/en/cloud/saas/applications-common/24b/fasec/introduction-to-security.html"],
    safe_to_automate=False,
)

ORACLE_SAAS_SOD = RemediationTemplate(
    check_id="iam_sod_conflict_detected",
    title="Oracle SaaS Separation of Duties (SoD) conflict detected",
    cli="""# List conflicting role assignments via Oracle HCM REST API
curl -G \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  "https://your-tenant.oraclecloud.com/hcmRestApi/resources/11.13.18.05/roles?q=assignees.PersonId={resource}"

# Revoke conflicting role via IDCS REST API
curl -X PATCH \\
  -H "Authorization: Bearer YOUR_IDCS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"schemas":["urn:ietf:params:scim:api:messages:2.0:PatchOp"],"Operations":[{"op":"remove","path":"roles[value eq \"CONFLICTING_ROLE_OCID\"]"}]}' \\
  "https://your-tenant.identity.oraclecloud.com/admin/v1/Users/USER_OCID" """,
    terraform="""resource "oci_identity_group" "saas_roles" {
  compartment_id = var.tenancy_id
  description    = "Managed Oracle SaaS role group"
  name           = "fusion-finance-reviewers"
  # Remove conflicting members from groups that overlap SoD boundaries
}""",
    manual=[
        "Sign in to Oracle Cloud Applications as a Security Administrator.",
        "Navigate to Tools -> Security Console -> Roles.",
        "Search for the conflicting roles identified in the finding.",
        "Click the role -> Role Members tab -> identify users with both conflicting roles.",
        "Navigate to Tools -> Security Console -> Users -> select the user.",
        "Remove one of the conflicting roles by clicking the role -> Revoke.",
        "Document the SoD exception formally if access is business-justified.",
    ],
    compliance=["SOX ITGC AC-5", "CIS Oracle ERP 2.1", "ISO 27001 A.6.1.2"],
    references=["https://docs.oracle.com/en/cloud/saas/applications-common/24b/faser/manage-security-console.html"],
    safe_to_automate=False,
)

ORACLE_SAAS_SUPERUSER = RemediationTemplate(
    check_id="iam_superuser_role_assigned",
    title="Oracle SaaS superuser role should not be assigned to regular users",
    cli="""# List users with superuser roles
curl -G \\
  -H "Authorization: Bearer YOUR_IDCS_TOKEN" \\
  "https://your-tenant.identity.oraclecloud.com/admin/v1/AppRoles/SUPERUSER_ROLE_ID/Members"

# Remove user from superuser role
curl -X DELETE \\
  -H "Authorization: Bearer YOUR_IDCS_TOKEN" \\
  "https://your-tenant.identity.oraclecloud.com/admin/v1/AppRoles/SUPERUSER_ROLE_ID/Members/USER_GRANT_ID" """,
    terraform="""resource "null_resource" "revoke_superuser" {
  provisioner "local-exec" {
    command = "python3 scripts/revoke_oracle_role.py --user-id ${var.user_id} --role superuser"
  }
}""",
    manual=[
        "Sign in to Oracle Cloud Applications -> Tools -> Security Console -> Users.",
        "Search for the user with the superuser role.",
        "Click the username -> Roles tab.",
        "Locate the IT Security Manager or Application Implementation Consultant role.",
        "Click the role -> Revoke -> confirm.",
        "Document the change in the access review register.",
        "For break-glass superuser access: implement a time-limited provisioning workflow.",
    ],
    compliance=["SOX ITGC CC6.3", "CIS Oracle ERP 1.2", "ISO 27001 A.9.2.3"],
    references=["https://docs.oracle.com/en/cloud/saas/applications-common/24b/faser/overview-of-security-administration.html"],
    safe_to_automate=False,
)

ORACLE_SAAS_AUDIT_TRAIL = RemediationTemplate(
    check_id="audit_trail_disabled",
    title="Oracle SaaS audit trail must be enabled",
    cli="""curl -X POST \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"AuditPolicy": "ALL_SYSTEM_AUDIT_ACTIONS"}' \\
  "https://your-tenant.oraclecloud.com/fscmRestApi/resources/11.13.18.05/auditPolicies" """,
    terraform="""# OCI infrastructure-level audit logging
resource "oci_audit_configuration" "saas_audit" {
  compartment_id        = var.tenancy_id
  retention_period_days = 365
}""",
    manual=[
        "Sign in to Oracle Cloud Applications -> Setup and Maintenance -> Search Tasks.",
        "Search for Manage Audit Policies -> click the task.",
        "Under Audit Level select Object-Level Audit or Full Audit.",
        "Enable audit for Payments, Journal Entries, User Access, and Role Assignments.",
        "Click Save -> Deploy.",
    ],
    compliance=["SOX ITGC CC7.2", "CIS Oracle ERP 3.1", "ISO 27001 A.12.4.1"],
    references=["https://docs.oracle.com/en/cloud/saas/applications-common/24b/faser/audit-trail.html"],
    safe_to_automate=False,
)

ORACLE_SAAS_AUDIT_INCOMPLETE = RemediationTemplate(
    check_id="audit_trail_incomplete_coverage",
    title="Oracle SaaS audit trail coverage is incomplete",
    cli="""curl -X PATCH \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"auditLevel": "MEDIUM", "auditCondition": "ALL"}' \\
  "https://your-tenant.oraclecloud.com/fscmRestApi/resources/11.13.18.05/auditPolicies/POLICY_ID" """,
    terraform="""resource "null_resource" "audit_coverage" {
  provisioner "local-exec" {
    command = "python3 scripts/oracle_audit_config.py --level medium --condition all"
  }
}""",
    manual=[
        "Sign in to Oracle Cloud Applications -> Setup and Maintenance.",
        "Search for Manage Audit Policies.",
        "Review the current audit level - set to Medium or High.",
        "Ensure coverage: Users, Roles, Payments, Journal Entries, Vendor Master.",
        "Click Save and Deploy the updated audit policy.",
    ],
    compliance=["SOX ITGC CC7.2", "CIS Oracle ERP 3.2", "ISO 27001 A.12.4.1"],
    references=["https://docs.oracle.com/en/cloud/saas/applications-common/24b/faser/audit-trail.html"],
    safe_to_automate=False,
)

ORACLE_SAAS_DORMANT_ACCOUNT = RemediationTemplate(
    check_id="iam_dormant_privileged_account",
    title="Dormant privileged Oracle SaaS accounts must be disabled",
    cli="""curl -X PATCH \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"Suspended": true}' \\
  "https://your-tenant.oraclecloud.com/hcmRestApi/resources/11.13.18.05/userAccounts/{resource}" """,
    terraform="""resource "null_resource" "disable_dormant_user" {
  provisioner "local-exec" {
    command = "curl -X PATCH -H \'Authorization: Bearer ${var.token}\' -d '{\"Suspended\": true}' ${var.hcm_api_url}/userAccounts/${var.user_id}"
  }
}""",
    manual=[
        "Sign in to Oracle Cloud Applications -> Tools -> Security Console -> Users.",
        "Search for the dormant user account (identified by the finding).",
        "Click the username.",
        "Click Edit -> set User Account Status to Inactive.",
        "Click Save.",
        "If the user has active roles, revoke them before disabling.",
    ],
    compliance=["CIS Oracle ERP 1.3", "SOX ITGC CC6.2", "ISO 27001 A.9.2.6"],
    references=["https://docs.oracle.com/en/cloud/saas/applications-common/24b/faser/manage-users.html"],
    safe_to_automate=False,
)

ORACLE_SAAS_IMPLEMENTATION_ROLE = RemediationTemplate(
    check_id="iam_implementation_role_active",
    title="Oracle SaaS implementation consultant role must be inactive post-go-live",
    cli="""curl -X PATCH \\
  -H "Authorization: Bearer YOUR_IDCS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"schemas":["urn:ietf:params:scim:api:messages:2.0:PatchOp"],"Operations":[{"op":"remove","path":"roles[value eq \"APPLICATION_IMPLEMENTATION_CONSULTANT_ROLE_OCID\"]"}]}' \\
  "https://your-tenant.identity.oraclecloud.com/admin/v1/Users/{resource}" """,
    terraform="""resource "null_resource" "revoke_impl_role" {
  provisioner "local-exec" {
    command = "python3 scripts/oracle_role_manager.py --action revoke --user ${var.user_id} --role APPLICATION_IMPLEMENTATION_CONSULTANT"
  }
}""",
    manual=[
        "Sign in to Oracle Cloud Applications -> Tools -> Security Console -> Users.",
        "Search for users with Application Implementation Consultant role.",
        "For each identified user, click their name -> Roles tab.",
        "Click Application Implementation Consultant -> Revoke.",
        "Confirm revocation and notify the system owner.",
        "Document removal in the go-live access review register.",
    ],
    compliance=["SOX ITGC CC6.3", "CIS Oracle ERP 1.4", "ISO 27001 A.9.2.6"],
    references=["https://docs.oracle.com/en/cloud/saas/applications-common/24b/faser/overview-of-security-administration.html"],
    safe_to_automate=False,
)

ORACLE_SAAS_OAUTH = RemediationTemplate(
    check_id="network_oauth_app_excessive_scopes",
    title="Oracle SaaS OAuth applications must not have excessive permission scopes",
    cli="""# List OAuth application scopes
curl -G \\
  -H "Authorization: Bearer YOUR_IDCS_TOKEN" \\
  "https://your-tenant.identity.oraclecloud.com/admin/v1/Apps/{resource}?attributes=scopes,name"

# Update app to remove excessive scopes
curl -X PATCH \\
  -H "Authorization: Bearer YOUR_IDCS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"schemas":["urn:ietf:params:scim:api:messages:2.0:PatchOp"],"Operations":[{"op":"replace","path":"scopes","value":[{"value":"read_user_profile"}]}]}' \\
  "https://your-tenant.identity.oraclecloud.com/admin/v1/Apps/{resource}" """,
    terraform="""resource "null_resource" "restrict_oauth_scopes" {
  provisioner "local-exec" {
    command = "python3 scripts/oracle_oauth_manager.py --app-id ${var.app_id} --scopes read_user_profile"
  }
}""",
    manual=[
        "Sign in to Oracle IDCS Console -> Applications -> select the OAuth app {resource}.",
        "Click OAuth Configuration -> Resources -> review granted scopes.",
        "Remove any scopes that are broader than required (e.g. urn:opc:resource:consumer::all).",
        "Apply the principle of least privilege - keep only the minimum necessary scopes.",
        "Click Save.",
    ],
    compliance=["CIS Oracle ERP 4.1", "ISO 27001 A.9.4.1"],
    references=["https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingapplications.htm"],
    safe_to_automate=False,
)

ORACLE_SAAS_IP_ALLOWLIST = RemediationTemplate(
    check_id="network_ip_allowlist_not_configured",
    title="Oracle SaaS network IP allowlist must be configured",
    cli="""curl -X PUT \\
  -H "Authorization: Bearer YOUR_IDCS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"schemas": ["urn:ietf:params:scim:schemas:oracle:idcs:NetworkPerimeter"], "name": "corporate-network", "ipAddresses": [{"type": "CIDR", "value": "10.0.0.0/8"}, {"type": "CIDR", "value": "203.0.113.0/24"}]}' \\
  "https://your-tenant.identity.oraclecloud.com/admin/v1/NetworkPerimeters" """,
    terraform="""resource "null_resource" "ip_allowlist" {
  provisioner "local-exec" {
    command = "python3 scripts/oracle_network_perimeter.py --cidrs 10.0.0.0/8,203.0.113.0/24"
  }
}""",
    manual=[
        "Sign in to Oracle IDCS Console -> Security -> Network Perimeters.",
        "Click + Add and enter your corporate network CIDRs (e.g. 10.0.0.0/8, 203.0.113.0/24).",
        "Navigate to Security -> Sign-On Policies -> select the default policy.",
        "Add a rule: Include the network perimeter you just created.",
        "Set Action to Allow and save.",
        "Test access from an approved IP before enforcing.",
    ],
    compliance=["CIS Oracle ERP 4.2", "NIS2 Article 21(2)(h)", "ISO 27001 A.13.1.3"],
    references=["https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingnetworkperimeters.htm"],
    safe_to_automate=False,
)


# ==============================================================
# MASTER REGISTRY - maps all check_ids to templates
# ==============================================================

REMEDIATION_LIBRARY: dict[str, RemediationTemplate] = {
    # Azure - Network
    "network_ssh_internet_access_restricted": AZURE_NETWORK_SSH,
    "network_rdp_internet_access_restricted": AZURE_NETWORK_RDP,
    "network_http_internet_access_restricted": AZURE_NETWORK_HTTP,
    "network_udp_internet_access_restricted": AZURE_NETWORK_UDP,
    "network_bastion_host_exists": AZURE_NETWORK_BASTION,
    "network_watcher_enabled": AZURE_NETWORK_WATCHER,
    "network_flow_log_captured_sent": AZURE_NETWORK_FLOW_LOG,
    "network_flow_log_more_than_90_days": AZURE_NETWORK_FLOW_LOG_90,
    "network_vnet_ddos_protection_enabled": AZURE_NETWORK_DDOS,
    "network_subnet_nsg_associated": AZURE_NETWORK_SUBNET_NSG,
    # Azure - Storage
    "storage_blob_public_access_level_is_disabled": AZURE_STORAGE_PUBLIC_BLOB,
    "storage_secure_transfer_required_is_enabled": AZURE_STORAGE_HTTPS,
    "storage_ensure_minimum_tls_version_12": AZURE_STORAGE_TLS,
    "storage_account_public_network_access_disabled": AZURE_STORAGE_PUBLIC_NETWORK,
    "storage_account_key_access_disabled": AZURE_STORAGE_KEY_ACCESS,
    "storage_blob_versioning_is_enabled": AZURE_STORAGE_VERSIONING,
    "storage_ensure_soft_delete_is_enabled": AZURE_STORAGE_SOFT_DELETE,
    "storage_cross_tenant_replication_disabled": AZURE_STORAGE_CROSS_TENANT,
    "storage_default_network_access_rule_is_denied": AZURE_STORAGE_NETWORK_DENY,
    "storage_geo_redundant_enabled": AZURE_STORAGE_GEO,
    "storage_key_rotation_90_days": AZURE_STORAGE_KEY_ROTATION,
    "storage_default_to_entra_authorization_enabled": AZURE_STORAGE_ENTRA_AUTH,
    "storage_ensure_private_endpoints_in_storage_accounts": AZURE_STORAGE_PRIVATE_ENDPOINT,
    "storage_infrastructure_encryption_is_enabled": AZURE_STORAGE_INFRA_ENCRYPTION,
    # Azure - Entra ID
    "entra_privileged_user_has_mfa": AZURE_ENTRA_MFA_PRIVILEGED,
    "entra_non_privileged_user_has_mfa": AZURE_ENTRA_MFA_NON_PRIVILEGED,
    "entra_security_defaults_enabled": AZURE_ENTRA_SECURITY_DEFAULTS,
    "entra_conditional_access_policy_require_mfa_for_admin_portals": AZURE_ENTRA_MFA_ADMIN_PORTAL,
    "entra_conditional_access_policy_require_mfa_for_management_api": AZURE_ENTRA_MFA_ADMIN_PORTAL,
    "entra_global_admin_in_less_than_five_users": AZURE_ENTRA_GLOBAL_ADMINS,
    # Azure - Key Vault
    "keyvault_rbac_enabled": AZURE_KEYVAULT_RBAC,
    "keyvault_recoverable": AZURE_KEYVAULT_RECOVERABLE,
    "keyvault_logging_enabled": AZURE_KEYVAULT_LOGGING,
    "keyvault_key_rotation_enabled": AZURE_KEYVAULT_KEY_ROTATION,
    # Azure - SQL
    "sqlserver_auditing_enabled": AZURE_SQL_AUDITING,
    "sqlserver_auditing_retention_90_days": AZURE_SQL_AUDITING_RETENTION,
    "sqlserver_tde_encryption_enabled": AZURE_SQL_TDE,
    "sqlserver_azuread_administrator_enabled": AZURE_SQL_ENTRA_ADMIN,
    "sqlserver_microsoft_defender_enabled": AZURE_SQL_DEFENDER,
    # Azure - VM
    "vm_jit_access_enabled": AZURE_VM_JIT,
    "vm_linux_enforce_ssh_authentication": AZURE_VM_SSH_AUTH,
    "vm_backup_enabled": AZURE_VM_BACKUP,
    "vm_ensure_using_managed_disks": AZURE_VM_MANAGED_DISKS,
    # Azure - AKS
    "aks_cluster_rbac_enabled": AZURE_AKS_RBAC,
    "aks_clusters_public_access_disabled": AZURE_AKS_PRIVATE,
    # Azure - Monitor
    "monitor_diagnostic_settings_exists": AZURE_MONITOR_DIAGNOSTIC_SETTINGS,
    # AWS - IAM
    "iam_root_hardware_mfa_enabled": AWS_IAM_MFA_ROOT,
    "iam_root_mfa_enabled": AWS_IAM_MFA_ROOT,
    "iam_password_policy_uppercase": AWS_IAM_PASSWORD_POLICY,
    "iam_password_policy_lowercase": AWS_IAM_PASSWORD_POLICY,
    "iam_password_policy_number": AWS_IAM_PASSWORD_POLICY,
    "iam_password_policy_symbol": AWS_IAM_PASSWORD_POLICY,
    "iam_password_policy_minimum_length_14": AWS_IAM_PASSWORD_POLICY,
    "accessanalyzer_enabled": AWS_ACCESS_ANALYZER,
    "accessanalyzer_enabled_without_findings": AWS_ACCESS_ANALYZER,
    # AWS - S3
    "s3_bucket_level_public_access_block": AWS_S3_PUBLIC_ACCESS_BLOCK,
    "s3_bucket_public_access_block": AWS_S3_PUBLIC_ACCESS_BLOCK,
    "s3_bucket_acl_prohibit_public_write_access": AWS_S3_PUBLIC_ACCESS_BLOCK,
    "s3_bucket_ssl_requests_only": AWS_S3_SSL,
    "s3_bucket_versioning_enabled": AWS_S3_VERSIONING,
    # AWS - CloudTrail
    "cloudtrail_multi_region_enabled": AWS_CLOUDTRAIL,
    "cloudtrail_multi_region_trail_enabled": AWS_CLOUDTRAIL,
    # AWS - EC2 Security Groups
    "ec2_securitygroup_allow_ingress_from_internet_to_port_22": AWS_SG_SSH,
    "ec2_securitygroup_allow_ingress_from_internet_to_port_3389": AWS_SG_RDP,
    # AWS - Lambda
    "awslambda_function_not_publicly_accessible": AWS_LAMBDA_PUBLIC,
    "awslambda_function_inside_vpc": AWS_LAMBDA_VPC,
    # OCI - Identity
    "identity_user_mfa_enabled_console_access": OCI_IDENTITY_MFA,
    "identity_user_api_keys_rotated_90_days": OCI_IDENTITY_API_KEYS,
    "identity_password_policy_minimum_length_14": OCI_IDENTITY_PASSWORD_POLICY,
    # OCI - Object Storage
    "objectstorage_bucket_not_publicly_accessible": OCI_OBJECTSTORAGE_PUBLIC,
    # OCI - Network
    "network_security_list_ingress_from_internet_to_ssh_port": OCI_NETWORK_SSH_SECLIST,
    "network_security_group_ingress_from_internet_to_ssh_port": OCI_NETWORK_SSH_NSG,
    "network_security_list_ingress_from_internet_to_rdp_port": OCI_NETWORK_RDP_SECLIST,
    "network_security_group_ingress_from_internet_to_rdp_port": OCI_NETWORK_RDP_NSG,
    # OCI - KMS / Audit / Cloud Guard
    "kms_key_rotation_enabled": OCI_KMS_ROTATION,
    "audit_log_retention_period_365_days": OCI_AUDIT_LOG,
    "cloudguard_enabled": OCI_CLOUDGUARD,
    # Oracle SaaS
    "iam_mfa_not_enforced_admin": ORACLE_SAAS_MFA_ADMIN,
    "iam_sod_conflict_detected": ORACLE_SAAS_SOD,
    "iam_superuser_role_assigned": ORACLE_SAAS_SUPERUSER,
    "audit_trail_disabled": ORACLE_SAAS_AUDIT_TRAIL,
    "audit_trail_incomplete_coverage": ORACLE_SAAS_AUDIT_INCOMPLETE,
    "iam_dormant_privileged_account": ORACLE_SAAS_DORMANT_ACCOUNT,
    "iam_implementation_role_active": ORACLE_SAAS_IMPLEMENTATION_ROLE,
    "network_oauth_app_excessive_scopes": ORACLE_SAAS_OAUTH,
    "network_ip_allowlist_not_configured": ORACLE_SAAS_IP_ALLOWLIST,
}
