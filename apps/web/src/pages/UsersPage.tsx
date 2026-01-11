import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Loader2, Search, UserCircle, CheckCircle, XCircle, Database } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Link } from 'react-router-dom'

interface Connection {
  id: string
  name: string
  platform: string
}

interface PlatformUser {
  id: string
  connection_id: string
  name: string
  email: string | null
  display_name: string | null
  disabled: boolean
  created_on: string | null
  platform_data: Record<string, unknown>
  synced_at: string
}

export default function UsersPage() {
  const { getToken } = useAuth()
  const [connections, setConnections] = useState<Connection[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [loading, setLoading] = useState(true)
  const [usersLoading, setUsersLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Load connections on mount
  useEffect(() => {
    const loadConnections = async () => {
      try {
        const token = await getToken()
        if (token) {
          const data = await api.get<Connection[]>('/connections', token)
          setConnections(data)
          // Auto-select first connection if available
          if (data.length > 0 && !selectedConnectionId) {
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

  // Load users when connection changes
  useEffect(() => {
    const loadUsers = async () => {
      if (!selectedConnectionId) {
        setUsers([])
        return
      }

      setUsersLoading(true)
      try {
        const token = await getToken()
        if (token) {
          const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''
          const data = await api.get<PlatformUser[]>(
            `/objects/users?connection_id=${selectedConnectionId}${searchParam}`,
            token
          )
          setUsers(data)
        }
      } catch (error) {
        console.error('Failed to load users:', error)
        setUsers([])
      } finally {
        setUsersLoading(false)
      }
    }
    loadUsers()
  }, [selectedConnectionId, searchQuery, getToken])

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Unknown'
    return new Date(dateStr).toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">
            View and manage users across your connected platforms
          </p>
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
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">
            View and manage users across your connected platforms
          </p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Database className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No connections yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              Connect a platform and run a sync to see your users here.
            </p>
            <Link
              to="/connections"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Add Connection
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Users</h1>
        <p className="text-muted-foreground">
          View and manage users across your connected platforms
        </p>
      </div>

      {/* Connection selector and search */}
      <div className="flex gap-4">
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
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Users list */}
      {usersLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : users.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No users synced</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              Run a sync on your connection to see users here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Platform Users
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                {users.length} user{users.length !== 1 ? 's' : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <UserCircle className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {user.email || user.display_name || 'No email'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {user.disabled ? (
                      <span className="flex items-center text-red-600">
                        <XCircle className="h-4 w-4 mr-1" />
                        Disabled
                      </span>
                    ) : (
                      <span className="flex items-center text-green-600">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Active
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      Created: {formatDate(user.created_on)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
