import { z } from 'zod';

export const stageChangeSchema = z.object({
  stageId: z.string().uuid('Choose a valid pipeline stage'),
  note: z.string().trim().max(500).optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
});
export type StageChangeInput = z.infer<typeof stageChangeSchema>;

// Freeform text only — no HTML is ever accepted or rendered as markup for
// notes/comments, so there's no injection surface even though the length
// allows for reasonably long write-ups.
export const noteBodySchema = z.object({
  body: z.string().trim().min(1, 'Note cannot be empty').max(4000, 'Note is too long'),
});
export type NoteBodyInput = z.infer<typeof noteBodySchema>;

export const commentBodySchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(2000, 'Comment is too long'),
});
export type CommentBodyInput = z.infer<typeof commentBodySchema>;
