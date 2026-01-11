import { Card, CardContent } from '@/components/ui/card'
import { FileText } from 'lucide-react'

export default function ChangesetsPage() {
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
            Create roles or modify permissions to generate changesets for
            review.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
