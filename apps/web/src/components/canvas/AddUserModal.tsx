import { useState } from 'react'
import { User, Loader2, X, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

export interface UserDetails {
  userName: string
  email: string | null
  password: string | null
  confirmPassword: string | null
  comment: string | null
  mustChangePassword: boolean
  loginName: string | null
  displayName: string | null
  firstName: string | null
  lastName: string | null
  defaultNamespace: string | null
}

interface AddUserModalProps {
  connectionId: string
  onClose: () => void
  onUserCreated: (details: UserDetails) => void
}

export default function AddUserModal({ onClose, onUserCreated }: AddUserModalProps) {
  const [userName, setUserName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [comment, setComment] = useState('')
  const [mustChangePassword, setMustChangePassword] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loginName, setLoginName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [defaultNamespace, setDefaultNamespace] = useState('')
  const [creating, setCreating] = useState(false)

  const passwordsMatch = !password || !confirmPassword || password === confirmPassword

  const handleCreate = () => {
    if (!userName) return
    if (password && password !== confirmPassword) return

    setCreating(true)
    onUserCreated({
      userName,
      email: email || null,
      password: password || null,
      confirmPassword: confirmPassword || null,
      comment: comment || null,
      mustChangePassword,
      loginName: loginName || null,
      displayName: displayName || null,
      firstName: firstName || null,
      lastName: lastName || null,
      defaultNamespace: defaultNamespace || null,
    })
    setCreating(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-lg m-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Add User</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Basic fields - two column layout */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="modal-userName">User name *</Label>
              <Input
                id="modal-userName"
                placeholder="e.g., JOHN_DOE"
                value={userName}
                onChange={(e) => setUserName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modal-email">Email</Label>
              <Input
                id="modal-email"
                type="email"
                placeholder="e.g., john.doe@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {/* Password fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="modal-password" className="flex items-center gap-1">
                Password <span className="text-muted-foreground text-xs">(optional)</span>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </Label>
              <Input
                id="modal-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modal-confirmPassword">
                Confirm password <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                id="modal-confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={!passwordsMatch ? 'border-red-500' : ''}
              />
              {!passwordsMatch && (
                <p className="text-xs text-red-500">Passwords do not match</p>
              )}
            </div>
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <Label htmlFor="modal-comment">
              Comment <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="modal-comment"
              placeholder="Optional comment about this user"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          {/* Must change password checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="modal-mustChangePassword"
              checked={mustChangePassword}
              onCheckedChange={(checked: boolean | 'indeterminate') => setMustChangePassword(checked === true)}
            />
            <Label htmlFor="modal-mustChangePassword" className="text-sm font-normal cursor-pointer">
              Force user to change password on first time login
            </Label>
          </div>

          {/* Advanced options toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Advanced user options
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {/* Advanced options */}
          {showAdvanced && (
            <div className="space-y-4 pl-2 border-l-2 border-muted">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="modal-loginName">Login name</Label>
                  <Input
                    id="modal-loginName"
                    placeholder={userName || 'Same as user name'}
                    value={loginName}
                    onChange={(e) => setLoginName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="modal-displayName">Display name</Label>
                  <Input
                    id="modal-displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="modal-firstName">First name</Label>
                  <Input
                    id="modal-firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="modal-lastName">Last name</Label>
                  <Input
                    id="modal-lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="modal-defaultNamespace">Default namespace</Label>
                <Input
                  id="modal-defaultNamespace"
                  placeholder="<db_name>.<schema_name>"
                  value={defaultNamespace}
                  onChange={(e) => setDefaultNamespace(e.target.value)}
                />
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground border-t pt-3">
            After creating the user, drag connections from the user to roles on the canvas to assign roles.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t sticky bottom-0 bg-background">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!userName || !passwordsMatch || creating}>
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <User className="h-4 w-4 mr-2" />
            )}
            Add to Canvas
          </Button>
        </div>
      </div>
    </div>
  )
}
