import { FACTION_IDS, FACTIONS, type FactionId } from '../../game/factions.ts';
import { ART_LABEL, useArtMode } from './useArtMode.ts';
import { ART_MODES, parseArt } from '../settings.ts';

// Small pickers shared by the showcase's tabs (pages/Demo.tsx).

/** A faction picker with a "random" choice ('' in the select). */
export function FactionSelect(props: { value: FactionId | null; onChange: (f: FactionId | null) => void; label: string; random?: boolean }) {
  return (
    <label className="inline">
      <span>{props.label}</span>
      <select value={props.value ?? ''} onChange={(e) => props.onChange((e.target.value || null) as FactionId | null)}>
        {props.random !== false && <option value="">Random</option>}
        {FACTION_IDS.map((f) => (
          <option key={f} value={f}>{FACTIONS[f].name}</option>
        ))}
      </select>
    </label>
  );
}

export function ArtSelect() {
  const [art, setArt] = useArtMode();
  return (
    <label className="inline">
      <span>Art</span>
      <select value={art} onChange={(e) => setArt(parseArt(e.target.value))}>
        {ART_MODES.map((m) => (
          <option key={m} value={m}>{ART_LABEL[m]}</option>
        ))}
      </select>
    </label>
  );
}
