import { useState } from 'react'
import { Shield, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AddRoleModalProps {
  connectionId: string
  onClose: () => void
  onRoleCreated: (roleName: string, inheritedRoles: string[], assignedUsers: string[]) => void
}

export default function AddRoleModal({ onClose, onRoleCreated }: AddRoleModalProps) {
  const [roleName, setRoleName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = () => {
    if (!roleName) return
    setCreating(true)
    // Just add to canvas - no API call, role inheritance done via canvas connections
    onRoleCreated(roleName, [], [])
    setCreating(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-md m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Add Business Role</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="modal-roleName">Role Name *</Label>
            <Input
              id="modal-roleName"
              placeholder="e.g., DATA_ANALYST_ROLE"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Use uppercase letters, numbers, and underscores only
            </p>
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3">
            After creating the role, drag connections on the canvas to assign users or inherit from other roles.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!roleName || creating}>
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Shield className="h-4 w-4 mr-2" />
            )}
            Add to Canvas
          </Button>
        </div>
      </div>
    </div>
  )
}
