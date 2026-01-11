import { Card, CardContent } from '@/components/ui/card'
import { Users } from 'lucide-react'

export default function UsersPage() {
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
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No users synced</h3>
          <p className="text-muted-foreground text-center max-w-sm">
            Connect a platform and run a sync to see your users here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
