import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  UserCircle, Loader2, Search, Database, ChevronLeft,
  Shield, Code, AlertCircle, Check
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Connection {
  id: string
  name: string
  platform: string
}

interface SqlPreview {
  statements: string[]
  summary: string
}

interface UserDesignerData {
  roles: string[]
  warehouses: string[]
  service_user: string | null
  service_role: string | null
  user?: {
    name: string
    email: string | null
    display_name: string | null
    disabled: boolean
    default_role: string | null
    default_warehouse: string | null
    roles: string[]
  }
}

// Helper to check if a role is the Grantd service role
const isServiceRole = (roleName: string, serviceRole: string | null): boolean => {
  if (!serviceRole) return false
  return roleName.toUpperCase() === serviceRole.toUpperCase()
}

export default function UserDesignerPage() {
  const { getToken } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const connectionIdParam = searchParams.get('connection_id')
  const editUserParam = searchParams.get('edit_user')

  const isEditMode = !!editUserParam

  // State
  const [connections, setConnections] = useState<Connection[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(connectionIdParam)
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [designerData, setDesignerData] = useState<UserDesignerData | null>(null)

  // User form state
  const [userName, setUserName] = useState('')
  const [loginName, setLoginName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [defaultRole, setDefaultRole] = useState<string | null>(null)
  const [defaultWarehouse, setDefaultWarehouse] = useState<string | null>(null)
  const [mustChangePassword, setMustChangePassword] = useState(true)
  const [disabled, setDisabled] = useState(false)
  const [comment, setComment] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])

  // Original values for edit mode diff
  const [originalDisplayName, setOriginalDisplayName] = useState<string | null>(null)
  const [originalEmail, setOriginalEmail] = useState<string | null>(null)
  const [originalDefaultRole, setOriginalDefaultRole] = useState<string | null>(null)
  const [originalDefaultWarehouse, setOriginalDefaultWarehouse] = useState<string | null>(null)
  const [originalDisabled, setOriginalDisabled] = useState<boolean | null>(null)
  const [originalRoles, setOriginalRoles] = useState<string[]>([])

  // Preview state
  const [sqlPreview, setSqlPreview] = useState<SqlPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  // Role search
  const [roleSearch, setRoleSearch] = useState('')

  // Load connections on mount
  useEffect(() => {
    const loadConnections = async () => {
      try {
        const token = await getToken()
        if (token) {
          const data = await api.get<Connection[]>('/connections', token)
          setConnections(data)
          if (!selectedConnectionId && data.length > 0 && data[0]) {
            setSelectedConnectionId(data[0].id)
          }
        }
      } catch (error) {
        console.error('Failed to load connections:', error)
      } finally {
        setLoading(false)
      }
    }
    loadConnections()
  }, [getToken])

  // Load designer data when connection changes
  useEffect(() => {
    const loadDesignerData = async () => {
      if (!selectedConnectionId) return

      setDataLoading(true)
      try {
        const token = await getToken()
        if (token) {
          const userParam = editUserParam ? `&user_name=${encodeURIComponent(editUserParam)}` : ''
          const data = await api.get<UserDesignerData>(
            `/objects/user-designer/data?connection_id=${selectedConnectionId}${userParam}`,
            token
          )
          setDesignerData(data)

          if (editUserParam && data.user) {
            // Edit mode - populate form with existing values
            setUserName(data.user.name)
            setDisplayName(data.user.display_name || '')
            setEmail(data.user.email || '')
            setDefaultRole(data.user.default_role)
            setDefaultWarehouse(data.user.default_warehouse)
            setDisabled(data.user.disabled)
            setSelectedRoles(data.user.roles)

            // Store originals for diff
            setOriginalDisplayName(data.user.display_name)
            setOriginalEmail(data.user.email)
            setOriginalDefaultRole(data.user.default_role)
            setOriginalDefaultWarehouse(data.user.default_warehouse)
            setOriginalDisabled(data.user.disabled)
            setOriginalRoles(data.user.roles)
          }
        }
      } catch (error) {
        console.error('Failed to load designer data:', error)
        toast({
          title: 'Error',
          description: 'Failed to load user data',
          variant: 'destructive',
        })
      } finally {
        setDataLoading(false)
      }
    }
    loadDesignerData()
  }, [selectedConnectionId, editUserParam, getToken, toast])

  const toggleRoleSelection = (roleName: string) => {
    if (selectedRoles.includes(roleName)) {
      setSelectedRoles(selectedRoles.filter(r => r !== roleName))
    } else {
      setSelectedRoles([...selectedRoles, roleName])
    }
  }

  const generatePreview = async () => {
    if (!selectedConnectionId || !userName) return

    setPreviewLoading(true)
    try {
      const token = await getToken()
      if (token) {
        const preview = await api.post<SqlPreview>(
          `/objects/user-designer/preview?connection_id=${selectedConnectionId}`,
          {
            user_name: userName,
            login_name: loginName || undefined,
            display_name: displayName || undefined,
            email: email || undefined,
            default_role: defaultRole || undefined,
            default_warehouse: defaultWarehouse || undefined,
            must_change_password: mustChangePassword,
            disabled: disabled,
            comment: comment || '',
            roles: selectedRoles,
            is_edit_mode: isEditMode,
            original_display_name: originalDisplayName,
            original_email: originalEmail,
            original_default_role: originalDefaultRole,
            original_default_warehouse: originalDefaultWarehouse,
            original_disabled: originalDisabled,
            original_roles: originalRoles,
          },
          token
        )
        setSqlPreview(preview)
      }
    } catch (error) {
      console.error('Failed to generate preview:', error)
      toast({
        title: 'Error',
        description: 'Failed to generate SQL preview',
        variant: 'destructive',
      })
    } finally {
      setPreviewLoading(false)
    }
  }

  const createChangeset = async () => {
    if (!selectedConnectionId || !userName || !sqlPreview) return

    setCreating(true)
    try {
      const token = await getToken()
      if (token) {
        await api.post(
          '/changesets',
          {
            connection_id: selectedConnectionId,
            name: isEditMode ? `Modify user ${userName}` : `Create user ${userName}`,
            description: sqlPreview.summary,
            sql_statements: sqlPreview.statements,
          },
          token
        )
        toast({
          title: 'Changeset Created',
          description: 'Navigate to Changesets to review and apply the changes.',
        })
        navigate('/changesets')
      }
    } catch (error) {
      console.error('Failed to create changeset:', error)
      toast({
        title: 'Error',
        description: 'Failed to create changeset',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/users')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{isEditMode ? 'Edit User' : 'Create User'}</h1>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (connections.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/users')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{isEditMode ? 'Edit User' : 'Create User'}</h1>
          </div>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Database className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No connections yet</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              Connect a platform first to design users.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/users')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{isEditMode ? 'Edit User' : 'Create User'}</h1>
            <p className="text-muted-foreground">
              {isEditMode ? `Modifying ${editUserParam}` : 'Design a new Snowflake user'}
            </p>
          </div>
        </div>

        {/* Connection selector */}
        {!isEditMode && (
          <select
            value={selectedConnectionId || ''}
            onChange={(e) => setSelectedConnectionId(e.target.value || null)}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {connections.map((conn) => (
              <option key={conn.id} value={conn.id}>
                {conn.name} ({conn.platform})
              </option>
            ))}
          </select>
        )}
      </div>

      {dataLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel - User configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* User basics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCircle className="h-5 w-5" />
                  User Configuration
                </CardTitle>
                <CardDescription>
                  Define the user's basic properties
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* User Name */}
                <div className="space-y-2">
                  <Label htmlFor="userName">User Name</Label>
                  <Input
                    id="userName"
                    placeholder="e.g., JOHN_DOE"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                    disabled={isEditMode}
                    className={isEditMode ? 'bg-muted' : ''}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isEditMode
                      ? 'User name cannot be changed.'
                      : 'Use uppercase letters, numbers, and underscores only'}
                  </p>
                </div>

                {/* Login Name (create only) */}
                {!isEditMode && (
                  <div className="space-y-2">
                    <Label htmlFor="loginName">Login Name (optional)</Label>
                    <Input
                      id="loginName"
                      placeholder="e.g., john.doe@company.com"
                      value={loginName}
                      onChange={(e) => setLoginName(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      The name used to log in (defaults to user name if not specified)
                    </p>
                  </div>
                )}

                {/* Display Name */}
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name (optional)</Label>
                  <Input
                    id="displayName"
                    placeholder="e.g., John Doe"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email (optional)</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="e.g., john.doe@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                {/* Default Role */}
                <div className="space-y-2">
                  <Label>Default Role (optional)</Label>
                  <Select value={defaultRole || '__none__'} onValueChange={(v) => setDefaultRole(v === '__none__' ? null : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a default role..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No default role</SelectItem>
                      {designerData?.roles
                        .filter(r => !isServiceRole(r, designerData.service_role))
                        .map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Default Warehouse */}
                <div className="space-y-2">
                  <Label>Default Warehouse (optional)</Label>
                  <Select value={defaultWarehouse || '__none__'} onValueChange={(v) => setDefaultWarehouse(v === '__none__' ? null : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a default warehouse..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No default warehouse</SelectItem>
                      {designerData?.warehouses.map((wh) => (
                        <SelectItem key={wh} value={wh}>
                          {wh}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Must Change Password (create only) */}
                {!isEditMode && (
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="mustChangePassword"
                      checked={mustChangePassword}
                      onChange={(e) => setMustChangePassword(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="mustChangePassword" className="font-normal">
                      User must change password on first login
                    </Label>
                  </div>
                )}

                {/* Disabled */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="disabled"
                    checked={disabled}
                    onChange={(e) => setDisabled(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="disabled" className="font-normal">
                    Disable user (prevent login)
                  </Label>
                </div>

                {/* Comment (create only) */}
                {!isEditMode && (
                  <div className="space-y-2">
                    <Label htmlFor="comment">Comment (optional)</Label>
                    <Textarea
                      id="comment"
                      placeholder="Describe the purpose of this user..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={2}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Role Assignments */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Assign Roles
                </CardTitle>
                <CardDescription>
                  Select roles to grant to this user
                </CardDescription>
              </CardHeader>
              <CardContent>
                {designerData?.roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No roles found</p>
                ) : (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search roles..."
                        value={roleSearch}
                        onChange={(e) => setRoleSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                      {designerData?.roles
                        .filter(r => {
                          if (isServiceRole(r, designerData.service_role)) return false
                          if (roleSearch && !r.toLowerCase().includes(roleSearch.toLowerCase())) return false
                          return true
                        })
                        .map((role) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => toggleRoleSelection(role)}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-colors ${
                              selectedRoles.includes(role)
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted hover:bg-muted/80'
                            }`}
                          >
                            {selectedRoles.includes(role) && <Check className="h-3 w-3" />}
                            <Shield className="h-3 w-3" />
                            {role}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right panel - Summary and preview */}
          <div className="space-y-6">
            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">User name:</span>
                  <span className="font-medium">{userName || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Default role:</span>
                  <span className="font-medium">{defaultRole || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Default warehouse:</span>
                  <span className="font-medium">{defaultWarehouse || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assigned roles:</span>
                  <span className="font-medium">{selectedRoles.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className={`font-medium ${disabled ? 'text-red-600' : 'text-green-600'}`}>
                    {disabled ? 'Disabled' : 'Active'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Validation warnings */}
            {(() => {
              const warnings: string[] = []

              if (!userName) {
                warnings.push('User name is required')
              }

              if (warnings.length === 0) return null

              return (
                <Card className="border-amber-200 bg-amber-50/50">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        {warnings.map((warning, i) => (
                          <p key={i} className="text-sm text-amber-700">{warning}</p>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })()}

            {/* SQL Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  SQL Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={generatePreview}
                  disabled={!userName || previewLoading}
                  variant="outline"
                  className="w-full mb-4"
                >
                  {previewLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Code className="h-4 w-4 mr-2" />
                  )}
                  Generate SQL Preview
                </Button>

                {sqlPreview && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">{sqlPreview.summary}</p>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto max-h-64 overflow-y-auto">
                      {sqlPreview.statements.join('\n\n')}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Create changeset button */}
            <Button
              onClick={createChangeset}
              disabled={!userName || !sqlPreview || creating}
              className="w-full"
              size="lg"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <UserCircle className="h-4 w-4 mr-2" />
              )}
              {isEditMode ? 'Create Modification Changeset' : 'Create Changeset'}
            </Button>

            {/* Zero-trust notice */}
            <p className="text-xs text-muted-foreground text-center">
              Grantd never executes SQL on your behalf. Review and apply changes via the Changesets page.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
