import { Card, CardContent } from '@/components/ui/card';

export function ProfileCompletionBar({ percent }: { percent: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex-1">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium">Profile completion</span>
            <span className="text-muted-foreground">{percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
