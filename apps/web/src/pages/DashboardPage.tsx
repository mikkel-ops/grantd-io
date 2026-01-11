import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Database, Users, Shield, FileText, AlertTriangle } from 'lucide-react'

const stats = [
  {
    name: 'Connections',
    value: '0',
    description: 'Active platform connections',
    icon: Database,
  },
  {
    name: 'Roles',
    value: '0',
    description: 'Total roles synced',
    icon: Shield,
  },
  {
    name: 'Users',
    value: '0',
    description: 'Total users synced',
    icon: Users,
  },
  {
    name: 'Pending Changes',
    value: '0',
    description: 'Changesets awaiting review',
    icon: FileText,
  },
]

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your access control management
        </p>
      </div>

      {/* Empty state */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="rounded-full bg-muted p-3 mb-4">
            <Database className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No connections yet</h3>
          <p className="text-muted-foreground text-center max-w-sm mb-4">
            Connect your first data platform to start managing access control
            visually.
          </p>
          <a
            href="/connections"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add Connection
          </a>
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.name}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Drift alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Drift Detection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No drift detected. Your platform state matches Grantd.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
