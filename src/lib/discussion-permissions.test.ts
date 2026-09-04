import { describe, it, expect } from 'vitest';
import { canModifyDiscussionItem } from './discussion-permissions';

describe('canModifyDiscussionItem (notes & comments authorization)', () => {
  it('allows the author to modify their own item', () => {
    expect(canModifyDiscussionItem({ authorId: 'user-1', currentUserId: 'user-1', role: 'RECRUITER' })).toBe(true);
  });

  it('denies a different recruiter from modifying someone else\u2019s item', () => {
    expect(canModifyDiscussionItem({ authorId: 'user-1', currentUserId: 'user-2', role: 'RECRUITER' })).toBe(false);
  });

  it('allows an org ADMIN to modify any item for moderation', () => {
    expect(canModifyDiscussionItem({ authorId: 'user-1', currentUserId: 'user-2', role: 'ADMIN' })).toBe(true);
  });

  it('allows an org OWNER to modify any item', () => {
    expect(canModifyDiscussionItem({ authorId: 'user-1', currentUserId: 'user-2', role: 'OWNER' })).toBe(true);
  });

  it('denies a VIEWER who is not the author, even though they can read', () => {
    expect(canModifyDiscussionItem({ authorId: 'user-1', currentUserId: 'user-2', role: 'VIEWER' })).toBe(false);
  });
});
