import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Warehouse, Loader2, Search, Shield, Key, Database, ChevronRight, Plus } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Link, useNavigate } from 'react-router-dom'

interface Connection {
  id: string
  name: string
  platform: string
}

interface PlatformWarehouse {
  name: string
  connection_id: string
  grant_count: number
  roles_with_access: string[]
  privileges: string[]
}

export default function WarehousesPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [connections, setConnections] = useState<Connection[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [warehouses, setWarehouses] = useState<PlatformWarehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [warehousesLoading, setWarehousesLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedWarehouse, setExpandedWarehouse] = useState<string | null>(null)

  // Load connections on mount
  useEffect(() => {
    const loadConnections = async () => {
      try {
        const token = await getToken()
        if (token) {
          const data = await api.get<Connection[]>('/connections', token)
          setConnections(data)
          // Auto-select first connection if available
          const firstConnection = data[0]
          if (firstConnection && !selectedConnectionId) {
            setSelectedConnectionId(firstConnection.id)
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

  // Load warehouses when connection changes
  useEffect(() => {
    const loadWarehouses = async () => {
      if (!selectedConnectionId) {
        setWarehouses([])
        return
      }

      setWarehousesLoading(true)
      try {
        const token = await getToken()
        if (token) {
          const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''
          const data = await api.get<PlatformWarehouse[]>(
            `/objects/warehouses?connection_id=${selectedConnectionId}${searchParam}`,
            token
          )
          setWarehouses(data)
        }
      } catch (error) {
        console.error('Failed to load warehouses:', error)
        setWarehouses([])
      } finally {
        setWarehousesLoading(false)
      }
    }
    loadWarehouses()
  }, [selectedConnectionId, searchQuery, getToken])

  const handleWarehouseExpand = (warehouseName: string) => {
    if (expandedWarehouse === warehouseName) {
      setExpandedWarehouse(null)
    } else {
      setExpandedWarehouse(warehouseName)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Warehouses</h1>
          <p className="text-muted-foreground">
            View and manage warehouses across your connected platforms
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
          <h1 className="text-3xl font-bold">Warehouses</h1>
          <p className="text-muted-foreground">
            View and manage warehouses across your connected platforms
          </p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Database className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No connections yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              Connect a platform and run a sync to see your warehouses here.
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Warehouses</h1>
          <p className="text-muted-foreground">
            View and manage warehouses across your connected platforms
          </p>
        </div>
        <Button onClick={() => navigate(`/warehouses/designer?connection_id=${selectedConnectionId}`)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Warehouse
        </Button>
      </div>

      {/* Connection selector and search */}
      <div className="flex flex-wrap gap-4">
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
            placeholder="Search warehouses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Warehouses list */}
      {warehousesLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : warehouses.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Warehouse className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No warehouses synced</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              Run a sync on your connection to see warehouses here, or create a new one.
            </p>
            <Button onClick={() => navigate(`/warehouses/designer?connection_id=${selectedConnectionId}`)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Create Warehouse
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Warehouse className="h-5 w-5" />
                Platform Warehouses
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                {warehouses.length} warehouse{warehouses.length !== 1 ? 's' : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {warehouses.map((warehouse) => (
                <div key={warehouse.name}>
                  <div
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleWarehouseExpand(warehouse.name)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
                        <Warehouse className="h-5 w-5 text-yellow-600" />
                      </div>
                      <div>
                        <p className="font-medium">{warehouse.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {warehouse.privileges.join(', ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center text-muted-foreground">
                        <Shield className="h-4 w-4 mr-1" />
                        {warehouse.roles_with_access.length} roles
                      </span>
                      <span className="flex items-center text-muted-foreground">
                        <Key className="h-4 w-4 mr-1" />
                        {warehouse.grant_count} grants
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/warehouses/designer?connection_id=${selectedConnectionId}&edit_warehouse=${encodeURIComponent(warehouse.name)}`)
                        }}
                      >
                        Edit
                      </Button>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedWarehouse === warehouse.name ? 'rotate-90' : ''}`} />
                    </div>
                  </div>

                  {/* Expanded warehouse details */}
                  {expandedWarehouse === warehouse.name && (
                    <div className="ml-12 mt-2 p-3 bg-muted/30 rounded-lg">
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-medium mb-2">Privileges:</p>
                          <div className="flex flex-wrap gap-1">
                            {warehouse.privileges.map((privilege) => (
                              <span
                                key={privilege}
                                className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded"
                              >
                                {privilege}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-medium mb-2">Roles with Access:</p>
                          <div className="space-y-1">
                            {warehouse.roles_with_access.map((role) => (
                              <div
                                key={role}
                                className="flex items-center gap-2 text-sm p-2 bg-background rounded"
                              >
                                <Shield className="h-3 w-3" />
                                {role}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
