import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  FileText,
  Loader2,
  ChevronRight,
  ChevronDown,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Code,
  Trash2,
  Send,
  Download,
  Copy,
  Check,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

interface Change {
  id: string
  changeset_id: string
  change_type: string
  object_type: string
  object_name: string
  details: Record<string, unknown>
  sql_statement: string
  execution_order: number
  status: string
  error_message: string | null
  executed_at: string | null
}

interface Changeset {
  id: string
  org_id: string
  connection_id: string
  title: string | null
  description: string | null
  created_by: string
  status: string
  reviewed_by: string | null
  reviewed_at: string | null
  applied_at: string | null
  changes_count: number
  sql_statements_count: number
  created_at: string
  changes: Change[]
}

interface Connection {
  id: string
  name: string
  platform: string
}

const statusConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  draft: { icon: Clock, color: 'text-gray-500 bg-gray-100', label: 'Draft' },
  pending_review: { icon: AlertCircle, color: 'text-yellow-600 bg-yellow-100', label: 'Pending Review' },
  approved: { icon: CheckCircle, color: 'text-green-600 bg-green-100', label: 'Approved' },
  applied: { icon: CheckCircle, color: 'text-blue-600 bg-blue-100', label: 'Applied' },
  rejected: { icon: XCircle, color: 'text-red-600 bg-red-100', label: 'Rejected' },
}

export default function ChangesetsPage() {
  const { getToken } = useAuth()
  const { toast } = useToast()
  const [changesets, setChangesets] = useState<Changeset[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedChangeset, setExpandedChangeset] = useState<string | null>(null)
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null)
  const [changesetDetails, setChangesetDetails] = useState<Record<string, Changeset>>({})
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Load connections and changesets on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const token = await getToken()
        if (token) {
          const [connectionsData, changesetsData] = await Promise.all([
            api.get<Connection[]>('/connections', token),
            api.get<Changeset[]>('/changesets', token),
          ])
          setConnections(connectionsData)
          setChangesets(changesetsData)
        }
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [getToken])

  // Get connection name by ID
  const getConnectionName = (connectionId: string) => {
    const conn = connections.find(c => c.id === connectionId)
    return conn ? conn.name : 'Unknown'
  }

  // Load changeset details when expanding
  const handleExpandChangeset = async (changesetId: string) => {
    if (expandedChangeset === changesetId) {
      setExpandedChangeset(null)
      return
    }

    setExpandedChangeset(changesetId)

    // Check if we already have the details cached
    if (changesetDetails[changesetId]) {
      return
    }

    setLoadingDetails(changesetId)
    try {
      const token = await getToken()
      if (token) {
        const data = await api.get<Changeset>(`/changesets/${changesetId}`, token)
        setChangesetDetails(prev => ({ ...prev, [changesetId]: data }))
      }
    } catch (error) {
      console.error('Failed to load changeset details:', error)
    } finally {
      setLoadingDetails(null)
    }
  }

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString()
  }

  // Generate SQL content for download/copy
  const generateSqlContent = (changeset: Changeset, details: Changeset) => {
    const header = `-- Grantd Changeset: ${changeset.title || changeset.id}
-- Created by: ${changeset.created_by}
-- Created at: ${formatDate(changeset.created_at)}
-- Connection: ${getConnectionName(changeset.connection_id)}
-- Status: ${changeset.status}
--
-- Execute this SQL in Snowflake with an account that has sufficient privileges.
-- After execution, return to Grantd and click "Mark as Applied" to update the status.
--
-- ============================================================================

`
    const statements = details.changes
      .sort((a, b) => a.execution_order - b.execution_order)
      .map((change, idx) => {
        return `-- Statement ${idx + 1}: ${change.change_type} ${change.object_type} ${change.object_name}
${change.sql_statement}
`
      })
      .join('\n')

    return header + statements
  }

  // Download SQL file
  const handleDownloadSql = (changeset: Changeset, details: Changeset) => {
    const content = generateSqlContent(changeset, details)
    const blob = new Blob([content], { type: 'text/sql' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `changeset-${changeset.id.slice(0, 8)}.sql`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast({
      title: 'SQL Downloaded',
      description: 'Open the file in Snowsight or your SQL client to execute.',
    })
  }

  // Copy SQL to clipboard
  const handleCopySql = async (changeset: Changeset, details: Changeset) => {
    const content = generateSqlContent(changeset, details)
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(changeset.id)
      setTimeout(() => setCopiedId(null), 2000)
      toast({
        title: 'Copied to clipboard',
        description: 'Paste the SQL into Snowsight or your SQL client.',
      })
    } catch (error) {
      console.error('Failed to copy:', error)
      toast({
        title: 'Failed to copy',
        description: 'Please try downloading the SQL file instead.',
        variant: 'destructive',
      })
    }
  }

  // Request review for a changeset
  const handleRequestReview = async (changesetId: string) => {
    setActionLoading(changesetId)
    try {
      const token = await getToken()
      if (token) {
        await api.post(`/changesets/${changesetId}/request-review`, {}, token)
        setChangesets(prev => prev.map(c =>
          c.id === changesetId ? { ...c, status: 'pending_review' } : c
        ))
        toast({
          title: 'Review requested',
          description: 'The changeset is now pending review.',
        })
      }
    } catch (error) {
      console.error('Failed to request review:', error)
      toast({
        title: 'Error',
        description: 'Failed to request review',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  // Approve a changeset
  const handleApprove = async (changesetId: string) => {
    setActionLoading(changesetId)
    try {
      const token = await getToken()
      if (token) {
        await api.post(`/changesets/${changesetId}/approve`, {}, token)
        setChangesets(prev => prev.map(c =>
          c.id === changesetId ? { ...c, status: 'approved' } : c
        ))
        toast({
          title: 'Changeset approved',
          description: 'The changeset is now ready to be applied.',
        })
      }
    } catch (error) {
      console.error('Failed to approve:', error)
      toast({
        title: 'Error',
        description: 'Failed to approve changeset',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  // Mark changeset as applied
  const handleMarkApplied = async (changesetId: string) => {
    setActionLoading(changesetId)
    try {
      const token = await getToken()
      if (token) {
        await api.post(`/changesets/${changesetId}/mark-applied`, {}, token)
        setChangesets(prev => prev.map(c =>
          c.id === changesetId ? { ...c, status: 'applied' } : c
        ))
        toast({
          title: 'Changeset marked as applied',
          description: 'The status will be verified on next sync.',
        })
      }
    } catch (error) {
      console.error('Failed to mark as applied:', error)
      toast({
        title: 'Error',
        description: 'Failed to mark changeset as applied',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  // Delete a changeset
  const handleDelete = async (changesetId: string) => {
    if (!confirm('Are you sure you want to delete this changeset?')) return

    setActionLoading(changesetId)
    try {
      const token = await getToken()
      if (token) {
        await api.delete(`/changesets/${changesetId}`, token)
        setChangesets(prev => prev.filter(c => c.id !== changesetId))
        setExpandedChangeset(null)
        toast({
          title: 'Changeset deleted',
          description: 'The changeset has been removed.',
        })
      }
    } catch (error) {
      console.error('Failed to delete:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete changeset',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Changesets</h1>
          <p className="text-muted-foreground">
            Review and manage pending access control changes
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

  if (changesets.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Changesets</h1>
          <p className="text-muted-foreground">
            Review and manage pending access control changes
          </p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3 mb-4">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No changesets</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              Create roles or modify permissions to generate changesets for review.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Changesets</h1>
        <p className="text-muted-foreground">
          Review and manage pending access control changes
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Changesets
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {changesets.length} changeset{changesets.length !== 1 ? 's' : ''}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {changesets.map((changeset) => {
              const statusInfo = statusConfig[changeset.status] ?? statusConfig.draft!
              const StatusIcon = statusInfo.icon
              const details = changesetDetails[changeset.id]

              return (
                <div key={changeset.id} className="border rounded-lg">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50"
                    onClick={() => handleExpandChangeset(changeset.id)}
                  >
                    <div className="flex items-center gap-3">
                      {expandedChangeset === changeset.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {changeset.title || `Changeset ${changeset.id.slice(0, 8)}`}
                          </p>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${statusInfo.color}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusInfo.label}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {getConnectionName(changeset.connection_id)} • {changeset.changes_count} change{changeset.changes_count !== 1 ? 's' : ''} • Created by {changeset.created_by}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(changeset.created_at)}
                    </div>
                  </div>

                  {expandedChangeset === changeset.id && (
                    <div className="border-t bg-muted/20 p-4">
                      {loadingDetails === changeset.id ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : details ? (
                        <div className="space-y-4">
                          {changeset.description && (
                            <p className="text-sm text-muted-foreground">{changeset.description}</p>
                          )}

                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <Code className="h-4 w-4" />
                              SQL Statements
                            </h4>
                            <div className="space-y-2">
                              {details.changes.map((change, idx) => (
                                <div key={change.id} className="bg-background p-3 rounded border">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-muted-foreground">
                                      #{idx + 1} - {change.change_type}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {change.object_type}: {change.object_name}
                                    </span>
                                  </div>
                                  <pre className="text-sm font-mono bg-muted p-2 rounded overflow-x-auto">
                                    {change.sql_statement}
                                  </pre>
                                </div>
                              ))}
                            </div>
                          </div>

                          {changeset.status === 'draft' && (
                            <div className="flex gap-2 pt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRequestReview(changeset.id)}
                                disabled={actionLoading === changeset.id}
                              >
                                {actionLoading === changeset.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                  <Send className="h-4 w-4 mr-2" />
                                )}
                                Request Review
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(changeset.id)}
                                disabled={actionLoading === changeset.id}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </Button>
                            </div>
                          )}

                          {changeset.status === 'pending_review' && (
                            <div className="space-y-3 pt-2">
                              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
                                <p className="text-yellow-800 font-medium mb-2">
                                  This changeset is awaiting admin approval.
                                </p>
                                <p className="text-yellow-700 text-xs">
                                  An admin must review and approve these changes before they can be applied.
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleApprove(changeset.id)}
                                  disabled={actionLoading === changeset.id}
                                >
                                  {actionLoading === changeset.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                  )}
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDelete(changeset.id)}
                                  disabled={actionLoading === changeset.id}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Reject & Delete
                                </Button>
                              </div>
                            </div>
                          )}

                          {changeset.status === 'approved' && (
                            <div className="bg-green-50 border border-green-200 rounded p-4 text-sm space-y-4">
                              <div>
                                <p className="text-green-800 font-medium">
                                  Approved and ready to apply
                                </p>
                                <p className="text-green-700 text-xs mt-1">
                                  Download the SQL and execute it in Snowsight or your preferred SQL client.
                                  Your credentials never leave your machine.
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleDownloadSql(changeset, details)}
                                  className="bg-blue-600 hover:bg-blue-700"
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download SQL
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCopySql(changeset, details)}
                                >
                                  {copiedId === changeset.id ? (
                                    <Check className="h-4 w-4 mr-2 text-green-600" />
                                  ) : (
                                    <Copy className="h-4 w-4 mr-2" />
                                  )}
                                  {copiedId === changeset.id ? 'Copied!' : 'Copy SQL'}
                                </Button>
                              </div>

                              <div className="border-t border-green-200 pt-3">
                                <p className="text-green-700 text-xs mb-2">
                                  After executing the SQL in Snowflake:
                                </p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleMarkApplied(changeset.id)}
                                  disabled={actionLoading === changeset.id}
                                  className="border-green-300 text-green-700 hover:bg-green-100"
                                >
                                  {actionLoading === changeset.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                  )}
                                  Mark as Applied
                                </Button>
                                <p className="text-green-600 text-xs mt-2">
                                  The next sync will verify that the changes were applied correctly.
                                </p>
                              </div>
                            </div>
                          )}

                          {changeset.status === 'applied' && (
                            <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm">
                              <div className="flex items-center gap-2 text-blue-800 font-medium">
                                <CheckCircle className="h-4 w-4" />
                                Applied
                              </div>
                              <p className="text-blue-700 text-xs mt-1">
                                This changeset has been marked as applied.
                                {changeset.applied_at && ` Applied on ${formatDate(changeset.applied_at)}.`}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Failed to load details</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
