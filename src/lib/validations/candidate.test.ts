import { describe, it, expect } from 'vitest';
import { candidateInfoSchema, answerTextSchema, uploadUrlRequestSchema, recordingCompleteSchema, resumeUploadUrlRequestSchema, resumeCompleteSchema } from './candidate';

describe('candidateInfoSchema', () => {
  it('accepts a minimal valid submission', () => {
    const result = candidateInfoSchema.safeParse({ name: 'Amara Chen', email: 'amara@example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects a missing/short name', () => {
    const result = candidateInfoSchema.safeParse({ name: 'A', email: 'amara@example.com' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = candidateInfoSchema.safeParse({ name: 'Amara Chen', email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('treats an empty phone string as absent rather than an error', () => {
    const result = candidateInfoSchema.safeParse({ name: 'Amara Chen', email: 'amara@example.com', phone: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBeUndefined();
  });

  it('defaults preferredLanguage to "en" when omitted', () => {
    const result = candidateInfoSchema.safeParse({ name: 'Amara Chen', email: 'amara@example.com' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.preferredLanguage).toBe('en');
  });
});

describe('answerTextSchema', () => {
  it('rejects an empty answer', () => {
    const result = answerTextSchema.safeParse({ text: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects an answer over the length limit', () => {
    const result = answerTextSchema.safeParse({ text: 'a'.repeat(8001) });
    expect(result.success).toBe(false);
  });

  it('accepts a normal answer', () => {
    const result = answerTextSchema.safeParse({ text: 'I led the migration to a service-oriented architecture.' });
    expect(result.success).toBe(true);
  });
});

describe('uploadUrlRequestSchema', () => {
  it('rejects a non-positive size', () => {
    const result = uploadUrlRequestSchema.safeParse({ mimeType: 'video/webm', sizeBytes: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects an oversized request', () => {
    const result = uploadUrlRequestSchema.safeParse({ mimeType: 'video/webm', sizeBytes: 600 * 1024 * 1024 });
    expect(result.success).toBe(false);
  });

  it('accepts a reasonable request', () => {
    const result = uploadUrlRequestSchema.safeParse({ mimeType: 'video/webm', sizeBytes: 5 * 1024 * 1024 });
    expect(result.success).toBe(true);
  });
});

describe('recordingCompleteSchema', () => {
  it('requires a storageKey', () => {
    const result = recordingCompleteSchema.safeParse({ durationSec: 60 });
    expect(result.success).toBe(false);
  });

  it('accepts a valid completion payload', () => {
    const result = recordingCompleteSchema.safeParse({ storageKey: 'recordings/org1/app1/q1.webm', durationSec: 90 });
    expect(result.success).toBe(true);
  });
});

describe('resumeUploadUrlRequestSchema', () => {
  it('accepts a valid PDF request', () => {
    const result = resumeUploadUrlRequestSchema.safeParse({
      fileName: 'resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 500_000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing fileName', () => {
    const result = resumeUploadUrlRequestSchema.safeParse({ mimeType: 'application/pdf', sizeBytes: 500_000 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive size', () => {
    const result = resumeUploadUrlRequestSchema.safeParse({ fileName: 'resume.pdf', mimeType: 'application/pdf', sizeBytes: 0 });
    expect(result.success).toBe(false);
  });
});

describe('resumeCompleteSchema', () => {
  it('accepts a valid completion payload', () => {
    const result = resumeCompleteSchema.safeParse({
      storageKey: 'resumes/org1/app1.pdf',
      fileName: 'resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 500_000,
    });
    expect(result.success).toBe(true);
  });

  it('requires all fields', () => {
    const result = resumeCompleteSchema.safeParse({ storageKey: 'resumes/org1/app1.pdf' });
    expect(result.success).toBe(false);
  });
});
