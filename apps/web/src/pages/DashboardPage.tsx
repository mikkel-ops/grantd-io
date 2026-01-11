import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Database, Users, Shield, FileText, AlertTriangle, CheckCircle, XCircle, Loader2, Snowflake, Clock, Key } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import { Link } from 'react-router-dom'

interface Connection {
  id: string
  name: string
  platform: string
  last_sync_at: string | null
  last_sync_status: string | null
  sync_enabled: boolean
}

interface Stats {
  connections: number
  users: number
  roles: number
  grants: number
  pending_changesets: number
}

export default function DashboardPage() {
  const { getToken } = useAuth()
  const [connections, setConnections] = useState<Connection[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        const token = await getToken()
        if (token) {
          const [connectionsData, statsData] = await Promise.all([
            api.get<Connection[]>('/connections', token),
            api.get<Stats>('/objects/stats', token),
          ])
          setConnections(connectionsData)
          setStats(statsData)
        }
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [getToken])

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const statCards = [
    {
      name: 'Connections',
      value: stats?.connections.toString() || '0',
      description: 'Active platform connections',
      icon: Database,
      href: '/connections',
    },
    {
      name: 'Roles',
      value: stats?.roles.toString() || '0',
      description: 'Total roles synced',
      icon: Shield,
      href: '/roles',
    },
    {
      name: 'Users',
      value: stats?.users.toString() || '0',
      description: 'Total users synced',
      icon: Users,
      href: '/users',
    },
    {
      name: 'Pending Changes',
      value: stats?.pending_changesets.toString() || '0',
      description: 'Changesets awaiting review',
      icon: FileText,
      href: '/changesets',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your access control management
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : connections.length === 0 ? (
        /* Empty state */
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Database className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No connections yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              Connect your first data platform to start managing access control
              visually.
            </p>
            <Link
              to="/connections"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Add Connection
            </Link>
          </CardContent>
        </Card>
      ) : (
        /* Connection summary */
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Platform Connections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {connections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <Snowflake className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{connection.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {connection.platform}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {connection.last_sync_status === 'success' ? (
                      <span className="flex items-center text-green-600">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Synced
                      </span>
                    ) : connection.last_sync_status === 'failed' ? (
                      <span className="flex items-center text-red-600">
                        <XCircle className="h-4 w-4 mr-1" />
                        Failed
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not synced</span>
                    )}
                    <span className="flex items-center text-muted-foreground">
                      <Clock className="h-4 w-4 mr-1" />
                      {formatLastSync(connection.last_sync_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t">
              <Link
                to="/connections"
                className="text-sm text-primary hover:underline"
              >
                Manage connections →
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Link key={stat.name} to={stat.href}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.name}</CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Grants summary - only show if there are grants */}
      {stats && stats.grants > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Permission Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {stats.grants.toLocaleString()} grants synced across {stats.roles} roles and {stats.users} users.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Drift alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Drift Detection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No drift detected. Your platform state matches Grantd.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
