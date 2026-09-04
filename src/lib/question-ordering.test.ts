import { describe, it, expect } from 'vitest';
import { isValidReorderPermutation, renumber } from './question-ordering';

describe('isValidReorderPermutation', () => {
  const existing = ['q1', 'q2', 'q3'];

  it('accepts a full reordering of the same ids', () => {
    expect(isValidReorderPermutation(existing, ['q3', 'q1', 'q2'])).toBe(true);
  });

  it('accepts the identity ordering', () => {
    expect(isValidReorderPermutation(existing, ['q1', 'q2', 'q3'])).toBe(true);
  });

  it('rejects a partial list missing a question', () => {
    expect(isValidReorderPermutation(existing, ['q1', 'q2'])).toBe(false);
  });

  it('rejects a list containing a foreign/unknown id', () => {
    expect(isValidReorderPermutation(existing, ['q1', 'q2', 'from-another-interview'])).toBe(false);
  });

  it('rejects a list with a duplicated id even if length matches', () => {
    expect(isValidReorderPermutation(existing, ['q1', 'q1', 'q2'])).toBe(false);
  });

  it('rejects an empty list against non-empty existing questions', () => {
    expect(isValidReorderPermutation(existing, [])).toBe(false);
  });
});

describe('renumber', () => {
  it('assigns contiguous zero-based order values matching array position', () => {
    const result = renumber([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(result).toEqual([
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
      { id: 'c', order: 2 },
    ]);
  });

  it('reflects a new order after deleting a middle item', () => {
    const afterDelete = [{ id: 'a' }, { id: 'c' }]; // 'b' removed
    const result = renumber(afterDelete);
    expect(result.map((r) => r.order)).toEqual([0, 1]);
  });

  it('returns an empty array for an empty input', () => {
    expect(renumber([])).toEqual([]);
  });
});
