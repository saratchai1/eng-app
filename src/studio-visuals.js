let drawingId = 0;

/** Original vector section for the studio overview; illustrative, not a construction detail. */
export function studioDrawing() {
  const id = `studio-section-${++drawingId}`;
  return `<svg class="studio-drawing" viewBox="0 0 680 460" role="img" aria-labelledby="${id}-title ${id}-desc" xmlns="http://www.w3.org/2000/svg">
    <title id="${id}-title">Engineering section — กำแพงกันดินและระดับน้ำ</title>
    <desc id="${id}-desc">ภาพหน้าตัดแนวคิดแสดงผนัง ฐาน ดินถม น้ำใต้ดิน และทิศทางแรง พร้อมเส้นบอกขนาด เป็นภาพสื่อสารแนวคิด ไม่ใช่แบบก่อสร้าง</desc>
    <defs>
      <pattern id="${id}-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#a5bfbd" stroke-opacity=".07" stroke-width=".7"/></pattern>
      <pattern id="${id}-soil" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(25)"><path d="M0 0V13" stroke="#b69d81" stroke-opacity=".18" stroke-width="1"/></pattern>
      <pattern id="${id}-concrete" width="17" height="17" patternUnits="userSpaceOnUse"><path d="m3 6 3-2 2 3z M12 14l2-3 2 3z" fill="none" stroke="#74908e" stroke-width=".65"/><circle cx="12" cy="3" r=".7" fill="#74908e"/></pattern>
      <linearGradient id="${id}-water" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#52c2b1" stop-opacity=".06"/><stop offset="1" stop-color="#52c2b1" stop-opacity=".2"/></linearGradient>
      <linearGradient id="${id}-ground" x1="0" x2="1"><stop stop-color="#b89b79" stop-opacity=".04"/><stop offset="1" stop-color="#b89b79" stop-opacity=".13"/></linearGradient>
      <marker id="${id}-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="m1 1 5 3-5 3" fill="none" stroke="#65c8b7" stroke-width="1.2"/></marker>
      <marker id="${id}-dimension" viewBox="0 0 6 8" refX="3" refY="4" markerWidth="5" markerHeight="7" orient="auto-start-reverse"><path d="m1 7 4-6" stroke="#799494" stroke-width="1"/></marker>
    </defs>
    <rect width="680" height="460" fill="url(#${id}-grid)"/>
    <g fill="none" stroke="#607d80" stroke-width="1" opacity=".45"><path d="M24 42V24h18M638 24h18v18M24 418v18h18M638 436h18v-18"/><path d="M330 24h20M340 14v20M330 436h20M340 426v20"/></g>
    <g font-family="'IBM Plex Mono',Consolas,monospace" font-size="9" letter-spacing="1.8" fill="#9cb1b4"><text x="42" y="51">SECTION A—A</text><text x="638" y="51" text-anchor="end">DESIGN EXPLORER</text></g>
    <path d="M296 116H572V327H296Z" fill="url(#${id}-ground)"/>
    <path d="M296 116H572V327H296Z" fill="url(#${id}-soil)"/>
    <path d="M77 327H572V375H77Z" fill="#283c43"/>
    <path d="M77 327H572V375H77Z" fill="url(#${id}-soil)"/>
    <path d="M296 237H572V327H296Z" fill="url(#${id}-water)"/>
    <path d="M296 116H572M77 327H160M467 327H572" stroke="#c1b198" stroke-width="1.7" fill="none"/>
    <g stroke="#baa58c" opacity=".65"><path d="m310 116 5-5m14 5 5-5m14 5 5-5m14 5 5-5m14 5 5-5m14 5 5-5m14 5 5-5m14 5 5-5m14 5 5-5m14 5 5-5m14 5 5-5m14 5 5-5m14 5 5-5"/></g>
    <path d="M160 327V297H258V105H296V297H467V327Z" fill="#314b54" stroke="#b5c8c4" stroke-width="1.8"/>
    <path d="M160 327V297H258V105H296V297H467V327Z" fill="url(#${id}-concrete)"/>
    <path d="M167 319H459M267 111V307H453" fill="none" stroke="#77a3a2" stroke-width="1.1" stroke-dasharray="3 4"/>
    <path d="M303 237H573" stroke="#63c7b6" stroke-width="1.25" stroke-dasharray="7 5"/>
    <path d="m532 229 7 8 7-8z" fill="#72cdbd"/>
    <g stroke="#65c8b7" stroke-width="1.25" fill="none" marker-end="url(#${id}-arrow)"><path d="M346 92V111M382 92V111M418 92V111M454 92V111M490 92V111"/><path d="M330 156H301M349 193H301M369 230H301M389 267H301"/><path d="M209 359V331M262 359V331M315 359V331M368 359V331M421 359V331"/></g>
    <path d="M307 136 395 278H307" fill="#67c3b1" fill-opacity=".05" stroke="#67c3b1" stroke-width=".9" stroke-dasharray="4 4"/>
    <g fill="none" stroke="#799494" stroke-width=".85"><path d="M137 327H108M250 105H108M121 105V327"/><path d="M160 341V392M467 341V392M160 382H467"/><path d="M195 297V281M251 297V281M195 287H251"/></g>
    <g fill="none" stroke="#799494" stroke-width=".85" marker-start="url(#${id}-dimension)" marker-end="url(#${id}-dimension)"><path d="M121 107V325M162 382H465"/></g>
    <g font-family="'IBM Plex Mono',Consolas,monospace" font-size="10" fill="#abc2c0"><text x="108" y="222" text-anchor="middle" transform="rotate(-90 108 222)">H + BASE</text><text x="313" y="400" text-anchor="middle">BASE WIDTH · B</text><text x="223" y="279" text-anchor="middle" font-size="8">TOE</text></g>
    <g stroke="#8ca3a5" stroke-width=".8" fill="none"><path d="M464 155h90l25-17h42"/><path d="M486 253h72l21 17h42"/><path d="M432 354h126l21 17h42"/></g>
    <g font-family="'IBM Plex Mono',Consolas,monospace" font-size="9" fill="#adbfbd" letter-spacing=".4"><text x="620" y="131" text-anchor="end">EARTH PRESSURE</text><text x="620" y="284" text-anchor="end" fill="#76cbbb">GROUNDWATER</text><text x="620" y="386" text-anchor="end">BASE REACTION</text><text x="418" y="80" text-anchor="middle" fill="#76cbbb">SURCHARGE ↓</text></g>
    <g fill="#71c6b6"><circle cx="464" cy="155" r="2"/><circle cx="486" cy="253" r="2"/><circle cx="432" cy="354" r="2"/></g>
    <g font-family="'IBM Plex Mono',Consolas,monospace" font-size="8" letter-spacing="1.1"><text x="42" y="422" fill="#789397">CONCEPT SECTION · NOT TO SCALE</text><text x="638" y="422" text-anchor="end" fill="#73c8b7">INPUT → ANALYSIS → REVIEW</text></g>
  </svg>`;
}
