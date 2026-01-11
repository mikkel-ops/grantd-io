import { Card, CardContent } from '@/components/ui/card'
import { Shield } from 'lucide-react'

export default function RolesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Roles</h1>
        <p className="text-muted-foreground">
          View and manage roles across your connected platforms
        </p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="rounded-full bg-muted p-3 mb-4">
            <Shield className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No roles synced</h3>
          <p className="text-muted-foreground text-center max-w-sm">
            Connect a platform and run a sync to see your roles here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
