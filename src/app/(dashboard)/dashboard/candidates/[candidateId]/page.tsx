import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { formatDistanceToNow } from 'date-fns';
import { authOptions } from '@/lib/auth';
import { getCandidateById, listOrgPipelineStages, getCandidateNotes, getCandidateComments, getCandidateActivity } from '@/lib/queries/candidates';
import { isStorageConfigured, createViewUrl } from '@/lib/storage';
import { isAiConfigured } from '@/lib/ai-evaluation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { EvaluateButton } from '@/components/candidates/evaluate-button';
import { StageSelector } from '@/components/candidates/stage-selector';
import { InternalDiscussionSection } from '@/components/candidates/internal-discussion-section';
import { ActivityTimeline } from '@/components/candidates/activity-timeline';
import { initials, formatScore } from '@/lib/utils';
import { Mail, Phone, Video as VideoIcon, FileText, Sparkles, Clock, Download } from 'lucide-react';

interface PageProps {
  params: { candidateId: string };
}

export default async function CandidateDetailPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user.orgId) redirect('/login');

  const candidate = await getCandidateById(session.user.orgId, params.candidateId);
  if (!candidate) notFound();

  const [stages, notes, comments, activity] = await Promise.all([
    listOrgPipelineStages(session.user.orgId),
    getCandidateNotes(session.user.orgId, candidate.id),
    getCandidateComments(session.user.orgId, candidate.id),
    getCandidateActivity(session.user.orgId, candidate.id),
  ]);

  const recordingsEnabled = isStorageConfigured();
  const aiEnabled = isAiConfigured();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start gap-3">
        <Avatar className="h-11 w-11">
          <AvatarFallback>{initials(candidate.name)}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{candidate.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> {candidate.email}
            </span>
            {candidate.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {candidate.phone}
              </span>
            )}
          </div>
        </div>
      </div>

      {candidate.user?.candidateProfile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Candidate account profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            {candidate.user.candidateProfile.currentTitle && (
              <div>
                <p className="text-xs text-muted-foreground">Current role</p>
                <p>
                  {candidate.user.candidateProfile.currentTitle}
                  {candidate.user.candidateProfile.currentCompany && ` at ${candidate.user.candidateProfile.currentCompany}`}
                </p>
              </div>
            )}
            {candidate.user.candidateProfile.totalExperienceYears != null && (
              <div>
                <p className="text-xs text-muted-foreground">Total experience</p>
                <p>{candidate.user.candidateProfile.totalExperienceYears} yrs</p>
              </div>
            )}
            {candidate.user.candidateProfile.skills.length > 0 && (
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs text-muted-foreground">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.user.candidateProfile.skills.map((s: string) => (
                    <Badge key={s} variant="outline">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {candidate.user.candidateProfile.experience.length > 0 && (
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs text-muted-foreground">Experience</p>
                <ul className="space-y-1">
                  {candidate.user.candidateProfile.experience.map(
                    (e: (typeof candidate.user.candidateProfile.experience)[number]) => (
                      <li key={e.id}>
                        {e.title} at {e.company}
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}
            {candidate.user.candidateProfile.education.length > 0 && (
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs text-muted-foreground">Education</p>
                <ul className="space-y-1">
                  {candidate.user.candidateProfile.education.map(
                    (e: (typeof candidate.user.candidateProfile.education)[number]) => (
                      <li key={e.id}>
                        {e.degree}, {e.institution}
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {candidate.applications.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            This candidate hasn&apos;t started an interview yet.
          </CardContent>
        </Card>
      ) : candidate.applications.length === 1 ? (
        <ApplicationDetail
          application={candidate.applications[0]!}
          candidateId={candidate.id}
          recordingsEnabled={recordingsEnabled}
          aiEnabled={aiEnabled}
          stages={stages}
        />
      ) : (
        <Tabs defaultValue={candidate.applications[0]!.id}>
          <TabsList>
            {candidate.applications.map((app: (typeof candidate.applications)[number]) => (
              <TabsTrigger key={app.id} value={app.id}>
                {app.job.title}
              </TabsTrigger>
            ))}
          </TabsList>
          {candidate.applications.map((app: (typeof candidate.applications)[number]) => (
            <TabsContent key={app.id} value={app.id} className="mt-4">
              <ApplicationDetail
                application={app}
                candidateId={candidate.id}
                recordingsEnabled={recordingsEnabled}
                aiEnabled={aiEnabled}
                stages={stages}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <InternalDiscussionSection
            kind="note"
            candidateId={candidate.id}
            apiBasePath={`/api/candidates/${candidate.id}/notes`}
            initialItems={notes.map((n: (typeof notes)[number]) => ({
              id: n.id,
              body: n.body,
              createdAt: n.createdAt.toISOString(),
              updatedAt: n.updatedAt.toISOString(),
              author: n.author,
            }))}
            placeholder="Add a private note about this candidate…"
            maxLength={4000}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team comments</CardTitle>
        </CardHeader>
        <CardContent>
          <InternalDiscussionSection
            kind="comment"
            candidateId={candidate.id}
            apiBasePath={`/api/candidates/${candidate.id}/comments`}
            initialItems={comments.map((c: (typeof comments)[number]) => ({
              id: c.id,
              body: c.body,
              createdAt: c.createdAt.toISOString(),
              updatedAt: c.updatedAt.toISOString(),
              author: c.author,
            }))}
            placeholder="Post a comment for the team…"
            maxLength={2000}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityTimeline events={activity} />
        </CardContent>
      </Card>
    </div>
  );
}

type CandidateWithApplications = NonNullable<Awaited<ReturnType<typeof getCandidateById>>>;
type Application = CandidateWithApplications['applications'][number];
type StageOption = Awaited<ReturnType<typeof listOrgPipelineStages>>[number];

async function ApplicationDetail({
  application,
  candidateId,
  recordingsEnabled,
  aiEnabled,
  stages,
}: {
  application: Application;
  candidateId: string;
  recordingsEnabled: boolean;
  aiEnabled: boolean;
  stages: StageOption[];
}) {
  const responseByQuestion = new Map(application.videoResponses.map((r: (typeof application.videoResponses)[number]) => [r.questionId, r]));
  const isSubmitted = application.status === 'SUBMITTED' || application.status === 'EVALUATED';

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-sm font-medium">{application.job.title}</p>
            <p className="text-xs text-muted-foreground">{application.interview.title}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <StatusBadge status={application.status} />
            <StageSelector
              candidateId={candidateId}
              applicationId={application.id}
              currentStageId={application.currentStage?.id ?? null}
              stages={stages}
            />
            {application.startedAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Started {formatDistanceToNow(new Date(application.startedAt), { addSuffix: true })}
              </span>
            )}
            {application.submittedAt && (
              <span>Submitted {formatDistanceToNow(new Date(application.submittedAt), { addSuffix: true })}</span>
            )}
          </div>
        </CardContent>
      </Card>

      <ResumeCard
        candidateId={candidateId}
        applicationId={application.id}
        resume={application.resume}
        recordingsEnabled={recordingsEnabled}
        aiEnabled={aiEnabled}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {application.interview.interviewType === 'ADAPTIVE_VOICE' ? 'Interview conversation' : 'Answers'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {application.interview.interviewType === 'ADAPTIVE_VOICE' ? (
            application.interviewSession && application.interviewSession.turns.length > 0 ? (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Live adaptive voice interview · {application.interviewSession.turns.length} exchanges
                  {application.interviewSession.topicsCovered.length > 0 &&
                    ` · Topics covered: ${application.interviewSession.topicsCovered.join(', ')}`}
                </p>
                {application.interviewSession.turns.map(
                  (turn: (typeof application.interviewSession.turns)[number], i: number) => (
                    <AdaptiveTurnCard key={turn.id} turn={turn} index={i} recordingsEnabled={recordingsEnabled} />
                  )
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">This candidate has not started the adaptive interview yet.</p>
            )
          ) : (
            application.interview.questions.map((question: (typeof application.interview.questions)[number], i: number) => (
              <AnswerRow
                key={question.id}
                index={i}
                questionText={question.text}
                requiredAnswerType={question.answerType}
                response={responseByQuestion.get(question.id)}
                recordingsEnabled={recordingsEnabled}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI evaluation</CardTitle>
        </CardHeader>
        <CardContent>
          {application.evaluation ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl font-semibold text-primary">
                  {formatScore(application.evaluation.overallScore)}
                </span>
                <Badge variant="secondary">AI-generated evaluation — recruiter review required</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{application.evaluation.summary}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {application.evaluation.scores.map((s: (typeof application.evaluation.scores)[number]) => (
                  <div key={s.id} className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">{s.category.replace('_', ' ')}</p>
                    <p className="text-lg font-semibold">{formatScore(s.score)}</p>
                  </div>
                ))}
              </div>
              {isSubmitted && (
                <EvaluateButton candidateId={candidateId} applicationId={application.id} />
              )}
            </div>
          ) : !isSubmitted ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" /> Evaluation is available once the candidate submits their interview.
            </p>
          ) : !aiEnabled ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" /> AI evaluation isn&apos;t configured for this environment.
            </p>
          ) : (
            <EvaluateButton candidateId={candidateId} applicationId={application.id} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function ResumeCard({
  candidateId,
  applicationId,
  resume,
  recordingsEnabled,
  aiEnabled,
}: {
  candidateId: string;
  applicationId: string;
  resume: Application['resume'];
  recordingsEnabled: boolean;
  aiEnabled: boolean;
}) {
  const viewUrl = resume?.storageKey && recordingsEnabled ? await createViewUrl(resume.storageKey) : null;
  const evaluation = resume?.resumeEvaluation ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resume</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!resume ? (
          <p className="text-sm text-muted-foreground">No resume has been uploaded for this application.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{resume.fileName}</span>
                <Badge
                  variant={resume.parseStatus === 'COMPLETED' ? 'success' : resume.parseStatus === 'FAILED' ? 'destructive' : 'secondary'}
                >
                  {resume.parseStatus === 'COMPLETED'
                    ? 'Text extracted'
                    : resume.parseStatus === 'FAILED'
                      ? 'Extraction failed'
                      : resume.parseStatus}
                </Badge>
              </div>
              {viewUrl ? (
                <a
                  href={viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <Download className="h-3.5 w-3.5" /> View / download
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {recordingsEnabled ? '' : 'Storage not configured'}
                </span>
              )}
            </div>

            {resume.parseStatus === 'FAILED' && resume.parseError && (
              <p className="text-xs text-destructive">{resume.parseError}</p>
            )}

            {evaluation ? (
              <div className="space-y-3 border-t border-border pt-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-semibold text-primary">{formatScore(evaluation.overallScore)}</span>
                  <div>
                    <Badge variant="secondary">AI-generated evaluation — recruiter review required</Badge>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">{evaluation.recommendation}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{evaluation.summary}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Skills match</p>
                    <p className="text-lg font-semibold">{formatScore(evaluation.skillsMatchScore)}</p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Experience match</p>
                    <p className="text-lg font-semibold">{formatScore(evaluation.experienceMatchScore)}</p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Job relevance</p>
                    <p className="text-lg font-semibold">{formatScore(evaluation.relevanceScore)}</p>
                  </div>
                </div>
                {evaluation.missingSkills.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Missing skills</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {evaluation.missingSkills.map((s: string) => (
                        <Badge key={s} variant="outline">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {evaluation.concerns.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Concerns</p>
                    <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                      {evaluation.concerns.map((c: string) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {aiEnabled && resume.parseStatus === 'COMPLETED' && (
                  <EvaluateButton
                    candidateId={candidateId}
                    applicationId={applicationId}
                    target="resume"
                    label="Re-run resume evaluation"
                  />
                )}
              </div>
            ) : resume.parseStatus !== 'COMPLETED' ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4" /> Resume evaluation is available once text extraction succeeds.
              </p>
            ) : !aiEnabled ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4" /> AI evaluation isn&apos;t configured for this environment.
              </p>
            ) : (
              <EvaluateButton candidateId={candidateId} applicationId={applicationId} target="resume" />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

async function AdaptiveTurnCard({
  turn,
  index,
  recordingsEnabled,
}: {
  turn: {
    id: string;
    topic: string | null;
    action: string;
    question: string;
    answerText: string | null;
    videoStorageKey: string | null;
    videoDurationSec: number | null;
    videoTranscript: string | null;
    videoTranscriptStatus: string;
  };
  index: number;
  recordingsEnabled: boolean;
}) {
  const viewUrl = turn.videoStorageKey && recordingsEnabled ? await createViewUrl(turn.videoStorageKey) : null;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Q{index + 1}</span>
        {turn.topic && <Badge variant="secondary">{turn.topic}</Badge>}
        <span className="text-xs text-muted-foreground">{turn.action.replace('_', ' ')}</span>
        {turn.videoStorageKey && (
          <Badge variant={recordingsEnabled ? 'default' : 'outline'} className="ml-auto gap-1">
            <VideoIcon className="h-3 w-3" /> Video answer
          </Badge>
        )}
      </div>
      <p className="mb-3 text-sm font-medium">{turn.question}</p>

      {turn.videoStorageKey ? (
        recordingsEnabled && viewUrl ? (
          <div className="space-y-2">
            <video src={viewUrl} controls playsInline className="w-full max-w-md rounded-md border border-border bg-black" />
            {turn.videoDurationSec != null && (
              <p className="text-xs text-muted-foreground">Duration: {turn.videoDurationSec}s</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {recordingsEnabled ? 'Recording could not be loaded.' : 'Storage not configured — recording unavailable.'}
          </p>
        )
      ) : null}

      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
        {turn.answerText || <span className="italic">No spoken transcript for this turn.</span>}
      </p>
      {turn.videoTranscript && turn.videoTranscript !== turn.answerText && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Video transcript (server-generated backup)</summary>
          <p className="mt-1 whitespace-pre-wrap">{turn.videoTranscript}</p>
        </details>
      )}
    </div>
  );
}

async function AnswerRow({
  index,
  questionText,
  requiredAnswerType,
  response,
  recordingsEnabled,
}: {
  index: number;
  questionText: string;
  requiredAnswerType: 'VIDEO' | 'TEXT';
  response: Application['videoResponses'][number] | undefined;
  recordingsEnabled: boolean;
}) {
  const viewUrl =
    response?.storageKey && recordingsEnabled ? await createViewUrl(response.storageKey) : null;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Q{index + 1}. {questionText}
        </p>
        <Badge variant={requiredAnswerType === 'VIDEO' ? 'default' : 'outline'}>
          {requiredAnswerType === 'VIDEO' ? 'Video answer' : 'Text answer'}
        </Badge>
      </div>
      {!response ? (
        <p className="text-sm text-muted-foreground">No answer submitted.</p>
      ) : response.answerType === 'TEXT' && response.answerText ? (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{response.answerText}</p>
      ) : response.storageKey ? (
        recordingsEnabled && viewUrl ? (
          <video controls className="w-full max-w-md rounded-md" src={viewUrl}>
            <track kind="captions" />
          </video>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <VideoIcon className="h-4 w-4" /> Recording unavailable — object storage isn&apos;t configured.
          </p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">No answer submitted.</p>
      )}
      {response?.storageKey && response.transcriptStatus !== 'COMPLETED' && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          {response.transcriptStatus === 'FAILED'
            ? 'Transcript unavailable — transcription failed for this recording.'
            : response.transcriptStatus === 'PROCESSING'
              ? 'Transcribing…'
              : 'Transcript not yet generated.'}
        </p>
      )}
      {response?.transcript && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {response.transcript}
        </p>
      )}
    </div>
  );
}
