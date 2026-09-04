'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, FileText, AlertTriangle, CheckCircle2, Upload, RefreshCw, Eye, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_BYTES = 10 * 1024 * 1024;

interface ResumeStatus {
  fileName: string | null;
  parseStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  parseError: string | null;
}

function fileKind(fileName: string | null) {
  const ext = fileName?.split('.').pop()?.toUpperCase();
  return ext && ['PDF', 'DOC', 'DOCX'].includes(ext) ? ext : 'File';
}

export function ResumeCard({
  resume: initialResume,
  viewUrl,
}: {
  resume: ResumeStatus | null;
  /** Short-lived signed URL, generated server-side — null if no resume yet, or storage isn't configured. */
  viewUrl: string | null;
}) {
  const router = useRouter();
  const [resume, setResume] = React.useState(initialResume);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // The server just regenerated a fresh signed URL for whatever resume is
  // currently on the profile — keep local state (set right after an
  // upload, before the page has refreshed) in sync with it.
  React.useEffect(() => {
    setResume(initialResume);
  }, [initialResume]);

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
      const urlRes = await fetch('/api/candidate/profile/resume/upload-url', {
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

      const completeRes = await fetch('/api/candidate/profile/resume/complete', {
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
      // Re-runs the server page, which regenerates a fresh signed viewUrl
      // for the new file — see profile/page.tsx.
      router.refresh();
    } catch {
      setError('Network error — please check your connection and try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resume</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {resume ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <FileText className="h-4.5 w-4.5" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium leading-none">{resume.fileName ?? 'Resume'}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {fileKind(resume.fileName)}
                  </Badge>
                </div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  {resume.parseStatus === 'PROCESSING' ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> Processing…
                    </>
                  ) : resume.parseStatus === 'FAILED' ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-success" /> Resume uploaded successfully
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-success" /> Uploaded and parsed successfully
                    </>
                  )}
                </p>
                {resume.parseStatus === 'FAILED' && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 shrink-0 text-warning" /> Text extraction unavailable — your
                    resume is still saved and visible to recruiters.
                  </p>
                )}
              </div>
            </div>

            {viewUrl && (
              <div className="flex shrink-0 gap-2 sm:pl-2">
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                    <Eye className="h-3.5 w-3.5" /> View
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <a href={viewUrl} download={resume.fileName ?? undefined}>
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No resume uploaded yet.</p>
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

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant={resume ? 'outline' : 'default'}
            size="sm"
            className="gap-1.5"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : resume ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {uploading ? 'Uploading…' : resume ? 'Replace resume' : 'Upload resume'}
          </Button>
          <p className="text-xs text-muted-foreground">PDF, DOC, or DOCX, up to 10MB.</p>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
