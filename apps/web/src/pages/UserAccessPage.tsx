import { useState, useEffect } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowLeft,
  Shield,
  Database,
  Table,
  Eye,
  Folder,
  ChevronDown,
  ChevronRight,
  Loader2,
  UserCircle,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'

interface RoleWithPath {
  name: string
  granted_via: string
  is_inherited: boolean
  is_system: boolean | null
}

interface PrivilegeGrant {
  privilege: string
  granted_via: string
}

interface TableAccess {
  name: string
  privilege: string
  granted_via: string
}

interface SchemaAccess {
  name: string
  privileges: PrivilegeGrant[]
  tables: TableAccess[]
  views: TableAccess[]
}

interface DatabaseAccess {
  name: string
  privileges: PrivilegeGrant[]
  schemas: Record<string, SchemaAccess>
}

interface AccessSummary {
  total_databases: number
  total_schemas: number
  total_tables: number
  total_views: number
}

interface UserAccessData {
  user: string
  email: string | null
  display_name: string | null
  disabled: boolean | null
  roles: RoleWithPath[]
  role_count: number
  databases: DatabaseAccess[]
  summary: AccessSummary
}

export default function UserAccessPage() {
  const { userName } = useParams<{ userName: string }>()
  const [searchParams] = useSearchParams()
  const connectionId = searchParams.get('connection_id')
  const { getToken } = useAuth()

  const [accessData, setAccessData] = useState<UserAccessData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set())
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set())

  useEffect(() => {
    const loadUserAccess = async () => {
      if (!userName || !connectionId) {
        setError('Missing user name or connection ID')
        setLoading(false)
        return
      }

      try {
        const token = await getToken()
        if (token) {
          const data = await api.get<UserAccessData>(
            `/objects/users/${encodeURIComponent(userName)}/access?connection_id=${connectionId}`,
            token
          )
          setAccessData(data)
          // Auto-expand first database
          if (data.databases.length > 0) {
            setExpandedDbs(new Set([data.databases[0].name]))
            // Auto-expand first schema
            const firstSchemaName = Object.keys(data.databases[0].schemas)[0]
            if (firstSchemaName) {
              setExpandedSchemas(new Set([`${data.databases[0].name}.${firstSchemaName}`]))
            }
          }
        }
      } catch (err) {
        console.error('Failed to load user access:', err)
        setError('Failed to load user access data')
      } finally {
        setLoading(false)
      }
    }
    loadUserAccess()
  }, [userName, connectionId, getToken])

  const toggleDb = (dbName: string) => {
    setExpandedDbs(prev => {
      const next = new Set(prev)
      if (next.has(dbName)) {
        next.delete(dbName)
      } else {
        next.add(dbName)
      }
      return next
    })
  }

  const toggleSchema = (schemaKey: string) => {
    setExpandedSchemas(prev => {
      const next = new Set(prev)
      if (next.has(schemaKey)) {
        next.delete(schemaKey)
      } else {
        next.add(schemaKey)
      }
      return next
    })
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            to="/users"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Users
          </Link>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !accessData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            to="/users"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Users
          </Link>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-red-600">{error || 'User not found'}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Organize roles into direct and inherited
  const directRoles = accessData.roles.filter(r => !r.is_inherited)
  const inheritedRoles = accessData.roles.filter(r => r.is_inherited)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/users"
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </Link>
      </div>

      {/* User Info */}
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <UserCircle className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{accessData.user}</h1>
          <p className="text-muted-foreground">
            {accessData.email || accessData.display_name || 'No email'}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {accessData.disabled ? (
              <span className="flex items-center text-red-600 text-sm">
                <XCircle className="h-4 w-4 mr-1" />
                Disabled
              </span>
            ) : (
              <span className="flex items-center text-green-600 text-sm">
                <CheckCircle className="h-4 w-4 mr-1" />
                Active
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Access Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{accessData.role_count}</span>
              <span className="text-muted-foreground">Roles</span>
            </div>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{accessData.summary.total_databases}</span>
              <span className="text-muted-foreground">Databases</span>
            </div>
            <div className="flex items-center gap-2">
              <Folder className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{accessData.summary.total_schemas}</span>
              <span className="text-muted-foreground">Schemas</span>
            </div>
            <div className="flex items-center gap-2">
              <Table className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{accessData.summary.total_tables}</span>
              <span className="text-muted-foreground">Tables</span>
            </div>
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{accessData.summary.total_views}</span>
              <span className="text-muted-foreground">Views</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content - Roles and Access */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Roles Panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Roles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Direct Roles */}
            {directRoles.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">DIRECT ROLES</p>
                <div className="space-y-1">
                  {directRoles.map((role) => (
                    <div
                      key={role.name}
                      className={`flex items-center gap-2 p-2 rounded text-sm ${
                        role.is_system ? 'bg-amber-50' : 'bg-muted/50'
                      }`}
                    >
                      <Shield className={`h-3 w-3 ${role.is_system ? 'text-amber-600' : 'text-primary'}`} />
                      <span className="font-medium">{role.name}</span>
                      {role.is_system && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          System
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inherited Roles */}
            {inheritedRoles.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">INHERITED ROLES</p>
                <div className="space-y-1">
                  {inheritedRoles.map((role) => (
                    <div
                      key={role.name}
                      className={`p-2 rounded text-sm ${
                        role.is_system ? 'bg-amber-50' : 'bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Shield className={`h-3 w-3 ${role.is_system ? 'text-amber-600' : 'text-muted-foreground'}`} />
                        <span>{role.name}</span>
                        {role.is_system && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                            System
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground ml-5 mt-0.5">
                        {role.granted_via}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {accessData.roles.length === 0 && (
              <p className="text-sm text-muted-foreground">No roles assigned</p>
            )}
          </CardContent>
        </Card>

        {/* Access Tree Panel */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" />
              Access by Database
            </CardTitle>
          </CardHeader>
          <CardContent>
            {accessData.databases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No object access found</p>
            ) : (
              <div className="space-y-2">
                {accessData.databases.map((db) => (
                  <div key={db.name} className="border rounded-lg">
                    {/* Database Header */}
                    <button
                      onClick={() => toggleDb(db.name)}
                      className="w-full flex items-center gap-2 p-3 hover:bg-muted/50 text-left"
                    >
                      {expandedDbs.has(db.name) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <Database className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">{db.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {Object.keys(db.schemas).length} schema{Object.keys(db.schemas).length !== 1 ? 's' : ''}
                      </span>
                      {/* Database-level privileges */}
                      {db.privileges.length > 0 && (
                        <div className="flex flex-wrap gap-1 ml-auto">
                          {db.privileges.map((priv, idx) => (
                            <span
                              key={idx}
                              className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded"
                              title={`via ${priv.granted_via}`}
                            >
                              {priv.privilege}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>

                    {/* Schemas */}
                    {expandedDbs.has(db.name) && (
                      <div className="border-t">
                        {Object.entries(db.schemas).sort().map(([schemaName, schema]) => {
                          const schemaKey = `${db.name}.${schemaName}`
                          return (
                            <div key={schemaKey} className="ml-4">
                              {/* Schema Header */}
                              <button
                                onClick={() => toggleSchema(schemaKey)}
                                className="w-full flex items-center gap-2 p-2 hover:bg-muted/30 text-left"
                              >
                                {expandedSchemas.has(schemaKey) ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                                <Folder className="h-4 w-4 text-amber-600" />
                                <span className="text-sm">{schemaName}</span>
                                <span className="text-xs text-muted-foreground">
                                  {schema.tables.length + schema.views.length} object{schema.tables.length + schema.views.length !== 1 ? 's' : ''}
                                </span>
                                {/* Schema-level privileges */}
                                {schema.privileges.length > 0 && (
                                  <div className="flex flex-wrap gap-1 ml-auto">
                                    {schema.privileges.map((priv, idx) => (
                                      <span
                                        key={idx}
                                        className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded"
                                        title={`via ${priv.granted_via}`}
                                      >
                                        {priv.privilege}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </button>

                              {/* Tables and Views */}
                              {expandedSchemas.has(schemaKey) && (
                                <div className="ml-6 border-l pl-4 py-1 space-y-1">
                                  {/* Tables */}
                                  {schema.tables.map((table, idx) => (
                                    <div
                                      key={`table-${table.name}-${idx}`}
                                      className="flex items-center justify-between p-2 bg-muted/20 rounded text-sm"
                                    >
                                      <div className="flex items-center gap-2">
                                        <Table className="h-4 w-4 text-green-600" />
                                        <span>{table.name}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                          {table.privilege}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          {table.granted_via}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                  {/* Views */}
                                  {schema.views.map((view, idx) => (
                                    <div
                                      key={`view-${view.name}-${idx}`}
                                      className="flex items-center justify-between p-2 bg-muted/20 rounded text-sm"
                                    >
                                      <div className="flex items-center gap-2">
                                        <Eye className="h-4 w-4 text-purple-600" />
                                        <span>{view.name}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                                          {view.privilege}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          {view.granted_via}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                  {schema.tables.length === 0 && schema.views.length === 0 && (
                                    <p className="text-xs text-muted-foreground p-2">
                                      No direct table/view grants (check schema privileges)
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
