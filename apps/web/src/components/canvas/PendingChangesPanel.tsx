import { User, Shield, Plus, Minus, Trash2, FileText, ArrowRight, Loader2 } from 'lucide-react'
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
  if (changes.length === 0) {
    return null
  }

  return (
    <Card className="w-80 flex-shrink-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Pending Changes
          <span className="ml-auto bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs">
            {changes.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {changes.map((change) => (
          <PendingChangeItem
            key={change.id}
            change={change}
            onRemove={() => onRemoveChange(change.id, change.type)}
          />
        ))}

        <div className="pt-3 border-t space-y-2">
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
  const isRevoke = change.type === 'revoke_role'
  const isCreateUser = change.type === 'create_user'
  const isCreateRole = change.type === 'create_role'
  const isCreate = isCreateUser || isCreateRole

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
        isRevoke ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
      }`}
    >
      {isRevoke ? (
        <Minus className="h-4 w-4 text-red-600 flex-shrink-0" />
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
        ) : (
          <>
            <div className="flex items-center gap-1">
              <span className="font-medium truncate">{change.userName}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="font-medium truncate">{change.roleName}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {isRevoke ? 'Revoke role' : 'Grant role'}
            </div>
          </>
        )}
      </div>
      <button
        onClick={onRemove}
        className={`p-1 rounded ${
          isRevoke ? 'hover:bg-red-100 text-red-600' : 'hover:bg-green-100 text-green-600'
        }`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
