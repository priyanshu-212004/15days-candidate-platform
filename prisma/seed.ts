import { PrismaClient, ScoreCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

const FIRST_NAMES = [
  'Amara', 'Rohan', 'Elena', 'Marcus', 'Priya', 'Diego', 'Sofia', 'Kwame', 'Yuki', 'Fatima',
  'Liam', 'Noor', 'Carlos', 'Mei', 'Aisha', 'Tomas', 'Ingrid', 'Kenji', 'Zainab', 'Oliver',
  'Isabela', 'Dmitri',
];
const LAST_NAMES = [
  'Chen', 'Mehta', 'Vasquez', 'Reyes', 'Sharma', 'Alvarez', 'Rossi', 'Boateng', 'Tanaka', 'Hassan',
  'Murphy', 'Khalil', 'Silva', 'Wong', 'Bello', 'Novak', 'Larsen', 'Sato', 'Ahmed', 'Bennett',
  'Souza', 'Ivanov',
];

const JOBS = [
  {
    title: 'Senior Software Engineer',
    description:
      'We are looking for a senior software engineer to help design and scale our core platform services, mentoring mid-level engineers along the way.',
    requirements: ['5+ years backend experience', 'Distributed systems', 'PostgreSQL', 'TypeScript'],
    skills: ['TypeScript', 'PostgreSQL', 'AWS', 'System design'],
    experienceLevel: 'Senior',
    location: 'Remote',
    remote: true,
  },
  {
    title: 'Product Designer',
    description:
      'Own end-to-end product design for our recruiter and candidate experiences, from research through polished, shipped UI.',
    requirements: ['4+ years product design', 'Portfolio required', 'Figma fluency'],
    skills: ['Figma', 'Design systems', 'User research'],
    experienceLevel: 'Mid-Senior',
    location: 'New York, NY',
    remote: false,
  },
  {
    title: 'Product Manager',
    description:
      'Drive the roadmap for our AI evaluation engine, working closely with engineering, design, and customer-facing teams.',
    requirements: ['3+ years PM experience', 'B2B SaaS background'],
    skills: ['Roadmapping', 'SQL', 'Stakeholder management'],
    experienceLevel: 'Mid',
    location: 'Remote',
    remote: true,
  },
  {
    title: 'Marketing Manager',
    description: 'Lead demand generation and content strategy to grow our recruiter user base globally.',
    requirements: ['3+ years B2B marketing', 'Content strategy'],
    skills: ['SEO', 'Content strategy', 'Analytics'],
    experienceLevel: 'Mid',
    location: 'Remote',
    remote: true,
  },
];

const QUESTION_BANK = [
  { text: 'Walk me through a technically challenging project you shipped recently.', type: 'TECHNICAL', category: 'Experience', difficulty: 'MEDIUM' },
  { text: 'How would you approach designing a system that needs to scale 10x in the next year?', type: 'TECHNICAL', category: 'System design', difficulty: 'HARD' },
  { text: 'Tell me about a time you disagreed with a teammate. How did you resolve it?', type: 'BEHAVIORAL', category: 'Collaboration', difficulty: 'EASY' },
  { text: 'What would you prioritize in your first 30 days in this role?', type: 'SITUATIONAL', category: 'Role fit', difficulty: 'MEDIUM' },
  { text: 'Describe a time you had to give difficult feedback to a peer or manager.', type: 'CULTURE_FIT', category: 'Communication', difficulty: 'MEDIUM' },
  { text: 'What does success look like for you in this position after six months?', type: 'SITUATIONAL', category: 'Role fit', difficulty: 'EASY' },
] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function randomScore(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

async function main() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash('Demo1234', 12);
  const owner = await db.user.upsert({
    where: { email: 'demo@acme.test' },
    update: {},
    create: { name: 'Jordan Reyes', email: 'demo@acme.test', passwordHash },
  });

  const org = await db.organization.upsert({
    where: { slug: 'acme-technologies' },
    update: {},
    create: { name: 'Acme Technologies', slug: 'acme-technologies' },
  });

  await db.organizationMember.upsert({
    where: { userId_orgId: { userId: owner.id, orgId: org.id } },
    update: {},
    create: { userId: owner.id, orgId: org.id, role: 'OWNER' },
  });

  // Phase 5: exact stage set/order specified by the ATS pipeline design.
  // PipelineStage rows are per-org data, not a hardcoded enum, so any org
  // can still add back a "Rejected" (or other custom) stage later without a
  // code change — this seed only controls what brand-new orgs start with.
  const stageNames = ['Applied', 'Screening', 'Interview', 'Shortlisted', 'Technical Interview', 'Offer', 'Hired'];
  const stages: Record<string, string> = {};
  for (const [i, name] of stageNames.entries()) {
    const stage = await db.pipelineStage.upsert({
      where: { orgId_name: { orgId: org.id, name } },
      update: {},
      create: { orgId: org.id, name, order: i, isDefault: true },
    });
    stages[name] = stage.id;
  }

  for (const jobData of JOBS) {
    const job = await db.job.create({
      data: { ...jobData, orgId: org.id, status: 'OPEN', createdById: owner.id },
    });

    const interview = await db.interview.create({
      data: {
        orgId: org.id,
        jobId: job.id,
        title: `${job.title} — Async Interview`,
        status: 'ACTIVE',
        createdById: owner.id,
        languages: ['en', 'es', 'fr'],
      },
    });

    const shuffledQuestions = [...QUESTION_BANK].sort(() => Math.random() - 0.5).slice(0, 5);
    const questions = [];
    for (const [i, q] of shuffledQuestions.entries()) {
      questions.push(
        await db.interviewQuestion.create({
          data: {
            interviewId: interview.id,
            text: q.text,
            type: q.type as any,
            category: q.category,
            difficulty: q.difficulty as any,
            order: i,
            evaluationCriteria: ['Clarity', 'Depth', 'Relevance'],
          },
        })
      );
    }

    const candidateCount = 6;
    for (let i = 0; i < candidateCount; i++) {
      const firstName = pick(FIRST_NAMES);
      const lastName = pick(LAST_NAMES);
      const name = `${firstName} ${lastName}`;
      const email = `${firstName}.${lastName}.${job.title.replace(/\s+/g, '')}${i}@example.test`.toLowerCase();

      const candidate = await db.candidate.upsert({
        where: { orgId_email: { orgId: org.id, email } },
        update: {},
        create: { orgId: org.id, name, email, preferredLanguage: pick(['en', 'es', 'fr']) },
      });

      const stageWeights = ['Applied', 'Screening', 'Interview', 'Shortlisted', 'Technical Interview', 'Offer', 'Hired'];
      const stageName = pick(stageWeights);

      const application = await db.application.create({
        data: {
          orgId: org.id,
          candidateId: candidate.id,
          jobId: job.id,
          interviewId: interview.id,
          status: 'EVALUATED',
          currentStageId: stages[stageName],
          submittedAt: new Date(Date.now() - Math.floor(Math.random() * 20) * 86400000),
        },
      });

      await db.candidateStageHistory.create({
        data: { applicationId: application.id, stageId: stages[stageName]!, movedById: owner.id },
      });

      for (const q of questions) {
        await db.videoResponse.create({
          data: {
            applicationId: application.id,
            questionId: q.id,
            storageKey: `demo/${application.id}/${q.id}.webm`,
            durationSec: 60 + Math.floor(Math.random() * 90),
            transcript:
              'This is placeholder seed data representing a transcribed candidate response for demo purposes.',
            transcriptStatus: 'COMPLETED',
          },
        });
      }

      const technical = randomScore(5, 10);
      const communication = randomScore(5, 10);
      const roleFit = randomScore(5, 10);
      const confidence = randomScore(5, 10);
      const overall = Math.round(((technical + communication + roleFit + confidence) / 4) * 10) / 10;

      const evaluation = await db.evaluation.create({
        data: {
          applicationId: application.id,
          overallScore: overall,
          summary: `${name} demonstrated solid fundamentals for the ${job.title} role, with particular strength in role fit and communication.`,
          strengths: ['Clear communication', 'Structured problem solving'],
          concerns: overall < 7 ? ['Limited depth on system design follow-ups'] : [],
          modelName: 'demo-seed',
          modelVersion: '1.0.0',
          promptVersion: '1.0.0',
          status: 'COMPLETED',
        },
      });

      const scoreMap: [ScoreCategory, number][] = [
        ['TECHNICAL', technical],
        ['COMMUNICATION', communication],
        ['ROLE_FIT', roleFit],
        ['CONFIDENCE', confidence],
      ];
      for (const [category, score] of scoreMap) {
        await db.evaluationScore.create({
          data: { evaluationId: evaluation.id, category, score },
        });
      }
    }
  }

  console.log('Seed complete.');
  console.log('Demo login: demo@acme.test / Demo1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
