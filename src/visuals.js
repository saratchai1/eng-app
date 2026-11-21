import {escapeHTML as e} from './utils.js';
const paths={
 grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 folder:'M3 6h6l2 2h10v12H3z M3 6V4h6l2 2',
 star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
 calculator:'M5 2h14v20H5z M8 5h8v4H8z M8 13h1 M15 13h1 M8 17h1 M15 17h1',
 chart:'M4 3v18h17 M8 17v-5 M13 17V7 M18 17V4',
 ruler:'m4 18 14-14 4 4L8 22z M8 14l2 2 M12 10l2 2 M16 6l2 2',
 layers:'m12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5',
 book:'M12 5C8 2 3 3 2 4v16c3-2 7-1 10 1 3-2 7-3 10-1V4c-3-2-7-1-10 1z M12 5v16',
 plus:'M12 5v14 M5 12h14',
 close:'m6 6 12 12 M6 18 18 6',
 check:'m5 12 4 4L19 6',
 save:'M5 3h12l4 4v14H3V3z M7 3v6h9V3 M7 21v-8h10v8',
 download:'M12 3v12 m-5-5 5 5 5-5 M4 17v4h16v-4',
 upload:'M12 16V4 m-5 5 5-5 5 5 M4 17v4h16v-4',
 print:'M6 8V2h12v6 M6 18H3V9h18v9h-3 M6 14h12v8H6z M17 11h1',
 back:'M19 12H5 m6-6-6 6 6 6',
 info:'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
 clock:'M12 7v5l4 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
 chevron:'m6 9 6 6 6-6',
 menu:'M4 6h16 M4 12h16 M4 18h16',
 file:'M14 2H4v20h16V8z M14 2v6h6 M8 13h8 M8 17h5',
 reset:'M3 10a9 9 0 1 1 1 8 M3 3v7h7',
 external:'M14 3h7v7 M21 3 10 14 M10 3H3v18h18v-7',
 pin:'m14 3 7 7-4 1-4 4-1 4-7-7 4-1 4-4z M4 20l5-5',
 shield:'m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z m-4 10 3 3 5-6'
};
export const icon=(name,extra='')=>`<svg class="icon ${e(extra)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;

export function sketch(type,label='ภาพร่างประกอบ') {
 const common=`<defs><pattern id="dot-${e(type)}" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="currentColor" opacity=".13"/></pattern></defs><rect width="320" height="180" fill="url(#dot-${e(type)})"/>`;
 const drawings={
 wall:`<path d="M35 142h255 M96 40h17v88h70v14H62v-14h34z" fill="currentColor" fill-opacity=".12"/><path d="M96 40h17v88h70v14H62v-14h34z M114 48h164 M114 67h140 M114 87h120 M114 108h100"/><path class="accent-stroke" d="M199 55h-55m8-5-8 5 8 5 M187 78h-43m8-5-8 5 8 5 M172 101h-28m8-5-8 5 8 5"/><path d="M40 40v88m-4-88h8m-8 88h8 M62 160h121m-121-4v8m121-8v8" stroke-width="1"/><text x="25" y="88">H</text><text x="121" y="176">B</text><text x="231" y="38">q</text>`,
 beam:`<path d="m50 85 65-38h152v50l-65 39H50z" fill="currentColor" fill-opacity=".06"/><path d="M50 85h152v51H50z M202 85l65-38v50l-65 39 M50 85l65-38h152 M65 100h121v23H65z"/><path class="accent-stroke" d="M71 115h112 M71 110v10 M92 110v10 M114 110v10 M136 110v10 M158 110v10 M180 110v10 M183 115l68-39"/><path d="M32 85v51m-4-51h8m-8 51h8 M50 154h152m-152-4v8m152-8v8" stroke-width="1"/><text x="16" y="115">h</text><text x="120" y="172">b</text>`,
 slab:`<path d="m45 105 82-64h147v18l-82 65H45z" fill="currentColor" fill-opacity=".07"/><path d="m45 105 82-64h147l-82 64z M45 105v19h147v-19 M192 124l82-65V41"/><path class="accent-stroke" d="m65 103 75-59 m-50 60 75-59 m-50 60 75-59 m-50 60 75-59 m-50 60 75-59 M71 85h144 M92 67h144"/><text x="88" y="158">STRIP = 1.00 m</text>`,
 footing:`<path d="M120 37h70v68h58v25H67v-25h53z" fill="currentColor" fill-opacity=".08"/><path d="M120 37h70v68h58v25H67v-25h53z M45 136h230 M156 13v31m-5-7 5 7 5-7"/><path class="accent-stroke" d="M69 158v-17m-4 5 4-5 4 5 M104 158v-17m-4 5 4-5 4 5 M140 158v-17m-4 5 4-5 4 5 M176 158v-17m-4 5 4-5 4 5 M212 158v-17m-4 5 4-5 4 5 M248 158v-17m-4 5 4-5 4 5"/><text x="169" y="24">N</text><text x="261" y="151">q</text>`,
 building:`<path d="m67 75 86-41 99 35v66l-88 28-97-30z" fill="currentColor" fill-opacity=".06"/><path d="m67 75 86-41 99 35-88 40z M67 75v58l97 30 88-28V69 M164 109v54 M110 54v93 M210 51v97 M67 104l97 33 88-35 M153 34v60"/><path class="accent-stroke" d="M75 126v-17 M155 152v-16 M174 151v-17 M241 129v-17"/>`,
 warehouse:`<path d="m51 92 56-42 106 0 57 42v56H51z" fill="currentColor" fill-opacity=".06"/><path d="m51 92 56-42 106 0 57 42H51v56h219V92 M77 92v56 M118 92v56 M160 92v56 M202 92v56 M244 92v56 M77 92l83-40 84 40 M77 92l41 56 M118 92l42 56 M160 92l42 56 M202 92l42 56"/><path class="accent-stroke" d="M51 159h219 M51 155v8 M270 155v8"/>`,
 road:`<path d="m38 122 53-67h141l53 67z" fill="currentColor" fill-opacity=".08"/><path d="m38 122 53-67h141l53 67z M38 122v15h247v-15 M47 113h229 M56 101h210 M66 88h189"/><path class="accent-stroke" d="M160 55v12m0 8v12m0 8v17"/><text x="111" y="159">ROAD SECTION</text>`,
 canal:`<path d="M33 56h57l42 78h58l42-78h55 M33 67h49l42 79h74l42-79h47"/><path d="m112 96 20 38h58l20-38z" fill="#52b8d1" fill-opacity=".24"/><path class="accent-stroke" d="M111 96h98"/><path d="M133 161h56m-56-4v8m56-8v8 M57 69v66m-4-66h8m-8 66h8" stroke-width="1"/><text x="155" y="177">b</text><text x="39" y="105">d</text><text x="250" y="103">z:1</text>`,
 shoring:`<path d="M44 42h232v15H44z M70 57v85 M136 57v85 M188 57v85 M252 57v85 M70 72h66 M188 72h64 M70 119h66 M188 119h64 M70 72l66 47 M136 72l-66 47 M188 72l64 47 M252 72l-64 47 M57 145h92 M175 145h90"/><path class="accent-stroke" d="M84 15v22m-5-5 5 5 5-5 M160 15v22m-5-5 5 5 5-5 M235 15v22m-5-5 5 5 5-5"/>`,
 plan:`<path d="M63 33h197v113H63z M67 37h189v105H67z M144 37v41 M144 102v40 M67 95h45 M133 95h123 M203 95v47 M67 37l45 58 M112 95a28 28 0 0 1 21-27 M144 78a24 24 0 0 1 24 24"/><path class="accent-stroke" d="M51 23h220 M51 20v6 M271 20v6 M46 33v113 M43 33h6 M43 146h6"/><text x="127" y="166">FLOOR PLAN</text>`,
 gantt:`<path d="M55 38h215 M55 66h215 M55 94h215 M55 122h215 M55 150h215 M55 38v112 M98 38v112 M141 38v112 M184 38v112 M227 38v112" stroke-opacity=".2"/><rect x="57" y="44" width="83" height="14" rx="3" fill="currentColor" fill-opacity=".7"/><rect x="100" y="72" width="83" height="14" rx="3" fill="currentColor" fill-opacity=".5"/><rect class="accent-fill" x="143" y="100" width="83" height="14" rx="3"/><rect x="186" y="128" width="81" height="14" rx="3" fill="currentColor" fill-opacity=".3"/><path class="accent-stroke" d="M204 28v132" stroke-dasharray="4 4"/>`,
 trend:`<path d="M50 30v117h225 M50 110h225 M50 73h225 M50 36h225" stroke-opacity=".2"/><path d="m56 131 35-28 35 12 35-38 35 9 35-42 34-14" stroke-width="3" class="accent-stroke"/><path d="m56 131 35-28 35 12 35-38 35 9 35-42 34-14v117H56z" fill="currentColor" fill-opacity=".05"/><text x="113" y="171">Σ wᵢ × Iᵢ / I₀</text>`,
 house:`<path d="m69 87 82-56 85 56 M82 79v70h141V79 M133 149v-47h36v47 M95 92h25v23H95z M182 92h25v23h-25z"/><circle cx="235" cy="129" r="26" fill="var(--art-bg,#edf5f1)"/><circle cx="235" cy="129" r="26"/><path class="accent-stroke" d="m222 129 9 9 17-19" stroke-width="3"/>`,
 boq:`<rect x="67" y="24" width="185" height="133" rx="5" fill="white" fill-opacity=".7"/><path d="M67 24h185v133H67z M67 54h185 M67 81h185 M67 108h185 M67 135h185 M155 54v103 M205 54v103 M83 40h69"/><path class="accent-stroke" d="M83 68h42 M83 94h55 M83 121h35 M216 143h24" stroke-width="3"/><text x="169" y="72">m³</text><text x="168" y="100">kg</text>`,
 prices:`<path d="M54 138h216 M76 130V79h39v51 M139 130V53h39v77 M202 130V34h39v96" fill="currentColor" fill-opacity=".08"/><path class="accent-stroke" d="m80 64 59-26 59 9 43-28"/><text x="85" y="111">฿</text><text x="150" y="90">฿</text><text x="214" y="72">฿</text>`,
 guide:`<path d="M64 40c36-14 61-10 94 5 33-15 58-19 94-5v103c-36-14-61-10-94 5-33-15-58-19-94-5z M158 45v103 M83 59l53 7 M83 80l53 7 M83 101l37 5 M180 66l53-7 M180 87l53-7"/><path class="accent-stroke" d="M180 112h45" stroke-width="3"/>`,
 quiz:`<rect x="86" y="28" width="149" height="128" rx="7"/><path d="M119 51h85 M119 76h85 M137 101h67 M137 128h48"/><path class="accent-stroke" d="m102 99 7 7 12-14 M102 125h16v13h-16z"/>`
 };
 return `<svg class="sketch" viewBox="0 0 320 180" role="img" aria-label="${e(label)}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">${common}<g>${drawings[type] || drawings.boq}</g></svg>`;
}
