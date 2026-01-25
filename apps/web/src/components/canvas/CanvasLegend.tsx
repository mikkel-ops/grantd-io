import { X } from 'lucide-react'

interface CanvasLegendProps {
  focusedRole: string | null
  onClearFocus: () => void
}

const LEGEND_ITEMS = [
  { color: 'bg-blue-400', label: 'Users' },
  { color: 'bg-green-400', label: 'Business Roles' },
  { color: 'bg-purple-400', label: 'Functional Roles' },
  { color: 'bg-cyan-400', label: 'Databases' },
  { color: 'bg-amber-400', label: 'Hybrid Roles' },
]

export default function CanvasLegend({ focusedRole, onClearFocus }: CanvasLegendProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-6 text-sm">
        {LEGEND_ITEMS.map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${color}`} />
            <span>{label}</span>
          </div>
        ))}
        {focusedRole && (
          <div className="ml-auto flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1">
            <span className="text-purple-700">
              Viewing access for: <strong>{focusedRole}</strong>
            </span>
            <button onClick={onClearFocus} className="p-0.5 rounded hover:bg-purple-100">
              <X className="h-4 w-4 text-purple-600" />
            </button>
          </div>
        )}
      </div>

      {!focusedRole && (
        <p className="text-xs text-muted-foreground">
          Click on any <span className="text-green-600 font-medium">role</span> to see its database access.
        </p>
      )}
    </div>
  )
}
