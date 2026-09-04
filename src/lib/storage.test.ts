import { describe, it, expect } from 'vitest';
import {
  isAllowedResumeMimeType,
  isAllowedResumeExtension,
  buildResumeKey,
  buildRecordingKey,
  RESUME_EXTENSION_BY_MIME_TYPE,
  MAX_RESUME_BYTES,
} from './storage';

describe('isAllowedResumeMimeType', () => {
  it('accepts PDF, DOC, and DOCX MIME types', () => {
    expect(isAllowedResumeMimeType('application/pdf')).toBe(true);
    expect(isAllowedResumeMimeType('application/msword')).toBe(true);
    expect(
      isAllowedResumeMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ).toBe(true);
  });

  it('rejects other MIME types', () => {
    expect(isAllowedResumeMimeType('image/png')).toBe(false);
    expect(isAllowedResumeMimeType('application/zip')).toBe(false);
    expect(isAllowedResumeMimeType('text/plain')).toBe(false);
  });
});

describe('isAllowedResumeExtension', () => {
  it('accepts .pdf, .doc, .docx (case-insensitively)', () => {
    expect(isAllowedResumeExtension('resume.pdf')).toBe(true);
    expect(isAllowedResumeExtension('Resume.PDF')).toBe(true);
    expect(isAllowedResumeExtension('resume.doc')).toBe(true);
    expect(isAllowedResumeExtension('resume.docx')).toBe(true);
  });

  it('rejects other extensions', () => {
    expect(isAllowedResumeExtension('resume.exe')).toBe(false);
    expect(isAllowedResumeExtension('resume.png')).toBe(false);
    expect(isAllowedResumeExtension('resume')).toBe(false);
  });
});

describe('buildResumeKey', () => {
  it('builds a key with no redundant top-level "resumes/" segment (the bucket itself already namespaces resumes)', () => {
    const key = buildResumeKey({ orgId: 'org-1', applicationId: 'app-1', ext: 'pdf' });
    expect(key).toBe('org-1/app-1.pdf');
    expect(key.split('/')[0]).not.toBe('resumes');
  });

  it('sanitizes path-traversal characters out of ids', () => {
    const key = buildResumeKey({ orgId: '../../etc', applicationId: 'app 1', ext: 'pdf' });
    expect(key).not.toContain('..');
    expect(key).not.toContain('/etc');
  });

  it('never produces the same key for two different orgs', () => {
    const keyA = buildResumeKey({ orgId: 'org-1', applicationId: 'app-1', ext: 'pdf' });
    const keyB = buildResumeKey({ orgId: 'org-2', applicationId: 'app-1', ext: 'pdf' });
    expect(keyA).not.toBe(keyB);
  });

  it('has a structurally distinct shape from recording keys, so the two namespaces can never collide', () => {
    const resumeKey = buildResumeKey({ orgId: 'org-1', applicationId: 'app-1', ext: 'pdf' });
    const recordingKey = buildRecordingKey({ orgId: 'org-1', applicationId: 'app-1', questionId: 'q-1', ext: 'webm' });
    // Resume keys are "{orgId}/{applicationId}.{ext}" (2 segments); recording
    // keys are "recordings/{orgId}/{applicationId}/{questionId}.{ext}" (4
    // segments, always starting with the literal "recordings/") — even
    // without a "resumes/" prefix, the two shapes can't overlap.
    expect(resumeKey.split('/')).toHaveLength(2);
    expect(recordingKey.split('/')).toHaveLength(4);
    expect(recordingKey.startsWith('recordings/')).toBe(true);
    expect(resumeKey).not.toBe(recordingKey);
  });
});

describe('RESUME_EXTENSION_BY_MIME_TYPE / MAX_RESUME_BYTES', () => {
  it('maps each allowed MIME type to its canonical extension', () => {
    expect(RESUME_EXTENSION_BY_MIME_TYPE['application/pdf']).toBe('pdf');
    expect(RESUME_EXTENSION_BY_MIME_TYPE['application/msword']).toBe('doc');
    expect(
      RESUME_EXTENSION_BY_MIME_TYPE['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    ).toBe('docx');
  });

  it('caps resumes at 10MB', () => {
    expect(MAX_RESUME_BYTES).toBe(10 * 1024 * 1024);
  });
});
