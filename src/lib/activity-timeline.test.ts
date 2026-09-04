import { describe, it, expect } from 'vitest';
import { buildActivityTimeline } from './activity-timeline';

const T = (iso: string) => new Date(iso);

describe('buildActivityTimeline', () => {
  it('renders a stage change with previous/next stage names, actor, and real timestamp', () => {
    const events = buildActivityTimeline({
      stageHistory: [
        {
          id: 'h1',
          stageName: 'Screening',
          previousStageName: 'Applied',
          movedByName: 'Priyanshu',
          note: null,
          createdAt: T('2026-01-01T10:00:00Z'),
        },
      ],
      notes: [],
      comments: [],
      applications: [],
      deletedAudit: [],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'STAGE_CHANGE',
      description: 'Moved candidate from Applied to Screening',
      actorName: 'Priyanshu',
      createdAt: T('2026-01-01T10:00:00Z'),
    });
  });

  it('describes an initial stage entry (no previous stage) differently from a move', () => {
    const events = buildActivityTimeline({
      stageHistory: [
        { id: 'h1', stageName: 'Applied', previousStageName: null, movedByName: null, note: null, createdAt: T('2026-01-01T00:00:00Z') },
      ],
      notes: [],
      comments: [],
      applications: [],
      deletedAudit: [],
    });

    expect(events[0]!.description).toBe('Candidate entered Applied');
    expect(events[0]!.actorName).toBeNull();
  });

  it('includes a stage-change note in the description when present', () => {
    const events = buildActivityTimeline({
      stageHistory: [
        {
          id: 'h1',
          stageName: 'Shortlisted',
          previousStageName: 'Interview',
          movedByName: 'Sarah',
          note: 'Great communication',
          createdAt: T('2026-01-01T00:00:00Z'),
        },
      ],
      notes: [],
      comments: [],
      applications: [],
      deletedAudit: [],
    });

    expect(events[0]!.description).toContain('Great communication');
  });

  it('produces only a NOTE_CREATED event for a never-edited note', () => {
    const events = buildActivityTimeline({
      stageHistory: [],
      notes: [{ id: 'n1', authorName: 'Mike', createdAt: T('2026-01-01T00:00:00Z'), updatedAt: T('2026-01-01T00:00:00Z') }],
      comments: [],
      applications: [],
      deletedAudit: [],
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('NOTE_CREATED');
  });

  it('produces both NOTE_CREATED and NOTE_UPDATED events for an edited note', () => {
    const events = buildActivityTimeline({
      stageHistory: [],
      notes: [{ id: 'n1', authorName: 'Mike', createdAt: T('2026-01-01T00:00:00Z'), updatedAt: T('2026-01-02T00:00:00Z') }],
      comments: [],
      applications: [],
      deletedAudit: [],
    });

    const types = events.map((e) => e.type).sort();
    expect(types).toEqual(['NOTE_CREATED', 'NOTE_UPDATED']);
  });

  it('includes a deleted-note event sourced from the audit log with its actor', () => {
    const events = buildActivityTimeline({
      stageHistory: [],
      notes: [],
      comments: [],
      applications: [],
      deletedAudit: [{ id: 'a1', type: 'NOTE_DELETED', actorName: 'Sarah', createdAt: T('2026-01-01T00:00:00Z') }],
    });

    expect(events[0]).toMatchObject({ type: 'NOTE_DELETED', actorName: 'Sarah', description: 'Deleted a note' });
  });

  it('includes application milestones only when the timestamps actually exist', () => {
    const events = buildActivityTimeline({
      stageHistory: [],
      notes: [],
      comments: [],
      applications: [
        {
          jobTitle: 'Backend Engineer',
          createdAt: T('2026-01-01T00:00:00Z'),
          startedAt: null,
          submittedAt: null,
          evaluationCompletedAt: null,
        },
      ],
      deletedAudit: [],
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('APPLICATION_CREATED');
  });

  it('includes evaluation-completed only when evaluation status is COMPLETED (never fabricated)', () => {
    const events = buildActivityTimeline({
      stageHistory: [],
      notes: [],
      comments: [],
      applications: [
        {
          jobTitle: 'Backend Engineer',
          createdAt: T('2026-01-01T00:00:00Z'),
          startedAt: T('2026-01-01T01:00:00Z'),
          submittedAt: T('2026-01-01T02:00:00Z'),
          evaluationCompletedAt: T('2026-01-01T03:00:00Z'),
        },
      ],
      deletedAudit: [],
    });

    const evalEvent = events.find((e) => e.type === 'EVALUATION_COMPLETED');
    expect(evalEvent).toBeDefined();
    expect(evalEvent!.createdAt).toEqual(T('2026-01-01T03:00:00Z'));
  });

  it('sorts all events newest-first regardless of source', () => {
    const events = buildActivityTimeline({
      stageHistory: [
        { id: 'h1', stageName: 'Screening', previousStageName: 'Applied', movedByName: 'A', note: null, createdAt: T('2026-01-02T00:00:00Z') },
      ],
      notes: [{ id: 'n1', authorName: 'B', createdAt: T('2026-01-03T00:00:00Z'), updatedAt: T('2026-01-03T00:00:00Z') }],
      comments: [{ id: 'c1', authorName: 'C', createdAt: T('2026-01-01T00:00:00Z'), updatedAt: T('2026-01-01T00:00:00Z') }],
      applications: [],
      deletedAudit: [],
    });

    const timestamps = events.map((e) => e.createdAt.getTime());
    const sorted = [...timestamps].sort((a, b) => b - a);
    expect(timestamps).toEqual(sorted);
  });

  it('never fabricates an actor name — null actor stays null', () => {
    const events = buildActivityTimeline({
      stageHistory: [
        { id: 'h1', stageName: 'Applied', previousStageName: null, movedByName: null, note: null, createdAt: T('2026-01-01T00:00:00Z') },
      ],
      notes: [],
      comments: [],
      applications: [],
      deletedAudit: [],
    });

    expect(events[0]!.actorName).toBeNull();
  });
});
