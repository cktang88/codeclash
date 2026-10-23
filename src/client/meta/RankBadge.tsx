import type { RankInfo } from '../../rules/meta.ts';
import { RANKS } from '../../rules/meta.ts';
import { CarvedBar } from '../ui/codex.tsx';
import { compact } from '../ui/format.ts';

/** Rank title in roman numerals, with Glory toward the next rank. */
export function RankBadge({ rank, bar = true }: { rank: RankInfo; bar?: boolean }) {
  const floor = RANKS[rank.rank]!.glory;
  return (
    <span className="meta-rank" data-rank={rank.rank}>
      <span className="meta-rank-title rubric">{rank.title}</span>
      <span className="meta-rank-glory num">{compact(rank.glory)} Glory</span>
      {bar && rank.next !== null && (
        <CarvedBar
          kind="glory"
          value={rank.glory - floor}
          max={rank.next - floor}
          label={`Glory toward ${RANKS[rank.rank + 1]!.title}`}
          valueText={`${rank.glory} of ${rank.next}`}
        />
      )}
    </span>
  );
}
