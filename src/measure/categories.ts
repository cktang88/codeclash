/** Line categories, in the order they appear in a push's `lines` tuple. */
export const Cat = {
  Code: 0,
  Test: 1,
  Comment: 2,
  Docs: 3,
  Config: 4,
  Removed: 5,
  Generated: 6,
  Vendor: 7,
  Blank: 8,
} as const;
export type Cat = (typeof Cat)[keyof typeof Cat];
export const CAT_COUNT = 9;
export const CAT_NAMES = ['code', 'test', 'comment', 'docs', 'config', 'removed', 'generated', 'vendor', 'blank'] as const;
