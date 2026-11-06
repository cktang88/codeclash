# Regimental standards by faction (HD)

Battle screenshots (HD, seed 1, 1,200 men, zoom 2 and 4) showed every army's standards as the same
cloth: a swallowtailed flag quartered by a cross. A samurai regiment's flag looked like a Templar
one, and over a block of samurai with sashimono in the army colour it vanished. Total War tells its
armies apart by the shape of the banner before its colour. References (in `references/banners/`,
study only, none committed):

| Image | Licence | What was taken |
|---|---|---|
| Total War: Warhammer, Steam store screenshot [`4`](https://store.steampowered.com/app/364360/) (Vampire Counts against Greenskins) | (c) SEGA, reference only | Each faction's unit banner has its own shape: the dead hang dark cloths from a crossbar, cut to a ragged point, one pale-red emblem; the greenskins hang yellow rags. Readable from far above by silhouette alone. |
| Medieval II: Total War, Steam store screenshot `0000000841` ([store](https://store.steampowered.com/app/4700/)) | (c) SEGA, reference only | European regiments fly long pennons from the pole, one bold device on the field. |
| [Met 53912, Banner (Nobori)](https://images.metmuseum.org/CRDImages/as/web-large/1999_247_6_d1.jpg) ([page](https://www.metmuseum.org/art/collection/search/53912)) | CC0 | The nobori: a tall narrow cloth tied down the pole along one edge and held out at its head by a crossbar; pale cloth, a dark mon. |
| [Met 23877, Standard Banner (Sashimono)](https://images.metmuseum.org/CRDImages/aa/web-large/36.25.2847_001_March2015.jpg) ([page](https://www.metmuseum.org/art/collection/search/23877)) | CC0 | A flag in a strong colour with one large mark, reinforced corners: a samurai cloth reads by one big device. |
| [Met 44853, The Rebellions of the Hōgen and Heiji Eras (screens)](https://images.metmuseum.org/CRDImages/as/web-large/DP-27157-001.jpg) ([page](https://www.metmuseum.org/art/collection/search/44853)) | CC0 | Seen from above and far, the armies are marked by tall white banners over the crowd. |
| [Met 361653, Queen, from Hollar's Dance of Death](https://images.metmuseum.org/CRDImages/dp/web-large/DP822837.jpg) ([page](https://www.metmuseum.org/art/collection/search/361653)) | CC0 | The dead in rags: hanging cloth, frayed hems, the skull the one pale shape. |

What changed (`src/client/render/standards-hd.ts`; the classic art's `fx.ts` banners are unchanged):

- **Templar**: the swallowtailed pennon stays, with a cross pattée (arms flaring to their ends,
  clear of the edges) instead of a cross quartering the cloth; the Marshal flies the Beauséant,
  sable over argent, with its fringe.
- **Samurai**: the nobori, a tall cloth down the pole from a crossbar. A regiment's is paper white
  with the army colour in a band at its head and a large mon in the army colour (it stands out of
  the sea of sashimono); the lord's is his dark cloth with a gilt mon.
- **Undead**: a gonfalon hung from a crossbar, the army colour dulled and darkened, cut to a point
  and always tattered (more when wavering), a pale skull on it with dark sockets.

The image size, pole position and anchors are unchanged; hanging cloths stay above row 9, where
the morale pips sit. Rounds: (1) the three shapes; the samurai nobori in the army colour disappeared
among the sashimono at zoom 4; (2) the regimental nobori paper white with an army-colour band and
mon: it stands out; (3) the nobori's and gonfalon's feet raised off the morale pips' box.
