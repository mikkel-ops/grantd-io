import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Warehouse, Loader2, Database, ChevronLeft,
  Code, AlertCircle, Zap
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

interface WarehouseDesignerData {
  warehouse?: {
    name: string
    roles_with_access: string[]
    privileges: string[]
  }
}

const WAREHOUSE_SIZES = [
  { value: 'XSMALL', label: 'X-Small' },
  { value: 'SMALL', label: 'Small' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LARGE', label: 'Large' },
  { value: 'XLARGE', label: 'X-Large' },
  { value: '2XLARGE', label: '2X-Large' },
  { value: '3XLARGE', label: '3X-Large' },
  { value: '4XLARGE', label: '4X-Large' },
]

const AUTO_SUSPEND_OPTIONS = [
  { value: 60, label: '1 minute' },
  { value: 120, label: '2 minutes' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
]

export default function WarehouseDesignerPage() {
  const { getToken } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const connectionIdParam = searchParams.get('connection_id')
  const editWarehouseParam = searchParams.get('edit_warehouse')

  const isEditMode = !!editWarehouseParam

  // State
  const [connections, setConnections] = useState<Connection[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(connectionIdParam)
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [_designerData, setDesignerData] = useState<WarehouseDesignerData | null>(null)

  // Warehouse form state
  const [warehouseName, setWarehouseName] = useState(editWarehouseParam || '')
  const [warehouseSize, setWarehouseSize] = useState('XSMALL')
  const [autoSuspend, setAutoSuspend] = useState(300)
  const [autoResume, setAutoResume] = useState(true)
  const [initiallySuspended, setInitiallySuspended] = useState(true)
  const [comment, setComment] = useState('')

  // Original values for edit mode diff
  const [originalSize, _setOriginalSize] = useState<string | null>(null)
  const [originalAutoSuspend, _setOriginalAutoSuspend] = useState<number | null>(null)
  const [originalAutoResume, _setOriginalAutoResume] = useState<boolean | null>(null)

  // Preview state
  const [sqlPreview, setSqlPreview] = useState<SqlPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [creating, setCreating] = useState(false)

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

  // Load designer data when connection changes (for edit mode)
  useEffect(() => {
    const loadDesignerData = async () => {
      if (!selectedConnectionId || !editWarehouseParam) return

      setDataLoading(true)
      try {
        const token = await getToken()
        if (token) {
          const data = await api.get<WarehouseDesignerData>(
            `/objects/warehouse-designer/data?connection_id=${selectedConnectionId}&warehouse_name=${encodeURIComponent(editWarehouseParam)}`,
            token
          )
          setDesignerData(data)

          // For edit mode, we'd ideally get current settings from Snowflake
          // For now, we just allow users to specify what they want to change
          if (data.warehouse) {
            setWarehouseName(data.warehouse.name)
          }
        }
      } catch (error) {
        console.error('Failed to load designer data:', error)
      } finally {
        setDataLoading(false)
      }
    }
    loadDesignerData()
  }, [selectedConnectionId, editWarehouseParam, getToken])

  const generatePreview = async () => {
    if (!selectedConnectionId || !warehouseName) return

    setPreviewLoading(true)
    try {
      const token = await getToken()
      if (token) {
        const preview = await api.post<SqlPreview>(
          `/objects/warehouse-designer/preview?connection_id=${selectedConnectionId}`,
          {
            warehouse_name: warehouseName,
            warehouse_size: warehouseSize,
            auto_suspend: autoSuspend,
            auto_resume: autoResume,
            initially_suspended: initiallySuspended,
            comment: comment || '',
            is_edit_mode: isEditMode,
            original_size: originalSize,
            original_auto_suspend: originalAutoSuspend,
            original_auto_resume: originalAutoResume,
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
    if (!selectedConnectionId || !warehouseName || !sqlPreview) return

    setCreating(true)
    try {
      const token = await getToken()
      if (token) {
        await api.post(
          '/changesets',
          {
            connection_id: selectedConnectionId,
            name: isEditMode ? `Modify warehouse ${warehouseName}` : `Create warehouse ${warehouseName}`,
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/warehouses')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{isEditMode ? 'Edit Warehouse' : 'Create Warehouse'}</h1>
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/warehouses')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{isEditMode ? 'Edit Warehouse' : 'Create Warehouse'}</h1>
          </div>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Database className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No connections yet</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              Connect a platform first to design warehouses.
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/warehouses')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{isEditMode ? 'Edit Warehouse' : 'Create Warehouse'}</h1>
            <p className="text-muted-foreground">
              {isEditMode ? `Modifying ${editWarehouseParam}` : 'Design a new Snowflake warehouse'}
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
          {/* Left panel - Warehouse configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* Warehouse basics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Warehouse className="h-5 w-5" />
                  Warehouse Configuration
                </CardTitle>
                <CardDescription>
                  Define the warehouse's properties and compute settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Warehouse Name */}
                <div className="space-y-2">
                  <Label htmlFor="warehouseName">Warehouse Name</Label>
                  <Input
                    id="warehouseName"
                    placeholder="e.g., ANALYTICS_WH"
                    value={warehouseName}
                    onChange={(e) => setWarehouseName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                    disabled={isEditMode}
                    className={isEditMode ? 'bg-muted' : ''}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isEditMode
                      ? 'Warehouse name cannot be changed.'
                      : 'Use uppercase letters, numbers, and underscores only'}
                  </p>
                </div>

                {/* Warehouse Size */}
                <div className="space-y-2">
                  <Label>Warehouse Size</Label>
                  <Select value={warehouseSize} onValueChange={setWarehouseSize}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select size..." />
                    </SelectTrigger>
                    <SelectContent>
                      {WAREHOUSE_SIZES.map((size) => (
                        <SelectItem key={size.value} value={size.value}>
                          {size.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Larger sizes provide more compute power but cost more credits per hour
                  </p>
                </div>

                {/* Auto-suspend */}
                <div className="space-y-2">
                  <Label>Auto-suspend After</Label>
                  <Select
                    value={autoSuspend.toString()}
                    onValueChange={(v) => setAutoSuspend(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select duration..." />
                    </SelectTrigger>
                    <SelectContent>
                      {AUTO_SUSPEND_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value.toString()}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Warehouse will automatically suspend after this period of inactivity
                  </p>
                </div>

                {/* Auto-resume */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="autoResume"
                    checked={autoResume}
                    onChange={(e) => setAutoResume(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="autoResume" className="font-normal">
                    Auto-resume when queries are submitted
                  </Label>
                </div>

                {/* Initially Suspended (create only) */}
                {!isEditMode && (
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="initiallySuspended"
                      checked={initiallySuspended}
                      onChange={(e) => setInitiallySuspended(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="initiallySuspended" className="font-normal">
                      Create warehouse in suspended state
                    </Label>
                  </div>
                )}

                {/* Comment (create only) */}
                {!isEditMode && (
                  <div className="space-y-2">
                    <Label htmlFor="comment">Comment (optional)</Label>
                    <Textarea
                      id="comment"
                      placeholder="Describe the purpose of this warehouse..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={2}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cost estimation info */}
            <Card className="border-blue-200 bg-blue-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-blue-700 text-sm">
                  <Zap className="h-4 w-4" />
                  Compute Cost Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-blue-700">
                  Warehouse costs are based on size and runtime. The selected size ({warehouseSize}) uses credits
                  per hour while running. Enable auto-suspend and auto-resume to optimize costs.
                </p>
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
                  <span className="text-muted-foreground">Warehouse name:</span>
                  <span className="font-medium">{warehouseName || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size:</span>
                  <span className="font-medium">{warehouseSize}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Auto-suspend:</span>
                  <span className="font-medium">
                    {AUTO_SUSPEND_OPTIONS.find(o => o.value === autoSuspend)?.label || `${autoSuspend}s`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Auto-resume:</span>
                  <span className={`font-medium ${autoResume ? 'text-green-600' : 'text-red-600'}`}>
                    {autoResume ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                {!isEditMode && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Initially:</span>
                    <span className="font-medium">
                      {initiallySuspended ? 'Suspended' : 'Running'}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Validation warnings */}
            {(() => {
              const warnings: string[] = []

              if (!warehouseName) {
                warnings.push('Warehouse name is required')
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
                  disabled={!warehouseName || previewLoading}
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
              disabled={!warehouseName || !sqlPreview || creating}
              className="w-full"
              size="lg"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Warehouse className="h-4 w-4 mr-2" />
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
