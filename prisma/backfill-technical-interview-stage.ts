/**
 * Phase 5 backfill: ensures every existing organization has a
 * "Technical Interview" pipeline stage between "Shortlisted" and "Offer".
 *
 * Safe by construction:
 * - Only INSERTs a new PipelineStage row when one with this name doesn't
 *   already exist for the org (idempotent — safe to run more than once).
 * - Never deletes, renames, or reorders any existing stage (including a
 *   "Rejected" stage some orgs may already have — that stays exactly as-is).
 * - Never touches Application, CandidateStageHistory, or any other data.
 * - Uses `order` values based on each org's own existing "Shortlisted"
 *   stage, so it slots in correctly even for orgs with customized ordering.
 *
 * Run once per environment after deploying the Phase 5 schema migration:
 *   npx tsx prisma/backfill-technical-interview-stage.ts
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const orgs = await db.organization.findMany({ select: { id: true, name: true } });
  let created = 0;
  let skipped = 0;

  for (const org of orgs) {
    const existing = await db.pipelineStage.findUnique({
      where: { orgId_name: { orgId: org.id, name: 'Technical Interview' } },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const shortlisted = await db.pipelineStage.findUnique({
      where: { orgId_name: { orgId: org.id, name: 'Shortlisted' } },
    });

    // Insert one order-slot after Shortlisted (or at the end if this org
    // doesn't have a "Shortlisted" stage for some reason) without
    // renumbering anything else — later stages simply share/overlap order
    // values, which is fine since `order` is only used for display sorting,
    // not uniqueness.
    const targetOrder = shortlisted ? shortlisted.order + 1 : (await db.pipelineStage.count({ where: { orgId: org.id } }));

    await db.pipelineStage.create({
      data: { orgId: org.id, name: 'Technical Interview', order: targetOrder, isDefault: true },
    });
    created++;
    console.log(`+ Added "Technical Interview" stage to org "${org.name}"`);
  }

  console.log(`\nDone. Created ${created} stage(s), skipped ${skipped} org(s) that already had it.`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
