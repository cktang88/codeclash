/** The lost page's art: a sea chart torn off at its edge, with a dragon at the tear. */
const PAPER = 'M6.0 7.2 18.7 6.5 31.3 8.7 44.0 6.1 56.7 8.2 69.3 7.4 82.0 6.1 94.7 8.0 107.3 6.0 120.0 7.7 132.7 6.1 145.3 6.2 158.0 7.7 170.7 9.4 183.3 6.3 196.0 6.8 208.7 8.6 221.3 10.0 234.0 8.3 246.7 7.5 259.3 10.1 272.0 6.0 284.7 9.6 297.3 7.1 310.0 6.4 322.7 6.3 335.3 7.2 348.0 9.4 360.7 6.6 373.3 8.4 386.0 8.6 398.7 7.4 411.3 8.2 424.0 6.1 436.7 6.1 449.3 6.7 462.0 8.8 474.7 7.7 487.3 7.2 500.0 8.4 512.7 7.8 525.3 7.1 538.0 9.3 550.7 8.9 563.3 6.9 576.0 8.3 588.7 8.1 601.3 9.7 614.0 9.0 626.7 7.1 639.3 10.1 652.0 6.3 664.7 7.6 677.3 9.1 690.0 6.5 702.7 8.0 715.3 6.0 728.0 8.7 740.7 9.2 753.3 8.3 766.0 9.7 776.0 17.1 776.3 28.9 774.5 44.4 780.0 51.0 786.9 66.9 790.0 76.8 781.3 87.4 788.9 94.0 790.3 102.5 786.9 109.3 797.8 124.1 792.4 132.9 803.9 147.7 796.9 155.5 799.6 166.3 798.0 172.4 812.6 184.0 815.8 195.2 816.7 201.7 814.4 216.5 804.7 226.5 790.0 233.1 784.6 240.7 775.2 246.7 766.5 256.4 752.9 268.5 748.3 278.0 764.2 292.5 750.4 303.3 748.2 312.7 735.6 320.3 725.3 331.6 728.7 337.9 729.8 352.5 726.6 362.2 731.8 373.5 744.4 381.7 752.0 396.3 742.6 409.7 726.4 419.2 726.2 428.0 727.6 443.6 736.9 459.5 728.3 467.7 736.0 475.7 733.9 490.1 726.0 504.1 734.4 519.2 726.7 530.0 736.3 539.3 733.3 549.3 722.8 550.0 722.8 548.5 710.8 551.8 687.3 551.3 653.3 548.4 610.1 551.4 559.8 552.1 504.4 550.7 446.2 549.3 387.5 550.2 330.3 548.4 276.3 547.9 226.7 552.1 182.6 550.7 144.3 550.1 112.0 551.9 85.5 549.7 64.3 551.6 47.8 551.4 35.3 548.7 26.0 548.9 19.3 549.1 14.7 548.9 11.5 550.4 9.4 548.9 8.0 549.6 7.2 548.4 6.7 551.8 6.4 549.4 6.2 549.8 6.1 550.4 6.1 551.8 6.0 549.7 6.0 551.8 6.0 550.0 6.0 550.1 6.0 550.1 6.0 547.9 6.0 549.7 6.0 548.6 6.0 547.8 6.0 551.3 6.0 548.6 6.0 549.9 6.0 551.0 6.0 550.2 6.0 549.2 6.0 550.1 6.0 550.2 6.0 551.3 6.0 548.3 6.0 550.3 6.0 548.9 6.0 549.0 6.0 551.2 6.0 550.0 6.0 550.3 6.0 551.1 6.0 551.8 6.0 549.8 6.0 550.5 6.0 550.0 6.1 536.5 6.8 522.9 5.8 509.4 6.1 495.8 5.9 482.2 7.9 468.7 6.9 455.1 7.7 441.6 7.9 428.1 4.9 414.5 6.3 400.9 8.0 387.4 7.5 373.9 4.4 360.3 4.3 346.8 5.7 333.2 4.1 319.6 4.9 306.1 4.1 292.6 6.7 279.0 7.2 265.4 7.7 251.9 4.5 238.3 7.0 224.8 6.7 211.2 4.4 197.7 7.7 184.1 8.1 170.6 4.8 157.0 8.0 143.5 5.6 129.9 5.9 116.4 8.2 102.8 7.5 89.3 4.5 75.8 5.7 62.2 6.1 48.6 5.3 35.1 4.7 21.5Z';
const FIBRES = 'M702.7 8.0l3.3 0.9M728.0 8.7l2.1 0.2M753.3 8.3l3.8 -1.9M776.0 17.1l3.3 0.5M774.5 44.4l4.0 -1.7M786.9 66.9l5.9 1.2M781.3 87.4l5.9 -1.6M790.3 102.5l3.1 -1.8M797.8 124.1l5.1 -0.9M803.9 147.7l2.5 -0.3M799.6 166.3l5.6 1.3M812.6 184.0l3.0 -1.4M816.7 201.7l5.7 0.3M804.7 226.5l4.8 -1.6M784.6 240.7l2.2 0.8M766.5 256.4l3.7 -1.7M748.3 278.0l5.8 0.5M750.4 303.3l5.2 -1.7M735.6 320.3l5.4 -1.7M728.7 337.9l5.5 -0.2M726.6 362.2l3.4 0.2M744.4 381.7l5.7 -0.9M742.6 409.7l2.5 0.1M726.2 428.0l3.0 -1.6M736.9 459.5l2.6 -1.8M736.0 475.7l2.8 -0.8M726.0 504.1l3.2 1.0M726.7 530.0l3.2 0.0M733.3 549.3l2.7 -0.6M722.8 548.5l2.1 -1.0';

export function TornMap({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 900 560" aria-hidden>
      <defs>
        <filter id="tm-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="4" />
          <feColorMatrix values="0 0 0 0 .3  0 0 0 0 .22  0 0 0 0 .12  .3 0 0 0 -.1" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id="tm-tone" x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id="tm-shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#0a0c14" floodOpacity=".5" />
        </filter>
        <clipPath id="tm-paper">
          <path d={PAPER} />
        </clipPath>
        <pattern id="tm-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)">
          <path d="M0 0v6" stroke="rgba(34,24,15,.3)" strokeWidth="1.1" />
        </pattern>
        <pattern id="tm-waves" width="34" height="18" patternUnits="userSpaceOnUse">
          <path d="M2 11c4-4 9-4 13 0" fill="none" stroke="rgba(44,74,154,.38)" strokeWidth="1.2" />
        </pattern>
        <radialGradient id="tm-land" cx=".35" cy=".3" r=".9">
          <stop offset="0" stopColor="#dcd29e" />
          <stop offset=".7" stopColor="#c2b47c" />
          <stop offset="1" stopColor="#a79a64" />
        </radialGradient>
      </defs>

      <g filter="url(#tm-shadow)">
        <path d={PAPER} fill="#efe4c8" />
      </g>
      <g clipPath="url(#tm-paper)">
        {/* Sea and its swells. */}
        <rect width="900" height="560" fill="rgba(44,74,154,.09)" />
        <rect width="900" height="560" fill="url(#tm-waves)" />
        {/* Rhumb lines from the compass. */}
        <g stroke="rgba(184,50,31,.28)" strokeWidth="1">
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2;
            return <path key={i} d={`M120 430l${Math.cos(a) * 900} ${Math.sin(a) * 900}`} />;
          })}
        </g>
        {/* The known lands. */}
        <path
          d="M40 120c50-60 150-70 230-40s110 10 170 30 100 30 140 80 30 120 0 170-110 40-170 60-130 70-210 50S70 470 50 400 0 180 40 120Z"
          fill="url(#tm-land)"
          stroke="#22180f"
          strokeWidth="2.4"
        />
        <path d="M300 300c80-10 170 0 250-10 30 20 30 50 10 70-60 30-140 40-220 60" fill="url(#tm-hatch)" />
        <path d="M40 120c50-60 150-70 230-40s110 10 170 30 100 30 140 80 30 120 0 170-110 40-170 60-130 70-210 50S70 470 50 400 0 180 40 120Z" fill="url(#tm-hatch)" opacity=".35" transform="translate(6 8)" />
        {/* Mountains, hatched on their shadow side. */}
        {[
          [180, 190],
          [215, 175],
          [250, 196],
          [470, 180],
          [505, 168],
        ].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <path d="M-22 18 0-20 22 18Z" fill="#cbbd88" stroke="#22180f" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M0-20 22 18H4Z" fill="url(#tm-hatch)" />
            <path d="M-7-8 0-20 7-8 2-10-3-6Z" fill="#efe4c8" stroke="#22180f" strokeWidth="1" />
          </g>
        ))}
        {/* Forests. */}
        {[
          [120, 300],
          [150, 330],
          [110, 350],
          [360, 380],
          [395, 400],
          [520, 330],
          [500, 370],
          [545, 290],
        ].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <circle r="15" fill="#5f7a3a" stroke="#22180f" strokeWidth="1.6" />
            <circle cx="-5" cy="-5" r="6" fill="#89a052" />
            <path d="M6 4a10 10 0 0 1-12 6" fill="none" stroke="rgba(34,24,15,.4)" strokeWidth="1.2" />
          </g>
        ))}
        {/* The road you were on, running off the edge. */}
        <path d="M140 420C220 400 300 330 400 300s200-40 300-30 160 10 220 0" fill="none" stroke="#7a6640" strokeWidth="4" strokeDasharray="1 9" strokeLinecap="round" />
        {/* Your capital. */}
        <g transform="translate(130 425)">
          <ellipse cy="20" rx="30" ry="7" fill="rgba(34,24,15,.25)" />
          <path d="M-22 18V-6h7v-7h6v7h18v-7h6v7h7v24Z" fill="#b8321f" stroke="#22180f" strokeWidth="2" strokeLinejoin="round" />
          <path d="M-5 18V6a5 5 0 0 1 10 0v12" fill="#22180f" />
          <path d="M0-13v-18M0-31h16l-4 4 4 4H0" fill="#f6dc8c" stroke="#22180f" strokeWidth="1.5" />
        </g>
        {/* A wyvern guarding the unknown sea, its tail running off the torn edge. */}
        <g className="lost-dragon" transform="translate(712 196)">
          <path
            d="M-30 4C-40-24-30-52-8-78L10-90C10-70 16-60 24-54L36-68C36-50 42-42 50-38L52-36C36-28 20-12 2 14Z"
            fill="#22594d"
            stroke="#22180f"
            strokeWidth="2"
            strokeLinejoin="round"
            transform="translate(-20 -4) rotate(-8)"
          />
          <path
            d="M-95-18-78-26-70-34-66-48-61-32C-50-26-42-12-36 4-26 20-6 22 10 18 30 14 46 20 58 32 76 50 100 60 124 58L140 50 134 64 144 74 124 68C98 74 72 66 54 52 46 60 40 70 30 74L34 88 20 88 18 76C6 76-10 70-22 60L-20 73-32 74-31 62C-38 50-44 36-48 22-54 8-62-2-72-6L-92-6Z"
            fill="#2f7f6f"
            stroke="#22180f"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <path d="M-44 20C-30 40-8 50 18 52 34 54 46 52 56 46" fill="none" stroke="#22180f" strokeWidth="1.2" opacity=".5" />
          <path d="M-40 28l4-6M-30 36l4-7M-18 42l3-8M-6 46l3-8M6 48l2-8M18 50l2-8M30 50l1-8" stroke="#22180f" strokeWidth="1" opacity=".55" />
          <path d="M-56-22-50-30-48-18M-46-8-38-16-38-2M-32 6-22 0-24 12M-12 16-2 8-2 20M6 16 16 10 14 22" fill="#efe4c8" stroke="#22180f" strokeWidth="1.2" strokeLinejoin="round" />
          <path
            d="M-14 8C-22-22-8-52 12-80L30-92C30-72 36-62 44-56L56-70C56-52 62-44 70-40L72-38C56-30 40-14 22 12Z"
            fill="#3f9682"
            stroke="#22180f"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path d="M12-80 56-70M12-80 70-40M12-80 6-30" stroke="#22180f" strokeWidth="1.3" />
          <path d="M20-60l10 6M24-44l12 4M28-28l12 2" stroke="#22180f" strokeWidth="1" opacity=".45" />
          <circle cx="-74" cy="-20" r="2.6" fill="#22180f" />
          <circle cx="-73.2" cy="-20.8" r=".9" fill="#f6dc8c" />
          <path d="M-92-10-84-12" stroke="#22180f" strokeWidth="1.2" />
          <path d="M-96-14C-118-26-138-12-164-22-150-6-132 0-108-4Z" fill="#ff9a3c" stroke="#b8321f" strokeWidth="1.6" strokeLinejoin="round">
            <animate attributeName="opacity" dur="1.4s" repeatCount="indefinite" values="1;.6;1" />
          </path>
          <path d="M-104-10C-118-14-128-10-140-14" fill="none" stroke="#f6dc8c" strokeWidth="2" strokeLinecap="round" />
        </g>
        <text x="628" y="64" textAnchor="middle" transform="rotate(-4 628 64)" fontFamily="'IM Fell English', serif" fontStyle="italic" fontSize="32" fill="#22180f">
          Here be dragons
        </text>
        <text x="230" y="470" fontFamily="'IM Fell English', serif" fontStyle="italic" fontSize="18" fill="#4a3a28">
          the known lands
        </text>
        {/* A sea serpent in the margin. */}
        <g transform="translate(110 70)" fill="none" stroke="#22180f" strokeWidth="2.2" strokeLinecap="round">
          <path d="M-30 8c6-16 16-16 20 0s14 16 20 0 14-16 20 0" />
          <path d="M30 8c4-10 12-12 16-7l-5 4" />
        </g>
        {/* Age: toning at the edges, and the grain of the skin. */}
        <path d={PAPER} fill="none" stroke="#b9a477" strokeWidth="30" opacity=".55" filter="url(#tm-tone)" />
        <path d={PAPER} fill="#000" filter="url(#tm-grain)" />
      </g>
      {/* The torn edge: fibres and a pale core. */}
      <path d={PAPER} fill="none" stroke="#b9a477" strokeWidth="1.2" />
      <path d={FIBRES} stroke="#f7efd9" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M18 18H708M18 18V542M18 542H690" fill="none" stroke="#22180f" strokeWidth="2" />
      <path d="M26 26H702M26 26V534M26 534H684" fill="none" stroke="#22180f" strokeWidth=".8" />
    </svg>
  );
}
