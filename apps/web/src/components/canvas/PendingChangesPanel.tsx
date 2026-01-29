import { User, Shield, Plus, Minus, Trash2, FileText, ArrowRight, Loader2, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PendingChange } from './hooks'

interface PendingChangesPanelProps {
  changes: PendingChange[]
  onRemoveChange: (changeId: string, changeType: PendingChange['type']) => void
  onSubmit: () => void
  onClearAll: () => void
  submitting: boolean
}

export default function PendingChangesPanel({
  changes,
  onRemoveChange,
  onSubmit,
  onClearAll,
  submitting,
}: PendingChangesPanelProps) {
  return (
    <Card className="w-80 flex-shrink-0 flex flex-col max-h-full overflow-hidden">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Pending Changes
          {changes.length > 0 && (
            <span className="ml-auto bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs">
              {changes.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden flex flex-col">
        {changes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No pending changes</p>
            <p className="text-xs mt-1">Click on a role, then click privileges to grant or revoke access</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {changes.map((change) => (
                <PendingChangeItem
                  key={change.id}
                  change={change}
                  onRemove={() => onRemoveChange(change.id, change.type)}
                />
              ))}
            </div>

            <div className="pt-3 border-t space-y-2 flex-shrink-0 mt-3">
              <Button onClick={onSubmit} disabled={submitting} className="w-full">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Create Changeset
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={onClearAll} className="w-full">
                Clear All
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function PendingChangeItem({
  change,
  onRemove,
}: {
  change: PendingChange
  onRemove: () => void
}) {
  const isRevokeRole = change.type === 'revoke_role'
  const isRevokePrivilege = change.type === 'revoke_privilege'
  const isRevoke = isRevokeRole || isRevokePrivilege
  const isCreateUser = change.type === 'create_user'
  const isCreateRole = change.type === 'create_role'
  const isGrantPrivilege = change.type === 'grant_privilege'
  const isInheritRole = change.type === 'inherit_role'
  const isPrivilegeChange = isGrantPrivilege || isRevokePrivilege
  const isCreate = isCreateUser || isCreateRole

  // Get the object name for privilege changes
  const objectName = change.schemaName
    ? `${change.databaseName}.${change.schemaName}`
    : change.databaseName

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
        isRevoke ? 'bg-red-50 border border-red-200' :
        isGrantPrivilege ? 'bg-green-50 border border-green-200' :
        'bg-green-50 border border-green-200'
      }`}
    >
      {isRevoke ? (
        <Minus className="h-4 w-4 text-red-600 flex-shrink-0" />
      ) : isGrantPrivilege ? (
        <Plus className="h-4 w-4 text-green-600 flex-shrink-0" />
      ) : (
        <Plus className="h-4 w-4 text-green-600 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        {isCreate ? (
          <>
            <div className="flex items-center gap-1">
              {isCreateUser ? (
                <User className="h-3 w-3 text-blue-600 flex-shrink-0" />
              ) : (
                <Shield className="h-3 w-3 text-green-600 flex-shrink-0" />
              )}
              <span className="font-medium truncate">
                {isCreateUser ? change.userName : change.roleName}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {isCreateUser ? 'Create user' : 'Create role'}
            </div>
          </>
        ) : isPrivilegeChange ? (
          <>
            <div className="flex items-center gap-1">
              <Shield className="h-3 w-3 flex-shrink-0" style={{ color: isRevoke ? '#dc2626' : '#16a34a' }} />
              <span className="font-medium truncate">{change.roleName}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <Database className="h-3 w-3 text-cyan-600 flex-shrink-0" />
            </div>
            <div className="text-xs text-muted-foreground">
              {isRevoke ? 'Revoke' : 'Grant'} <span className="font-medium">{change.privilege || change.privilegeGrants?.map(g => g.privilege).join(', ')}</span> on {objectName}
            </div>
          </>
        ) : isInheritRole ? (
          <>
            <div className="flex items-center gap-1">
              <Shield className="h-3 w-3 text-purple-600 flex-shrink-0" />
              <span className="font-medium truncate">{change.childRoleName}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <Shield className="h-3 w-3 text-purple-600 flex-shrink-0" />
              <span className="font-medium truncate">{change.parentRoleName}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Role inheritance
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <span className="font-medium truncate">{change.userName}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="font-medium truncate">{change.roleName}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {isRevokeRole ? 'Revoke role' : 'Grant role'}
            </div>
          </>
        )}
      </div>
      <button
        onClick={onRemove}
        className={`p-1 rounded ${
          isRevoke ? 'hover:bg-red-100 text-red-600' :
          'hover:bg-green-100 text-green-600'
        }`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
