import { describe, it, expect, vi, beforeEach } from 'vitest';

const pdfParseMock = vi.fn();
const mammothExtractRawTextMock = vi.fn();

vi.mock('pdf-parse', () => ({ default: (...args: unknown[]) => pdfParseMock(...args) }));
vi.mock('mammoth', () => ({ extractRawText: (...args: unknown[]) => mammothExtractRawTextMock(...args) }));

import { extractResumeText } from './resume-extraction';

beforeEach(() => {
  pdfParseMock.mockReset();
  mammothExtractRawTextMock.mockReset();
});

describe('extractResumeText — PDF', () => {
  it('returns extracted text on success', async () => {
    pdfParseMock.mockResolvedValue({ text: 'Senior engineer with 6 years of experience.' });
    const result = await extractResumeText({ buffer: Buffer.from('fake-pdf'), mimeType: 'application/pdf' });
    expect(result).toEqual({ status: 'COMPLETED', text: 'Senior engineer with 6 years of experience.' });
  });

  it('fails clearly for a scanned/image-only PDF with no extractable text', async () => {
    pdfParseMock.mockResolvedValue({ text: '   ' });
    const result = await extractResumeText({ buffer: Buffer.from('fake-pdf'), mimeType: 'application/pdf' });
    expect(result.status).toBe('FAILED');
    if (result.status === 'FAILED') expect(result.error).toMatch(/scanned|image-only/i);
  });

  it('fails clearly when the parser throws (corrupted/password-protected file)', async () => {
    pdfParseMock.mockRejectedValue(new Error('bad xref table'));
    const result = await extractResumeText({ buffer: Buffer.from('fake-pdf'), mimeType: 'application/pdf' });
    expect(result.status).toBe('FAILED');
  });
});

describe('extractResumeText — DOCX', () => {
  it('returns extracted text on success', async () => {
    mammothExtractRawTextMock.mockResolvedValue({ value: 'Backend engineer, Node.js, PostgreSQL.', messages: [] });
    const result = await extractResumeText({
      buffer: Buffer.from('fake-docx'),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(result).toEqual({ status: 'COMPLETED', text: 'Backend engineer, Node.js, PostgreSQL.' });
  });

  it('fails clearly when no text is extracted', async () => {
    mammothExtractRawTextMock.mockResolvedValue({ value: '', messages: [] });
    const result = await extractResumeText({
      buffer: Buffer.from('fake-docx'),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(result.status).toBe('FAILED');
  });
});

describe('extractResumeText — legacy .doc', () => {
  it('fails clearly and explicitly, never fabricating extracted text', async () => {
    const result = await extractResumeText({ buffer: Buffer.from('fake-doc'), mimeType: 'application/msword' });
    expect(result.status).toBe('FAILED');
    if (result.status === 'FAILED') expect(result.error).toMatch(/not supported/i);
    // Neither parser should ever be invoked for a legacy .doc file.
    expect(pdfParseMock).not.toHaveBeenCalled();
    expect(mammothExtractRawTextMock).not.toHaveBeenCalled();
  });
});

describe('extractResumeText — unsupported type', () => {
  it('fails clearly for an unrecognized MIME type', async () => {
    const result = await extractResumeText({ buffer: Buffer.from('x'), mimeType: 'image/png' });
    expect(result.status).toBe('FAILED');
  });
});
