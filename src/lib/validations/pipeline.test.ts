import { describe, it, expect } from 'vitest';
import { stageChangeSchema, noteBodySchema, commentBodySchema } from './pipeline';

describe('stageChangeSchema', () => {
  it('accepts a valid stage id', () => {
    const result = stageChangeSchema.safeParse({ stageId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID stage id (invalid stage)', () => {
    const result = stageChangeSchema.safeParse({ stageId: 'not-a-real-stage' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing stage id', () => {
    const result = stageChangeSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts an optional note alongside the stage id', () => {
    const result = stageChangeSchema.safeParse({
      stageId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      note: 'Great technical round',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a note over the max length', () => {
    const result = stageChangeSchema.safeParse({
      stageId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      note: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe('noteBodySchema', () => {
  it('accepts non-empty note content', () => {
    const result = noteBodySchema.safeParse({ body: 'Strong communication skills.' });
    expect(result.success).toBe(true);
  });

  it('rejects empty note content', () => {
    const result = noteBodySchema.safeParse({ body: '' });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only note content', () => {
    const result = noteBodySchema.safeParse({ body: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects note content over the max length', () => {
    const result = noteBodySchema.safeParse({ body: 'x'.repeat(4001) });
    expect(result.success).toBe(false);
  });

  it('accepts note content at exactly the max length', () => {
    const result = noteBodySchema.safeParse({ body: 'x'.repeat(4000) });
    expect(result.success).toBe(true);
  });
});

describe('commentBodySchema', () => {
  it('accepts non-empty comment content', () => {
    const result = commentBodySchema.safeParse({ body: 'Can someone review this before Friday?' });
    expect(result.success).toBe(true);
  });

  it('rejects empty comment content', () => {
    const result = commentBodySchema.safeParse({ body: '' });
    expect(result.success).toBe(false);
  });

  it('rejects comment content over the max length', () => {
    const result = commentBodySchema.safeParse({ body: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
  });
});
