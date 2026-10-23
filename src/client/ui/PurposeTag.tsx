import { PURPOSE_LABEL, type Purpose } from '../../sim/api.ts';

/** A small pill naming what a push was for. Plain work gets no tag. */
export function PurposeTag({ purpose }: { purpose: Purpose | undefined }) {
  if (!purpose || purpose === 'work') return null;
  return <span className={`purpose-tag p-${purpose}`}>{PURPOSE_LABEL[purpose]}</span>;
}
