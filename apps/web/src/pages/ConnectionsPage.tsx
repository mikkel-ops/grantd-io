import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Database, Plus, Snowflake, CheckCircle, XCircle, Loader2, Copy, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'

type Platform = 'snowflake' | 'databricks' | 'bigquery' | 'redshift'

interface Connection {
  id: string
  name: string
  platform: string
  last_sync_at: string | null
  last_sync_status: string | null
  sync_enabled: boolean
}

interface TestResult {
  success: boolean
  message: string
  details?: {
    user?: string
    role?: string
    warehouse?: string
  }
}

const platforms: { id: Platform; name: string; available: boolean }[] = [
  { id: 'snowflake', name: 'Snowflake', available: true },
  { id: 'databricks', name: 'Databricks', available: false },
  { id: 'bigquery', name: 'BigQuery', available: false },
  { id: 'redshift', name: 'Redshift', available: false },
]

const SNOWFLAKE_SETUP_SQL = `-- ============================================
-- Grantd Service User Setup for Snowflake
-- ============================================
-- Run this script as ACCOUNTADMIN or SECURITYADMIN

-- 1. Create a dedicated role for Grantd
USE ROLE SECURITYADMIN;
CREATE ROLE IF NOT EXISTS GRANTD_READONLY;

-- 2. Create the service user
CREATE USER IF NOT EXISTS GRANTD_SERVICE
  TYPE = SERVICE
  DEFAULT_ROLE = GRANTD_READONLY
  COMMENT = 'Service user for Grantd RBAC management';

-- 3. Assign the role to the user
GRANT ROLE GRANTD_READONLY TO USER GRANTD_SERVICE;

-- 4. Grant read-only permissions for RBAC visibility
USE ROLE ACCOUNTADMIN;

-- View users, roles, and grants (via SNOWFLAKE database)
GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO ROLE GRANTD_READONLY;

-- Grant warehouse access for metadata queries
GRANT USAGE ON WAREHOUSE <YOUR_WAREHOUSE> TO ROLE GRANTD_READONLY;

-- Optional: Grant access to specific databases for metadata visibility
-- GRANT USAGE ON DATABASE <DB_NAME> TO ROLE GRANTD_READONLY;
-- GRANT USAGE ON ALL SCHEMAS IN DATABASE <DB_NAME> TO ROLE GRANTD_READONLY;

-- 5. Verify setup
SHOW GRANTS TO USER GRANTD_SERVICE;
SHOW GRANTS TO ROLE GRANTD_READONLY;`

export default function ConnectionsPage() {
  const { getToken } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null)
  const [showGuide, setShowGuide] = useState(true)
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [copied, setCopied] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    account: '',
    username: 'GRANTD_SERVICE',
    warehouse: '',
    privateKey: '',
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const handleCopySQL = async () => {
    await navigator.clipboard.writeText(SNOWFLAKE_SETUP_SQL)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const validateForm = () => {
    const errors: Record<string, string> = {}
    if (!formData.name.trim()) errors.name = 'Connection name is required'
    if (!formData.account.trim()) errors.account = 'Account identifier is required'
    if (!formData.username.trim()) errors.username = 'Username is required'
    if (!formData.privateKey.trim()) errors.privateKey = 'Private key is required'
    if (formData.privateKey && !formData.privateKey.includes('PRIVATE KEY')) {
      errors.privateKey = 'Please paste the full private key including BEGIN/END headers'
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleTestConnection = async () => {
    if (!validateForm()) return

    setTestLoading(true)
    setTestResult(null)

    try {
      const token = await getToken()
      const result = await api.post<TestResult>(
        '/connections/test',
        {
          platform: 'snowflake',
          connection_config: {
            account: formData.account,
            username: formData.username,
            warehouse: formData.warehouse || null,
          },
          private_key: formData.privateKey,
        },
        token || undefined
      )
      setTestResult(result)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setTestResult({
        success: false,
        message: `API Error: ${errorMessage}. Please ensure the API server is running.`,
      })
    } finally {
      setTestLoading(false)
    }
  }

  const handleCreateConnection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setLoading(true)

    try {
      const token = await getToken()
      const newConnection = await api.post<Connection>(
        '/connections',
        {
          name: formData.name,
          platform: 'snowflake',
          connection_config: {
            account: formData.account,
            username: formData.username,
            warehouse: formData.warehouse || null,
          },
          private_key: formData.privateKey,
        },
        token || undefined
      )
      setConnections([...connections, newConnection])
      setShowForm(false)
      setSelectedPlatform(null)
      setFormData({ name: '', account: '', username: 'GRANTD_SERVICE', warehouse: '', privateKey: '' })
      setTestResult(null)
    } catch (error) {
      console.error('Failed to create connection:', error)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setSelectedPlatform(null)
    setShowForm(false)
    setFormData({ name: '', account: '', username: 'GRANTD_SERVICE', warehouse: '', privateKey: '' })
    setFormErrors({})
    setTestResult(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Connections</h1>
          <p className="text-muted-foreground">
            Manage your data platform connections
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Connection
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle>New Connection</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedPlatform ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Select a platform to connect
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  {platforms.map((platform) => (
                    <button
                      key={platform.id}
                      onClick={() =>
                        platform.available && setSelectedPlatform(platform.id)
                      }
                      disabled={!platform.available}
                      className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Snowflake className="h-5 w-5" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">{platform.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {platform.available ? 'Available' : 'Coming soon'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
                <Button variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            ) : selectedPlatform === 'snowflake' ? (
              <div className="space-y-6">
                {/* Setup Guide */}
                <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
                  <CardHeader className="pb-3">
                    <button
                      onClick={() => setShowGuide(!showGuide)}
                      className="flex items-center justify-between w-full text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Info className="h-5 w-5 text-blue-600" />
                        <CardTitle className="text-lg">Setup Guide: Create a Snowflake Service User</CardTitle>
                      </div>
                      {showGuide ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </button>
                    <CardDescription>
                      Grantd requires a read-only service user with key-pair authentication
                    </CardDescription>
                  </CardHeader>
                  {showGuide && (
                    <CardContent className="space-y-4">
                      <div className="space-y-3">
                        <h4 className="font-semibold">What permissions does Grantd need?</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                          <li>View users, roles, and role assignments</li>
                          <li>View grants and permissions</li>
                          <li>View database and schema metadata</li>
                          <li><span className="text-red-600 font-medium">No data access</span> - Grantd cannot query your tables</li>
                          <li><span className="text-red-600 font-medium">No write access</span> - Changes are applied via CLI with your credentials</li>
                        </ul>
                      </div>

                      <div className="space-y-3">
                        <h4 className="font-semibold">Step 1: Run the setup script in Snowflake</h4>
                        <p className="text-sm text-muted-foreground">
                          Copy and run this SQL in your Snowflake worksheet as ACCOUNTADMIN:
                        </p>
                        <div className="relative">
                          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto max-h-64 overflow-y-auto">
                            {SNOWFLAKE_SETUP_SQL}
                          </pre>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="absolute top-2 right-2"
                            onClick={handleCopySQL}
                          >
                            {copied ? (
                              <>
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-4 w-4 mr-1" />
                                Copy
                              </>
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="font-semibold">Step 2: Generate a key pair and assign to user</h4>
                        <p className="text-sm text-muted-foreground">
                          Run these commands on your local machine to generate keys:
                        </p>
                        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
{`# Generate private key (unencrypted)
openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out grantd_rsa_key.p8 -nocrypt

# Extract public key
openssl rsa -in grantd_rsa_key.p8 -pubout -out grantd_rsa_key.pub

# View the public key to copy it
cat grantd_rsa_key.pub`}
                        </pre>
                        <p className="text-sm text-muted-foreground">
                          Then assign the public key to your service user in Snowflake:
                        </p>
                        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
{`ALTER USER GRANTD_SERVICE SET RSA_PUBLIC_KEY='<paste-your-public-key-here>';`}
                        </pre>
                      </div>

                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertTitle>Security Note</AlertTitle>
                        <AlertDescription>
                          Your private key is encrypted and stored securely in AWS Parameter Store.
                          Grantd never has access to your data - only role and permission metadata.
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  )}
                </Card>

                {/* Connection Form */}
                <form onSubmit={handleCreateConnection} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Connection Name *</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Production Snowflake"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className={formErrors.name ? 'border-red-500' : ''}
                    />
                    {formErrors.name && (
                      <p className="text-xs text-red-500">{formErrors.name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="account">Account Identifier *</Label>
                    <Input
                      id="account"
                      placeholder="e.g., DDZTQOP-OY28586"
                      value={formData.account}
                      onChange={(e) => setFormData({ ...formData, account: e.target.value })}
                      className={formErrors.account ? 'border-red-500' : ''}
                    />
                    <div className="text-xs text-muted-foreground space-y-2">
                      <p>
                        <strong>Format:</strong> <code>ORGNAME-ACCOUNTNAME</code>
                      </p>
                      <p className="text-muted-foreground">
                        Find this in Snowflake: <strong>Admin → Accounts</strong> → hover over your account → copy the Account identifier.
                      </p>
                      <p className="text-muted-foreground">
                        Or run this SQL: <code>SELECT CURRENT_ORGANIZATION_NAME() || '-' || CURRENT_ACCOUNT_NAME();</code>
                      </p>
                      <p className="text-amber-600">
                        Do NOT include ".snowflakecomputing.com"
                      </p>
                    </div>
                    {formErrors.account && (
                      <p className="text-xs text-red-500">{formErrors.account}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="username">Service Username *</Label>
                    <Input
                      id="username"
                      placeholder="e.g., GRANTD_SERVICE"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className={formErrors.username ? 'border-red-500' : ''}
                    />
                    <p className="text-xs text-muted-foreground">
                      The username of the service user you created (default: GRANTD_SERVICE)
                    </p>
                    {formErrors.username && (
                      <p className="text-xs text-red-500">{formErrors.username}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="warehouse">Warehouse (optional)</Label>
                    <Input
                      id="warehouse"
                      placeholder="e.g., COMPUTE_WH"
                      value={formData.warehouse}
                      onChange={(e) => setFormData({ ...formData, warehouse: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      A warehouse for running metadata queries (uses minimal credits)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="privateKey">Private Key *</Label>
                    <Textarea
                      id="privateKey"
                      placeholder={`-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w...
-----END PRIVATE KEY-----`}
                      value={formData.privateKey}
                      onChange={(e) => setFormData({ ...formData, privateKey: e.target.value })}
                      className={`font-mono text-xs h-32 ${formErrors.privateKey ? 'border-red-500' : ''}`}
                    />
                    <p className="text-xs text-muted-foreground">
                      Paste the contents of your grantd_rsa_key.p8 file (the private key you generated)
                    </p>
                    {formErrors.privateKey && (
                      <p className="text-xs text-red-500">{formErrors.privateKey}</p>
                    )}
                  </div>

                  {/* Test Result */}
                  {testResult && (
                    <Alert variant={testResult.success ? 'success' : 'destructive'}>
                      {testResult.success ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      <AlertTitle>
                        {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                      </AlertTitle>
                      <AlertDescription>
                        {testResult.message}
                        {testResult.success && testResult.details && (
                          <ul className="mt-2 text-xs space-y-1">
                            {testResult.details.user && <li>User: {testResult.details.user}</li>}
                            {testResult.details.role && <li>Role: {testResult.details.role}</li>}
                            {testResult.details.warehouse && <li>Warehouse: {testResult.details.warehouse}</li>}
                          </ul>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={testLoading}
                    >
                      {testLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        'Test Connection'
                      )}
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        'Create Connection'
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={resetForm}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : connections.length > 0 ? (
        <div className="grid gap-4">
          {connections.map((connection) => (
            <Card key={connection.id}>
              <CardContent className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Snowflake className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{connection.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {connection.platform} • {connection.sync_enabled ? 'Sync enabled' : 'Sync disabled'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {connection.last_sync_status === 'success' ? (
                    <span className="flex items-center text-sm text-green-600">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Synced
                    </span>
                  ) : connection.last_sync_status === 'failed' ? (
                    <span className="flex items-center text-sm text-red-600">
                      <XCircle className="h-4 w-4 mr-1" />
                      Failed
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Not synced</span>
                  )}
                  <Button variant="outline" size="sm">
                    Configure
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Database className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No connections yet</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              Add your first platform connection to start syncing roles and
              permissions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
