/**
 * Resume text extraction. Server-only, and deliberately synchronous/local —
 * this is CPU-bound text parsing, not a network call, so it's safe to run
 * inline in the candidate's upload request without a queue.
 *
 * PDF: pdf-parse. DOCX: mammoth (raw text extraction). Legacy binary .doc
 * has no reliable pure-JS parser in this stack — mammoth only reads the
 * modern .docx (OOXML) format — so rather than fabricate a result we fail
 * clearly and ask for a modern format. The file itself is still stored and
 * viewable by the recruiter either way.
 */

import 'server-only';

export type ExtractionResult =
  | { status: 'COMPLETED'; text: string }
  | { status: 'FAILED'; error: string };

export async function extractResumeText(params: {
  buffer: Buffer;
  mimeType: string;
}): Promise<ExtractionResult> {
  const { buffer, mimeType } = params;

  try {
    if (mimeType === 'application/pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const parsed = await pdfParse(buffer);
      const text = (parsed.text ?? '').trim();
      if (!text) {
        return {
          status: 'FAILED',
          error: 'No extractable text found — this looks like a scanned or image-only PDF.',
        };
      }
      return { status: 'COMPLETED', text };
    }

    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      const text = (result.value ?? '').trim();
      if (!text) {
        return { status: 'FAILED', error: 'No extractable text found in this document.' };
      }
      return { status: 'COMPLETED', text };
    }

    if (mimeType === 'application/msword') {
      return {
        status: 'FAILED',
        error:
          'Legacy .doc files are not supported for text extraction. Please ask the candidate to re-upload as PDF or .docx.',
      };
    }

    return { status: 'FAILED', error: `Unsupported file type for extraction: ${mimeType}` };
  } catch (err) {
    console.error('[resume-extraction] extraction threw:', err);
    return {
      status: 'FAILED',
      error: 'We could not read this file. It may be corrupted, password-protected, or in an unsupported format.',
    };
  }
}
