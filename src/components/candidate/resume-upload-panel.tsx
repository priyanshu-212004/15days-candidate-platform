'use client';

import * as React from 'react';
import { Loader2, FileText, AlertTriangle, CheckCircle2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_BYTES = 10 * 1024 * 1024;

interface ResumeStatus {
  fileName: string;
  parseStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  parseError: string | null;
}

export function ResumeUploadPanel({
  token,
  initialResume,
  onDone,
}: {
  token: string;
  initialResume: ResumeStatus | null;
  onDone: () => void;
}) {
  const [resume, setResume] = React.useState<ResumeStatus | null>(initialResume);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      setError('Please upload a PDF, DOC, or DOCX file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That file is too large — the limit is 10MB.');
      return;
    }

    setUploading(true);
    try {
      const urlRes = await fetch(`/api/public/interviews/${token}/resume/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!urlRes.ok) {
        const data = await urlRes.json().catch(() => null);
        setError(data?.error ?? 'Could not start the upload. Please try again.');
        setUploading(false);
        return;
      }
      const { url, key } = await urlRes.json();

      const putRes = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!putRes.ok) {
        setError('The upload did not complete. Please try again.');
        setUploading(false);
        return;
      }

      const completeRes = await fetch(`/api/public/interviews/${token}/resume/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storageKey: key, fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!completeRes.ok) {
        const data = await completeRes.json().catch(() => null);
        setError(data?.error ?? 'Could not save your resume. Please try again.');
        setUploading(false);
        return;
      }
      const data = await completeRes.json();
      setResume(data.resume);
    } catch {
      setError('Network error — please check your connection and try again.');
    } finally {
      setUploading(false);
    }
  }

  const uploaded = !!resume;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-lg font-medium leading-snug">Upload your resume</p>
        <p className="text-sm text-muted-foreground">
          This recruiter requires a resume before you start the interview. PDF, DOC, or DOCX, up to 10MB.
        </p>
      </div>

      {uploaded ? (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <div>
            <p className="font-medium">{resume.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {resume.parseStatus === 'FAILED'
                ? "We couldn't read this file, but it's saved and the recruiter will still see it."
                : 'Uploaded successfully.'}
            </p>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex w-full flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-8 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          <span>{uploading ? 'Uploading…' : 'Click to choose a file'}</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />

      {error && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      <Button type="button" className="w-full gap-2" disabled={!uploaded || uploading} onClick={onDone}>
        <FileText className="h-4 w-4" /> Continue to interview
      </Button>
    </div>
  );
}
