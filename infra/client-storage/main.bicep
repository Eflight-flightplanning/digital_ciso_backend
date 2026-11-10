// Client file storage for Digital CISO: one storage account, one private container per client.
// The app creates each client's container, key and encryption scope itself at onboarding.
// NOT YET DEPLOYED OR COMPILED: review with `az bicep build` and a what-if before first use.

@description('Globally unique, 3-24 lowercase letters and digits.')
param storageAccountName string
param location string = resourceGroup().location
@description('Principal (object) id of the app\'s managed identity.')
param appPrincipalId string
@description('Subnet for the storage private endpoint.')
param privateEndpointSubnetId string
@description('Private DNS zone privatelink.blob.<suffix>, linked to the app\'s network.')
param blobPrivateDnsZoneId string
@description('Key Vault that holds one key per client. Needs purge protection and RBAC authorization.')
param keyVaultName string
param logAnalyticsWorkspaceId string
@description('Days a deleted file or container can still be restored. Keep short: it delays final client deletion.')
@minValue(1)
@maxValue(30)
param softDeleteDays int = 7
@description('Days to keep saved test reports. Evidence and documents are not expired automatically.')
param reportRetentionDays int = 365

var blobDataContributor = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var keyVaultCryptoOfficer = '14b46e9e-c2b7-41b4-b07b-48a6ebf60603'
var keyVaultCryptoServiceEncryptionUser = 'e147488a-f6f5-4113-8e2d-b22465e65bf6'

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource account 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_ZRS' }
  identity: { type: 'SystemAssigned' } // used by storage to read each client's key
  properties: {
    allowBlobPublicAccess: false        // no container can ever be made public
    allowSharedKeyAccess: false         // account keys and account SAS do not work at all
    defaultToOAuthAuthentication: true
    publicNetworkAccess: 'Disabled'     // reachable through the private endpoint only
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowCrossTenantReplication: false
    networkAcls: { defaultAction: 'Deny', bypass: 'None' }
    encryption: { requireInfrastructureEncryption: true, services: { blob: { enabled: true } }, keySource: 'Microsoft.Storage' }
  }
}

resource blob 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: account
  name: 'default'
  properties: {
    deleteRetentionPolicy: { enabled: true, days: softDeleteDays }
    containerDeleteRetentionPolicy: { enabled: true, days: softDeleteDays }
    // No immutability policy and no legal hold: they would block the approved client deletion.
  }
}

resource lifecycle 'Microsoft.Storage/storageAccounts/managementPolicies@2023-05-01' = {
  parent: account
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'reports-cool-then-expire'
          enabled: true
          type: 'Lifecycle'
          definition: {
            // prefixMatch needs a container name, so this rule matches on the blob index tag the
            // deployment pipeline sets, or is replaced per client. See docs/AZURE_CLIENT_STORAGE.md.
            filters: { blobTypes: [ 'blockBlob' ], blobIndexMatch: [ { name: 'category', op: '==', value: 'reports' } ] }
            actions: {
              baseBlob: {
                tierToCool: { daysAfterModificationGreaterThan: 30 }
                delete: { daysAfterModificationGreaterThan: reportRetentionDays }
              }
            }
          }
        }
      ]
    }
  }
}

resource endpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: '${storageAccountName}-blob-pe'
  location: location
  properties: {
    subnet: { id: privateEndpointSubnetId }
    privateLinkServiceConnections: [
      { name: 'blob', properties: { privateLinkServiceId: account.id, groupIds: [ 'blob' ] } }
    ]
  }
}

resource endpointDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: endpoint
  name: 'default'
  properties: { privateDnsZoneConfigs: [ { name: 'blob', properties: { privateDnsZoneId: blobPrivateDnsZoneId } } ] }
}

// The app: read, write and delete blobs and create containers. Data plane only, no account keys.
resource appBlobAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: account
  name: guid(account.id, appPrincipalId, blobDataContributor)
  properties: {
    principalId: appPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataContributor)
  }
}

// The app: only what it needs on the management plane, to create and disable encryption scopes.
resource scopeRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(resourceGroup().id, 'client-encryption-scope-operator')
  properties: {
    roleName: 'Client Encryption Scope Operator (${storageAccountName})'
    description: 'Create and disable per-client encryption scopes. Nothing else.'
    assignableScopes: [ resourceGroup().id ]
    permissions: [
      { actions: [ 'Microsoft.Storage/storageAccounts/encryptionScopes/read', 'Microsoft.Storage/storageAccounts/encryptionScopes/write' ] }
    ]
  }
}

resource appScopeAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: account
  name: guid(account.id, appPrincipalId, scopeRole.id)
  properties: { principalId: appPrincipalId, principalType: 'ServicePrincipal', roleDefinitionId: scopeRole.id }
}

// The app creates and deletes one key per client.
resource appKeyAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, appPrincipalId, keyVaultCryptoOfficer)
  properties: {
    principalId: appPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultCryptoOfficer)
  }
}

// Storage itself uses the keys to encrypt and decrypt.
resource storageKeyAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, account.id, keyVaultCryptoServiceEncryptionUser)
  properties: {
    principalId: account.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultCryptoServiceEncryptionUser)
  }
}

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: blob
  name: 'to-log-analytics'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { category: 'StorageRead', enabled: true }
      { category: 'StorageWrite', enabled: true }
      { category: 'StorageDelete', enabled: true }
    ]
    metrics: [ { category: 'Transaction', enabled: true } ]
  }
}

// Any refused request is worth a look: with one identity and private access, there should be none.
resource deniedAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${storageAccountName}-denied-requests'
  location: location
  properties: {
    severity: 2
    enabled: true
    scopes: [ logAnalyticsWorkspaceId ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      allOf: [
        {
          query: 'StorageBlobLogs | where AccountName == "${storageAccountName}" | where StatusCode in (401, 403)'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
        }
      ]
    }
  }
}

output accountUrl string = account.properties.primaryEndpoints.blob
