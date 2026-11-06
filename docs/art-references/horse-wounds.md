# Horse wounds: arrows, horses and unhorsed riders (battle v17, `HORSE`)

What the sim models in `src/game/battle.ts` (`HORSE`, `horseHit`, `dismount`, `afootAct`,
`afootMove`) and why. A short reading of the history, not a survey.

## What the sources say

- **Crécy (1346).** The Genoese crossbowmen were shot to pieces and the French horse charged
  through them, uphill, into the English archers' fire, some fifteen times. The chroniclers
  (Froissart; the *Grandes Chroniques*) put the damage on the horses: wounded horses reared,
  turned and bolted into the charges behind them, and riders went down in heaps where the
  horses fell. Knights unhorsed in the press were killed on the ground by Welsh and Cornish
  foot with knives. Afterwards French men-at-arms fought dismounted for some fifty years.
  Sources: [warhistory.org, Battle of Crécy](https://warhistory.org/2015/12/26/battle-of-crecy-august-26-1346/),
  [history.com, Battle of Crécy](https://history.com/topics/british-history/battle-of-crecy),
  [Simple Wikipedia, Battle of Crécy](https://simple.wikipedia.com/wiki/Battle_of_Cr%C3%A9cy).
- **Agincourt (1415).** The mounted wings (some 800-1,200 horse) charged the archers on the
  flanks, behind their stakes. The archers shot the horses; the survivors that reached the stakes
  were impaled or turned back, and riderless or maddened horses ran back through the French
  dismounted men-at-arms advancing over ploughed mud, breaking their order. Downed men-at-arms
  in plate were killed by archers with mallets, hatchets and daggers through the visor and the
  armpit. Sources: [Country Life, a day in the life of an English archer](https://www.countrylife.co.uk/out-and-about/bring-me-my-bow-of-burning-gold-a-day-in-the-life-of-an-english-archer-167183),
  [richardjgarfunkel.com, The Battle of Agincourt](https://www.richardjgarfunkel.com/2016/12/22/the-battle-of-agincourt-the-triumph-of-the-long-bow-10-25-15/).
- **Arrow against armour.** Tests and models disagree, but agree on the shape: a bodkin from a
  heavy war bow gets through mail and padding at short range, and at best barely through good
  plate, and much less as the range opens (Bane 2006, Jones 2014; Magier et al. 2017; plate tests
  with dents at 80 m, punctures only at 20-30 m). The man in good armour was hard to kill with
  arrows; his horse, largely unprotected (barding, where it existed, was mostly a peytral and a
  chanfron at the front), was not. Source: [Wikipedia, Bodkin point](https://en.wikipedia.org/wiki/Bodkin_point).
- **Hastings (1066).** The Norman horse failed against the shield wall and its axes; horses were
  cut down, and William had three horses killed under him (William of Poitiers). Spears and axes
  go for the horse.
- **Horse archers.** Mongol and Japanese accounts (and the Byzantine *Strategikon*) say the same
  from the other side: the shooter aims at the horse, the big target, and a rider whose horse is
  shot is out of the fight or on foot. Foot archers outshot horse archers, who could not stand
  still and had smaller bows.

## What the sim takes from it

| Effect | Where | Numbers |
|---|---|---|
| A missile that strikes a rider strikes his horse | `missileHit` | 72% (`HORSE.share`); not stones |
| Barding turns some of it, less from the side | `horseHit`, UnitStats `barding` | knights 30 (hatamoto 9), half from the side |
| The bodkin at short range | `missileHit` | bows: +0.3 pierce at 160 u (30 m) and nearer, none past 460 u (85 m); rider or horse |
| A wounded horse slows and loses the charge | `horseHit` | pace down to 0.55 as it nears death; impetus x0.75 a hit |
| It may bolt and throw him | `horseHit` | 0.1 + 0.4 x its wound share, x1.4 at the charge; the dead's horses x0.15 |
| Horse down: the rider is on foot, hurt and dazed | `dismount` | 6-16% of his hit points (twice at the gallop); 1.5-3.5 s, +1 s at the gallop, +1.5 s for a knight in plate |
| Dazed on the ground, daggers find the gaps | `strike` | his defence x0.4, armour x0.35 |
| The fallen horse checks the riders behind | `dismount` | half their impetus; a quarter stumble (0.6 s) |
| Spears go for the horse; a pike wall impales it | `strike`, `impact` | 35% of a spear's landed blows; 45 x the charge's force |
| On foot | `footOf` | knights pace 17 (a man in plate in mud), light horse 24, horse archers 25; attack x0.75, defence x0.8, damage x0.8, sword (reach 1.6), no lance, no bow |
| Then | `afootAct`, `afootMove` | fights his mates' fight within 45 while above 40% of his hit points; else falls in with our nearest foot within 700 (`fallIn`), else back to the general or our rear |

The renderer draws an unhorsed rider (`Soldier.dismounted`) with his faction's foot sprite for
now: a knight as its heavy foot, a lancer as its spearman, a horse archer as its archer
(`src/client/render/scene.ts`, `AFOOT`). A proper unhorsed-rider look (and a dead horse left on
the field) is still to draw from references.

## Round 2: archers kill knights

### Rate of fire

- The commonly cited burst rate of a skilled war-bowman is 10-12 aimed arrows a minute, but it
  can't be kept up for long; about 5-6 a minute can be kept up for ten minutes (Hardy, *Longbow*,
  1976, "confidently allow" ten a minute; modern warbow archers). Sources:
  [Tastes of History, "archers shooting twelve arrows a minute"](https://www.tastesofhistory.co.uk/post/dispelling-some-myths-archers-shooting-twelve-arrows-a-minute),
  [archeryhistorian.com, English longbow](https://archeryhistorian.com/english-longbow/),
  [Society of Archer-Antiquaries forum](https://soa.org.uk/sm/index.php?msg=82117),
  [Ethnographic Arms & Armour forum (Hardy quoted)](https://id33158.securedata.net/svaerd/vb/showthread.php?p=142807).
  Archers carried 60-72 arrows, three to six minutes at the full rate. A claim of 20 aimed a minute
  appears only in a forum post and isn't used.
- The sim already had volleys every 7.5 s (8 a minute, kept up) and at will every 5 s (12 a
  minute, `BOW_BURST`). At horse coming on inside about 100 m nothing needs ranging: the man
  draws, looses straight at the mass of horses and draws again. The sim uses 4 s (15 a minute,
  `RAPID.reload`), for the minute or so a charge takes. Inside about 50 m the bows shoot flat
  (`RAPID.flat`) at the horses' chests. Only the horse's pace across the line of the shot scatters
  it: a rider coming straight on rides onto the arrow.

### Knights dead, not just unhorsed

- **Falls.** Falling with a horse at the gallop killed and maimed: the rider was pinned under it,
  or ridden over by those behind (the heaps at Crécy). `crush`: 40% of falls at the gallop, a
  further 30-90% of his hit points. A rider coming on behind rides into the fallen horse, and his
  own may go down (`trip`).
- **The fallen finished.** At Crécy the Welsh and Cornish knifemen went out among the fallen; at
  Agincourt the archers did the same with mallets, hatchets and daggers. In the sim, foot with no
  foe go out to an enemy rider unhorsed within 100 (about 19 m) while he is down, badly hurt or
  running, two at most to a man (`fallen`). A man down, or caught running on foot, is struck
  through the gaps of his harness (armour x0.35). One lying dazed is shot through them (armour
  x0.6, no shield).
- **Plate on foot.** It is slow going (pace 17, running at 0.8 of that) and winded (defence a
  further x0.85). A mounted knight in good order keeps his full armour against arrows on his body
  (only the bodkin at short range helps).

### Charges that break

- To a block of horse a rider unhorsed is a rider lost (`lossShare`). The block loses heart as
  its horses go down, and a charge that has lost heart shocks the foot it reaches half as much
  (`waverShock`). Other foot then go for its horses (`footShare`), so a handful of wavering
  riders is pulled down rather than routing a large block of bows.
- A horse brought down heartens the men who shot it (counted as a kill for their spirits).
- Bows met in the flank (they shoot no faster there) or locked with foot are still ridden down.

## Measured (scripts/duel.ts, seeds 1-6)

See the v17 changelog bullet at the top of `battle.ts` for the numbers before and after.
