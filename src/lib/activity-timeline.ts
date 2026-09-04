export type ActivityEventType =
  | 'STAGE_CHANGE'
  | 'NOTE_CREATED'
  | 'NOTE_UPDATED'
  | 'NOTE_DELETED'
  | 'COMMENT_CREATED'
  | 'COMMENT_UPDATED'
  | 'COMMENT_DELETED'
  | 'APPLICATION_CREATED'
  | 'APPLICATION_STARTED'
  | 'APPLICATION_SUBMITTED'
  | 'EVALUATION_COMPLETED';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  description: string;
  actorName: string | null;
  createdAt: Date;
}

export interface StageHistoryRow {
  id: string;
  stageName: string;
  previousStageName: string | null;
  movedByName: string | null;
  note: string | null;
  createdAt: Date;
}

export interface NoteRow {
  id: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommentRow {
  id: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationMilestones {
  jobTitle: string;
  createdAt: Date;
  startedAt: Date | null;
  submittedAt: Date | null;
  evaluationCompletedAt: Date | null;
}

export interface DeletedAuditRow {
  id: string;
  type: 'NOTE_DELETED' | 'COMMENT_DELETED';
  actorName: string | null;
  createdAt: Date;
}

/**
 * Builds the recruiter-facing activity timeline for one candidate from
 * already-fetched, real rows — no timestamps or actor names are invented
 * here; anything without a known actor (e.g. a system-triggered event) is
 * surfaced with actorName: null and the UI renders it without a name rather
 * than guessing one.
 */
export function buildActivityTimeline(input: {
  stageHistory: StageHistoryRow[];
  notes: NoteRow[];
  comments: CommentRow[];
  applications: ApplicationMilestones[];
  deletedAudit: DeletedAuditRow[];
}): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const h of input.stageHistory) {
    events.push({
      id: `stage-${h.id}`,
      type: 'STAGE_CHANGE',
      description: h.previousStageName
        ? `Moved candidate from ${h.previousStageName} to ${h.stageName}${h.note ? ` — "${h.note}"` : ''}`
        : `Candidate entered ${h.stageName}${h.note ? ` — "${h.note}"` : ''}`,
      actorName: h.movedByName,
      createdAt: h.createdAt,
    });
  }

  for (const n of input.notes) {
    events.push({
      id: `note-created-${n.id}`,
      type: 'NOTE_CREATED',
      description: 'Added a note',
      actorName: n.authorName,
      createdAt: n.createdAt,
    });
    // A note whose updatedAt differs from createdAt has genuinely been
    // edited at least once — this is read directly off the row's own real
    // timestamps, not inferred from anything else.
    if (n.updatedAt.getTime() !== n.createdAt.getTime()) {
      events.push({
        id: `note-updated-${n.id}`,
        type: 'NOTE_UPDATED',
        description: 'Edited a note',
        actorName: n.authorName,
        createdAt: n.updatedAt,
      });
    }
  }

  for (const c of input.comments) {
    events.push({
      id: `comment-created-${c.id}`,
      type: 'COMMENT_CREATED',
      description: 'Added a team comment',
      actorName: c.authorName,
      createdAt: c.createdAt,
    });
    if (c.updatedAt.getTime() !== c.createdAt.getTime()) {
      events.push({
        id: `comment-updated-${c.id}`,
        type: 'COMMENT_UPDATED',
        description: 'Edited a team comment',
        actorName: c.authorName,
        createdAt: c.updatedAt,
      });
    }
  }

  for (const d of input.deletedAudit) {
    events.push({
      id: `audit-${d.id}`,
      type: d.type,
      description: d.type === 'NOTE_DELETED' ? 'Deleted a note' : 'Deleted a team comment',
      actorName: d.actorName,
      createdAt: d.createdAt,
    });
  }

  for (const app of input.applications) {
    events.push({
      id: `app-created-${app.jobTitle}-${app.createdAt.getTime()}`,
      type: 'APPLICATION_CREATED',
      description: `Application created for ${app.jobTitle}`,
      actorName: null,
      createdAt: app.createdAt,
    });
    if (app.startedAt) {
      events.push({
        id: `app-started-${app.jobTitle}-${app.startedAt.getTime()}`,
        type: 'APPLICATION_STARTED',
        description: `Candidate started the interview for ${app.jobTitle}`,
        actorName: null,
        createdAt: app.startedAt,
      });
    }
    if (app.submittedAt) {
      events.push({
        id: `app-submitted-${app.jobTitle}-${app.submittedAt.getTime()}`,
        type: 'APPLICATION_SUBMITTED',
        description: `Candidate submitted the interview for ${app.jobTitle}`,
        actorName: null,
        createdAt: app.submittedAt,
      });
    }
    if (app.evaluationCompletedAt) {
      events.push({
        id: `app-evaluated-${app.jobTitle}-${app.evaluationCompletedAt.getTime()}`,
        type: 'EVALUATION_COMPLETED',
        description: `AI evaluation completed for ${app.jobTitle}`,
        actorName: null,
        createdAt: app.evaluationCompletedAt,
      });
    }
  }

  return events.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
