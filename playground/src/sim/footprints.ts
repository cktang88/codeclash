// Collision radii in metres, measured from each model's posed body (playground /footprint.html: half
// the narrower side of its ground-plane bounding box over its idle, walk and attack clips, weapons
// left out so a spear can cross a shield). Kept as plain data so the simulation needs no models;
// re-measure when a unit's model or scale changes.
export const FOOTPRINTS: Record<string, number> = {
  'kaykit-knight': 0.54,
  'kaykit-champion': 0.63,
  'kaykit-barbarian': 0.52,
  'kaykit-ranger': 0.48,
  'kaykit-mage': 0.62,
  'kaykit-rogue': 0.67,
  'kaykit-skeleton': 0.66,
  'kaykit-skeleton-mage': 0.59,
  'kaykit-minion': 0.65,
  'own-troll': 1.37,
  'own-golem': 1.28,
  'quat-warrior': 0.6,
  'quat-ranger': 0.52,
  'quat-cleric': 0.45,
  'quat-wizard': 0.65,
  'quat-rogue': 0.58,
  'quat-dragon': 2.3,
  'quat-bat': 0.68,
  'quat-skeleton': 0.48,
  'kevin-footman': 0.46,
  'kevin-warden': 0.73,
  'kevin-mercenary': 0.52,
  'kevin-sapper': 0.53,
  'kevin-berserker': 0.52,
  'kevin-champion': 0.6,
};
