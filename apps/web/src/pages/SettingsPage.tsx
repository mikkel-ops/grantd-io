import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth'

export default function SettingsPage() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and organization settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email || ''} disabled />
          </div>
          <div className="space-y-2">
            <Label>Organization Role</Label>
            <Input value={user?.role || 'Member'} disabled />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Organization ID</Label>
            <Input value={user?.orgId || 'Not set'} disabled />
          </div>
          <Button variant="outline">Invite Team Member</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive">Delete Account</Button>
        </CardContent>
      </Card>
    </div>
  )
}
