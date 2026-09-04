import { formatDistanceToNow } from 'date-fns';
import { GitBranch, StickyNote, MessagesSquare, FileText, PlayCircle, CheckCircle2, Send } from 'lucide-react';
import type { ActivityEvent } from '@/lib/activity-timeline';
import { EmptyState } from '@/components/ui/state';
import { Clock } from 'lucide-react';

const ICONS: Record<ActivityEvent['type'], React.ReactNode> = {
  STAGE_CHANGE: <GitBranch className="h-3.5 w-3.5" />,
  NOTE_CREATED: <StickyNote className="h-3.5 w-3.5" />,
  NOTE_UPDATED: <StickyNote className="h-3.5 w-3.5" />,
  NOTE_DELETED: <StickyNote className="h-3.5 w-3.5" />,
  COMMENT_CREATED: <MessagesSquare className="h-3.5 w-3.5" />,
  COMMENT_UPDATED: <MessagesSquare className="h-3.5 w-3.5" />,
  COMMENT_DELETED: <MessagesSquare className="h-3.5 w-3.5" />,
  APPLICATION_CREATED: <FileText className="h-3.5 w-3.5" />,
  APPLICATION_STARTED: <PlayCircle className="h-3.5 w-3.5" />,
  APPLICATION_SUBMITTED: <Send className="h-3.5 w-3.5" />,
  EVALUATION_COMPLETED: <CheckCircle2 className="h-3.5 w-3.5" />,
};

export function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="h-5 w-5" />}
        title="No activity yet"
        description="Pipeline moves, notes, and comments for this candidate will show up here."
      />
    );
  }

  return (
    <ol className="space-y-4">
      {events.map((event) => (
        <li key={event.id} className="flex gap-3">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            {ICONS[event.type]}
          </div>
          <div className="min-w-0 flex-1 border-b border-border pb-4 last:border-0 last:pb-0">
            <p className="text-sm">
              {event.actorName && <span className="font-medium">{event.actorName} </span>}
              {event.description}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(event.createdAt, { addSuffix: true })}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
