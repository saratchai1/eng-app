/**
 * Independent, transparent screening models. SI units are stated at every input.
 * These are intentionally bounded calculations, not an engineering certification.
 */

const WATER = 9.81;
const STEEL_E = 200000;
const format = (value, digits = 2) => Number.isFinite(value)
  ? value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })
  : 'นอกขอบเขตแบบจำลอง';
const field = (key, label, unit, value, min, max, step = 'any') =>
  ({ key, label, unit, default: value, min, max, step });

const sources = {
  wall: { label: 'USACE EM 1110-2-2502 (2022) — earth / water pressures', url: 'https://www.publications.usace.army.mil/Portals/76/Users/182/86/2486/EM%201110-2-2502.pdf?JMIwQ0zD=0N5Sl' },
  contact: { label: 'FHWA — eccentricity and base contact pressure', url: 'https://www.fhwa.dot.gov/publications/research/infrastructure/bridge/14094/004.cfm' },
  flexure: { label: 'FHWA — rectangular section flexural resistance', url: 'https://www.fhwa.dot.gov/bridge/lrfd/pscus04.cfm' },
  strain: { label: 'Caltrans BDP 5.4 — stress block / strain compatibility', url: 'https://dot.ca.gov/-/media/dot-media/programs/engineering/documents/bridge-design-practices/202210bdpchapter54precastpretensionedboxgirdera11y.pdf' },
  aci: { label: 'ACI — tension-controlled strain limit', url: 'https://www.concrete.org/publications/getarticle.aspx?m=icap&pubID=51740277' },
};

const wallGroups = [
  { title: 'รูปทรงกำแพง · คิดต่อความยาว 1 เมตร', fields: [
    field('height', 'ความสูงดินเหนือหลังฐาน H', 'm', 3, 0.3, 15),
    field('width', 'ความกว้างฐาน B', 'm', 2.6, 0.3, 20),
    field('toe', 'ความยาวฐานด้านหน้า', 'm', 0.65, 0, 15),
    field('stem', 'ความหนาผนังคงที่', 'm', 0.3, 0.1, 3),
    field('base', 'ความหนาฐาน', 'm', 0.4, 0.1, 3),
    field('concreteWeight', 'หน่วยน้ำหนักคอนกรีต', 'kN/m³', 24, 15, 30),
  ] },
  { title: 'ดินและแรงด้านข้าง', fields: [
    field('phi', 'มุมเสียดทานภายในดิน φ', '°', 30, 10, 45),
    field('gammaDry', 'หน่วยน้ำหนักดินเหนือระดับน้ำ', 'kN/m³', 18, 10, 24),
    field('gammaSat', 'หน่วยน้ำหนักดินอิ่มน้ำ', 'kN/m³', 20, 12, 26),
    field('surcharge', 'น้ำหนักแผ่บนดิน q', 'kPa', 10, 0, 200),
    field('waterHeight', 'ความสูงน้ำหลังผนังจากใต้ฐาน', 'm', 0, 0, 18),
    field('friction', 'สัมประสิทธิ์เสียดทานใต้ฐาน μ', '', 0.5, 0.05, 1),
    field('allowable', 'หน่วยแรงดินยอมให้แบบ gross', 'kPa', 150, 1, 3000),
  ] },
  { title: 'แรงยกใต้ฐานและเกณฑ์คัดกรอง', fields: [
    field('upliftToe', 'เฮดน้ำใต้ฐานที่ปลาย toe', 'm', 0, 0, 30),
    field('upliftHeel', 'เฮดน้ำใต้ฐานที่ปลาย heel', 'm', 0, 0, 30),
    field('slidingTarget', 'FS เลื่อนที่ต้องการ', '', 1.5, 1, 5),
    field('overturnTarget', 'FS พลิกที่ต้องการ', '', 2, 1, 5),
  ] },
];

const beamGroups = [
  { title: 'หน้าตัดและวัสดุ', fields: [
    field('b', 'ความกว้างหน้าตัด b', 'mm', 300, 80, 3000),
    field('d', 'ความลึกประสิทธิผล d', 'mm', 500, 50, 2500),
    field('fc', 'กำลังอัดคอนกรีต f′c', 'MPa', 28, 17, 28),
    field('fy', 'กำลังครากเหล็ก fy', 'MPa', 400, 200, 600),
  ] },
  { title: 'เหล็กดึงและแรงออกแบบ', fields: [
    field('diameter', 'เส้นผ่านศูนย์กลางเหล็กดึง', 'mm', 20, 6, 40),
    field('count', 'จำนวนเหล็กดึง', 'เส้น', 4, 1, 24, 1),
    field('mu', 'โมเมนต์ประลัยที่ต้องการ Mu', 'kN·m', 150, 0, 100000),
  ] },
];

const slabGroups = [
  { title: 'พื้นทางเดียว · แถบกว้าง 1 เมตร', fields: [
    field('d', 'ความลึกประสิทธิผล d', 'mm', 120, 50, 500),
    field('fc', 'กำลังอัดคอนกรีต f′c', 'MPa', 28, 17, 28),
    field('fy', 'กำลังครากเหล็ก fy', 'MPa', 400, 200, 600),
    field('diameter', 'เส้นผ่านศูนย์กลางเหล็ก', 'mm', 10, 6, 32),
    field('spacing', 'ระยะเรียงเหล็ก', 'mm', 150, 25, 500),
    field('mu', 'โมเมนต์ประลัยต่อความกว้าง 1 m', 'kN·m/m', 12, 0, 10000),
  ] },
];

const footingGroups = [
  { title: 'ฐานรากและแรงใช้งานที่ระดับใต้ฐาน', fields: [
    field('width', 'ด้านฐานที่รับการเยื้องศูนย์ B', 'm', 2, 0.2, 30),
    field('length', 'ด้านตั้งฉาก L', 'm', 2, 0.2, 30),
    field('normal', 'แรงกดรวม N', 'kN', 600, 0.01, 1000000),
    field('moment', 'โมเมนต์รอบกึ่งกลางฐาน M', 'kN·m', 80, -1000000, 1000000),
    field('allowable', 'หน่วยแรงดินยอมให้แบบ gross', 'kPa', 250, 1, 5000),
  ] },
];

const shoringGroups = [
  { title: 'ภาระงานเทคอนกรีตพื้น', fields: [
    field('thickness', 'ความหนาคอนกรีตเปียก', 'm', 0.2, 0.03, 2),
    field('concreteWeight', 'หน่วยน้ำหนักคอนกรีต', 'kN/m³', 24, 15, 30),
    field('formLoad', 'น้ำหนักแบบและอุปกรณ์', 'kPa', 0.5, 0, 20),
    field('liveLoad', 'ภาระก่อสร้างแผ่สม่ำเสมอ', 'kPa', 2.5, 0, 30),
    field('amplification', 'ตัวคูณเผื่อภาระก่อสร้าง', '', 1.2, 1, 3),
  ] },
  { title: 'พื้นที่รับน้ำหนักของเฟรม', fields: [
    field('gridX', 'ช่วงรับน้ำหนักต่อเฟรม X', 'm', 1.2, 0.2, 5),
    field('gridY', 'ช่วงรับน้ำหนักต่อเฟรม Y', 'm', 1.2, 0.2, 5),
    field('capacity', 'WLL ต่อเฟรมจากใบรับรอง', 'kN', 40, 0.1, 500),
    field('reuse', 'ตัวคูณลด WLL ตามสภาพ', '', 0.8, 0.1, 1),
    field('legs', 'จำนวนขารับแรงเท่ากันต่อเฟรม', 'ขา', 4, 2, 8, 1),
  ] },
  { title: 'แผ่นรองฐานต่อขา', fields: [
    field('padX', 'ความกว้างแผ่นรอง', 'm', 0.3, 0.05, 2),
    field('padY', 'ความยาวแผ่นรอง', 'm', 0.3, 0.05, 2),
    field('allowable', 'หน่วยแรงรองรับยอมให้', 'kPa', 100, 1, 5000),
  ] },
];

function readInputs(groups, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('รูปแบบข้อมูลนำเข้าไม่ถูกต้อง');
  const result = {};
  for (const group of groups) {
    for (const f of group.fields) {
      const v = input[f.key] === undefined ? f.default : input[f.key];
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${f.label}: กรุณากรอกตัวเลขที่ถูกต้อง`);
      if (v < f.min || v > f.max) throw new Error(`${f.label}: ค่าต้องอยู่ระหว่าง ${f.min} ถึง ${f.max} ${f.unit}`);
      if (f.step === 1 && !Number.isInteger(v)) throw new Error(`${f.label}: ต้องเป็นจำนวนเต็ม`);
      result[f.key] = v;
    }
  }
  return result;
}

/** Rigid rectangular footing, no soil tension, uniaxial moment. */
export function bearingContact(normal, moment, width, length) {
  for (const v of [normal, moment, width, length]) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('แรงและมิติฐานรากต้องเป็นตัวเลขที่มีค่าจำกัด');
  }
  if (width <= 0 || length <= 0) throw new Error('มิติฐานรากต้องมากกว่าศูนย์');
  if (normal <= 0) return { stable: false, regime: 'uplift', eccentricity: null, qmax: null, qmin: null, contactWidth: 0, direction: 0 };
  const e = Math.abs(moment) / normal;
  const direction = Math.sign(moment);
  if (e >= width / 2) return { stable: false, regime: 'outside', eccentricity: e, qmax: null, qmin: null, contactWidth: 0, direction };
  if (e <= width / 6 + Number.EPSILON * width * 8) {
    const average = normal / (width * length);
    return { stable: true, regime: 'full', eccentricity: e, qmax: average * (1 + 6 * e / width), qmin: Math.max(0, average * (1 - 6 * e / width)), contactWidth: width, direction };
  }
  const contactWidth = 3 * (width / 2 - e);
  return { stable: true, regime: 'partial', eccentricity: e, qmax: 2 * normal / (contactWidth * length), qmin: 0, contactWidth, direction };
}

export function retainingWallModel(input = {}) {
  const p = readInputs(wallGroups, input);
  const { height: H, width: B, toe, stem, base, phi, gammaDry, gammaSat, surcharge, waterHeight: hw } = p;
  const heel = B - toe - stem;
  if (heel <= 1e-9) throw new Error('ฐานต้องกว้างกว่าผลรวมความยาว toe และความหนาผนัง เพื่อให้มีฐานด้าน heel');
  const pressureHeight = H + base;
  if (hw > pressureHeight) throw new Error('ระดับน้ำหลังผนังต้องไม่สูงกว่าระดับดิน H + ความหนาฐาน');
  if (gammaSat < gammaDry) throw new Error('หน่วยน้ำหนักดินอิ่มน้ำต้องไม่น้อยกว่าดินเหนือระดับน้ำ');
  const ka = (1 - Math.sin(phi * Math.PI / 180)) / (1 + Math.sin(phi * Math.PI / 180));
  const gammaSub = gammaSat - WATER;
  const soilForce = ka / 2 * (gammaDry * pressureHeight ** 2 + (gammaSub - gammaDry) * hw ** 2);
  const soilMomentBottom = ka / 6 * (gammaDry * pressureHeight ** 3 + (gammaSub - gammaDry) * hw ** 3);
  const surchargeForce = ka * surcharge * pressureHeight;
  const surchargeMomentBottom = surchargeForce * pressureHeight / 2;
  const waterForce = WATER * hw ** 2 / 2;
  const waterMomentBottom = waterForce * hw / 3;
  const lateral = soilForce + surchargeForce + waterForce;
  const horizontalMoment = soilMomentBottom + surchargeMomentBottom + waterMomentBottom;
  const baseWeight = p.concreteWeight * B * base;
  const stemWeight = p.concreteWeight * stem * H;
  const soilWaterHeight = Math.max(0, hw - base);
  const soilWeight = heel * (gammaDry * (H - soilWaterHeight) + gammaSat * soilWaterHeight);
  const weight = baseWeight + stemWeight + soilWeight;
  const weightMoment = baseWeight * B / 2 + stemWeight * (toe + stem / 2) + soilWeight * (toe + stem + heel / 2);
  const headSum = p.upliftToe + p.upliftHeel;
  const uplift = WATER * B * headSum / 2;
  const upliftX = headSum === 0 ? B / 2 : B * (p.upliftToe + 2 * p.upliftHeel) / (3 * headSum);
  const upliftMoment = uplift * upliftX;
  const normal = weight - uplift;
  const overturnMoment = horizontalMoment + upliftMoment;
  const sliding = normal > 0 ? p.friction * normal / lateral : 0;
  const overturning = weightMoment / overturnMoment;
  const resultantX = normal > 0 ? (weightMoment - overturnMoment) / normal : null;
  const signedE = resultantX === null ? null : B / 2 - resultantX;
  const contact = normal > 0 ? bearingContact(normal, normal * signedE, B, 1) : bearingContact(normal, 0, B, 1);
  return { ...p, heel, ka, gammaSub, pressureHeight, soilWaterHeight, soilForce, surchargeForce, waterForce, lateral, soilMomentBottom, surchargeMomentBottom, waterMomentBottom, horizontalMoment, baseWeight, stemWeight, soilWeight, weight, weightMoment, uplift, upliftX, upliftMoment, normal, overturnMoment, sliding, overturning, resultantX, signedE, contact };
}

function wallResult(input) {
  const v = retainingWallModel(input);
  const pressureOK = v.contact.stable && v.contact.qmax <= v.allowable;
  return {
    summary: [
      { label: 'FS การเลื่อน', value: v.sliding, unit: '', tone: v.sliding >= v.slidingTarget ? 'ok' : 'warn' },
      { label: 'FS การพลิก', value: v.overturning, unit: '', tone: v.overturning >= v.overturnTarget ? 'ok' : 'warn' },
      { label: 'แรงดันดินสูงสุด qmax', value: v.contact.qmax ?? 'เสียเสถียรภาพ', unit: v.contact.stable ? 'kPa' : '', tone: pressureOK ? 'ok' : 'warn' },
      { label: 'แรงด้านข้างรวม', value: v.lateral, unit: 'kN/m', tone: 'neutral' },
    ],
    checks: [
      { label: 'แรงกดสุทธิใต้ฐานเป็นบวก', pass: v.normal > 0, detail: `N = W − U = ${format(v.normal)} kN/m` },
      { label: 'การเลื่อนตามเกณฑ์ที่กรอก', pass: v.sliding >= v.slidingTarget, detail: `${format(v.sliding)} ≥ ${format(v.slidingTarget)}` },
      { label: 'การพลิกตามเกณฑ์ที่กรอก', pass: v.overturning >= v.overturnTarget, detail: `${format(v.overturning)} ≥ ${format(v.overturnTarget)}` },
      { label: 'ผลลัพธ์แรงอยู่ภายในฐาน', pass: v.contact.stable, detail: v.resultantX === null ? 'แรงยกมากกว่าหรือเท่ากับน้ำหนักกด' : `x จากปลาย toe = ${format(v.resultantX)} m; ต้องอยู่ใน 0 < x < ${format(v.width)} m` },
      { label: 'สัมผัสดินเต็มฐาน', pass: v.contact.stable && v.contact.regime === 'full', detail: v.contact.stable ? `e = ${format(v.contact.eccentricity, 3)} m; B/6 = ${format(v.width / 6, 3)} m` : 'ไม่มีสมดุลแบบรับแรงอัดอย่างเดียว' },
      { label: 'หน่วยแรงดินไม่เกินค่าที่กรอก', pass: pressureOK, detail: v.contact.stable ? `${format(v.contact.qmax)} ≤ ${format(v.allowable)} kPa (gross)` : 'ไม่ประเมิน qmax เมื่อเสียเสถียรภาพ' },
    ],
    steps: [
      { title: 'สัมประสิทธิ์แรงดันดิน Rankine', formula: 'Ka = (1 − sin φ) / (1 + sin φ)', substitution: `φ = ${v.phi}°`, result: `Ka = ${format(v.ka, 4)}` },
      { title: 'แรงดันดินประสิทธิผลและ surcharge ถึงใต้ฐาน', formula: 'D = H + tbase; Ps = Ka/2 [γd D² + (γsat − γw − γd) hw²]; Pq = Ka q D', result: `D = ${format(v.pressureHeight)} m; Ps = ${format(v.soilForce)}; Pq = ${format(v.surchargeForce)} kN/m` },
      { title: 'แรงดันน้ำแยกจากแรงดันดิน', formula: 'Pw = γw hw²/2; P = Ps + Pq + Pw', result: `Pw = ${format(v.waterForce)}; P = ${format(v.lateral)} kN/m` },
      { title: 'โมเมนต์แรงด้านข้างรอบปลาย toe ใต้ฐาน', formula: 'Mh = Ka/6 [γd D³ + (γsat − γw − γd) hw³] + Pq D/2 + Pw hw/3', result: `Mh = ${format(v.horizontalMoment)} kN·m/m` },
      { title: 'น้ำหนักกดและแรงยก', formula: 'W = Wbase + Wstem + Wsoil; U = γw B (hToe + hHeel)/2; N = W − U', result: `W = ${format(v.weight)}; U = ${format(v.uplift)}; N = ${format(v.normal)} kN/m` },
      { title: 'เสถียรภาพและตำแหน่งแรงลัพธ์', formula: 'FSslide = μN/P; FSoverturn = MW/(Mh + MU); x = (MW − Mh − MU)/N', result: `FSslide = ${format(v.sliding)}; FSoverturn = ${format(v.overturning)}; x = ${v.resultantX === null ? 'ไม่มี' : format(v.resultantX) + ' m'}` },
      { title: 'การกระจายแรงใต้ฐาน', formula: v.contact.regime === 'full' ? 'qmax,min = N/B (1 ± 6e/B)' : 'เมื่อ B/6 < e < B/2: a = 3(B/2 − e); qmax = 2N/a; qmin = 0', result: v.contact.stable ? `qmax = ${format(v.contact.qmax)}; qmin = ${format(v.contact.qmin)} kPa; ช่วงสัมผัส = ${format(v.contact.contactWidth)} m` : 'ไม่พบสมดุลรับแรงอัดภายในฐาน' },
    ],
    notes: [
      'คิดต่อความยาวกำแพง 1 m; แรงด้านข้างกระทำบนระนาบหลัง heel ตั้งแต่ระดับดินถึงใต้ฐาน รวมส่วนด้านข้างฐานด้วย',
      'H วัดเหนือหลังฐาน แต่ hw วัดจากใต้ฐาน; น้ำหนักดินบน heel ใช้ความสูงอิ่มน้ำ max(0, hw − tbase) และหัก uplift แยก',
      'เฮดน้ำใต้ฐานเป็นค่ากรอกอิสระ ต้องกำหนดจากสภาพการระบายน้ำจริง; ค่าเริ่มต้น 0 ไม่ใช่ข้อยืนยันว่าไม่มี uplift',
      'ละเลยแรง passive หน้า toe และละเลยผลดีของน้ำหนัก surcharge บน heel; รวม surcharge เป็นแรงด้านข้าง',
      'FS เป็นอัตราส่วนแบบ conventional screening ตามเกณฑ์ที่กรอก ไม่ใช่วิธีตรวจรับรองตาม USACE',
      'ยังไม่ตรวจเหล็กผนัง/ฐาน แรงเฉือน การทรุดตัว เสถียรภาพรวม การไหลซึม หรือแผ่นดินไหว',
    ],
    diagram: { type: 'retaining-wall', ...v }, values: v,
    table: { headers: ['แรงแนวดิ่ง', 'kN/m'], rows: [['คอนกรีตฐาน', format(v.baseWeight)], ['คอนกรีตผนัง', format(v.stemWeight)], ['ดินเหนือ heel', format(v.soilWeight)], ['แรงยกใต้ฐาน (หักออก)', format(v.uplift)]] },
  };
}

export function rectangularFlexure({ b, d, fc, fy, steelArea, mu }) {
  if (![b, d, fc, fy, steelArea, mu].every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error('ข้อมูลหน้าตัดต้องเป็นตัวเลขที่ถูกต้อง');
  if (b <= 0 || d <= 0 || steelArea <= 0 || fc < 17 || fc > 28 || fy < 200 || fy > 600 || mu < 0) throw new Error('ข้อมูลหน้าตัดอยู่นอกขอบเขตแบบจำลอง');
  const beta = 0.85;
  const a = steelArea * fy / (0.85 * fc * b);
  const c = a / beta;
  const strain = 0.003 * (d - c) / c;
  const strainLimit = Math.max(0.005, fy / STEEL_E + 0.003);
  const tensionControlled = strain >= strainLimit;
  const nominalMoment = tensionControlled ? steelArea * fy * (d - a / 2) / 1e6 : null;
  const phi = tensionControlled ? 0.9 : null;
  const capacity = tensionControlled ? phi * nominalMoment : null;
  const utilization = tensionControlled ? mu / capacity : null;
  return { b, d, fc, fy, steelArea, mu, beta, a, c, strain, strainLimit, tensionControlled, nominalMoment, phi, capacity, utilization };
}

export function beamModel(input = {}) {
  const p = readInputs(beamGroups, input);
  return { ...p, ...rectangularFlexure({ ...p, steelArea: p.count * Math.PI * p.diameter ** 2 / 4 }) };
}

export function slabModel(input = {}) {
  const p = readInputs(slabGroups, input);
  if (p.spacing <= p.diameter) throw new Error('ระยะเรียงเหล็กต้องมากกว่าเส้นผ่านศูนย์กลางเหล็ก');
  return { ...p, ...rectangularFlexure({ ...p, b: 1000, steelArea: 1000 / p.spacing * Math.PI * p.diameter ** 2 / 4 }) };
}

function flexureResult(v, isSlab = false) {
  const perWidth = isSlab ? '/m' : '';
  return {
    summary: [
      { label: 'กำลังดัด φMn', value: v.capacity ?? 'นอกขอบเขต', unit: v.capacity === null ? '' : `kN·m${perWidth}`, tone: v.capacity !== null && v.capacity >= v.mu ? 'ok' : 'warn' },
      { label: 'โมเมนต์ที่ต้องการ Mu', value: v.mu, unit: `kN·m${perWidth}`, tone: 'neutral' },
      { label: 'เหล็กดึง As', value: v.steelArea, unit: `mm²${perWidth}`, digits: 0 },
      { label: 'อัตราส่วน Mu / φMn', value: v.utilization === null ? 'ประเมินไม่ได้' : v.utilization * 100, unit: v.utilization === null ? '' : '%', tone: v.utilization !== null && v.utilization <= 1 ? 'ok' : 'warn' },
    ],
    checks: [
      { label: 'หน้าตัดอยู่ในช่วง tension controlled', pass: v.tensionControlled, detail: `εt = ${format(v.strain, 5)}; เกณฑ์ ≥ ${format(v.strainLimit, 5)}` },
      { label: 'กำลังดัดเพียงพอเฉพาะแบบจำลองนี้', pass: v.capacity === null ? null : v.capacity >= v.mu, detail: v.capacity === null ? 'ไม่คำนวณ φMn เมื่ออยู่นอกช่วงที่รองรับ' : `φMn = ${format(v.capacity)} ≥ Mu = ${format(v.mu)} kN·m${perWidth}` },
    ],
    steps: [
      { title: 'พื้นที่เหล็กดึง', formula: isSlab ? 'As = (1000 / s) × πdb²/4' : 'As = n × πdb²/4', result: `As = ${format(v.steelArea)} mm²${perWidth}` },
      { title: 'แรงอัดสมมูล', formula: 'a = As fy / (0.85 f′c b); β1 = 0.85; c = a/β1', result: `a = ${format(v.a)} mm; c = ${format(v.c)} mm` },
      { title: 'ความเครียดเหล็กดึง', formula: 'εt = 0.003 (d − c)/c; εlimit = max(0.005, fy/200000 + 0.003)', result: `εt = ${format(v.strain, 6)}; εlimit = ${format(v.strainLimit, 6)}` },
      { title: 'กำลังต้านทานโมเมนต์', formula: 'Mn = As fy (d − a/2) × 10⁻⁶; φ = 0.90 เฉพาะ tension controlled', result: v.capacity === null ? 'นอกขอบเขต: ห้ามใช้สมการเหล็กครากนี้รายงานกำลังรับโมเมนต์' : `Mn = ${format(v.nominalMoment)}; φMn = ${format(v.capacity)} kN·m${perWidth}` },
    ],
    notes: [
      `แบบจำลองหน้าตัดสี่เหลี่ยม เหล็กดึงด้านเดียว${isSlab ? ' ต่อความกว้าง 1 m' : ''}; กรอก d ถึงจุดศูนย์กลางเหล็กดึง`,
      'ขอบเขต f′c 17–28 MPa ใช้ β1 = 0.85; ใช้กำลังเหล็ก fy ได้เฉพาะเมื่อผ่านการตรวจความเครียด',
      'Mu ต้องเป็นโมเมนต์ประลัยที่ได้จากการวิเคราะห์และชุดแรงที่เลือกอย่างเหมาะสม; โปรแกรมนี้ไม่จัดชุดแรงให้',
      'ยังไม่ตรวจ As ขั้นต่ำ/ขั้นสูงตามมาตรฐาน รายละเอียดเหล็ก ระยะหุ้ม ระยะเรียง การยึดเหนี่ยว แรงเฉือน การโก่งตัว หรือรอยร้าว',
      'ผลผ่านหมายถึงกำลังดัดในแบบจำลองนี้เท่านั้น ไม่ใช่ผ่านการออกแบบครบทุกข้อกำหนด',
    ],
    diagram: { type: isSlab ? 'rc-slab' : 'rc-beam', ...v }, values: v,
  };
}

export function footingModel(input = {}) {
  const p = readInputs(footingGroups, input);
  return { ...p, ...bearingContact(p.normal, p.moment, p.width, p.length) };
}

function footingResult(input) {
  const v = footingModel(input);
  return {
    summary: [
      { label: 'หน่วยแรงสูงสุด qmax', value: v.qmax ?? 'เสียเสถียรภาพ', unit: v.stable ? 'kPa' : '', tone: v.stable && v.qmax <= v.allowable ? 'ok' : 'warn' },
      { label: 'หน่วยแรงต่ำสุด qmin', value: v.qmin ?? '—', unit: v.stable ? 'kPa' : '' },
      { label: 'ระยะเยื้องศูนย์ |e|', value: v.eccentricity, unit: 'm', digits: 3 },
      { label: 'ความกว้างที่สัมผัสดิน', value: v.contactWidth, unit: 'm', tone: v.regime === 'full' ? 'ok' : 'warn' },
    ],
    checks: [
      { label: 'แรงลัพธ์อยู่ภายในฐาน', pass: v.stable, detail: `e = ${format(v.eccentricity, 3)} m; ต้อง e < B/2 = ${format(v.width / 2, 3)} m` },
      { label: 'สัมผัสเต็มฐานโดยไม่มีแรงดึง', pass: v.regime === 'full', detail: v.regime === 'partial' ? 'มีการแยกจากดินบางส่วน ใช้แรงดันสามเหลี่ยมในบริเวณรับแรงอัด' : v.stable ? 'e ≤ B/6' : 'ไม่พบสมดุลแบบรับแรงอัดอย่างเดียว' },
      { label: 'หน่วยแรงสูงสุดไม่เกินค่าที่กรอก', pass: v.stable && v.qmax <= v.allowable, detail: v.stable ? `${format(v.qmax)} ≤ ${format(v.allowable)} kPa (gross)` : 'ไม่ตรวจหน่วยแรงหลังเสียเสถียรภาพ' },
    ],
    steps: [
      { title: 'การเยื้องศูนย์ของแรงรวม', formula: 'e = |M| / N', result: `e = ${format(v.eccentricity, 4)} m` },
      { title: 'เลือกสภาพสัมผัสฐาน', formula: 'เต็มฐาน: e ≤ B/6; บางส่วน: B/6 < e < B/2; เสียเสถียรภาพ: e ≥ B/2', result: v.regime === 'full' ? 'สัมผัสเต็มฐาน' : v.regime === 'partial' ? 'สัมผัสบางส่วน' : 'เสียเสถียรภาพ' },
      { title: 'คำนวณแรงดันรองรับ', formula: v.regime === 'full' ? 'qmax,min = N/(BL) × (1 ± 6e/B)' : 'a = 3(B/2 − e); qmax = 2N/(aL); qmin = 0', result: v.stable ? `qmax = ${format(v.qmax)}; qmin = ${format(v.qmin)} kPa` : 'ไม่มีแรงกดภายในฐานที่รักษาสมดุลได้' },
    ],
    notes: [
      'ฐานแข็งและการเยื้องศูนย์แกนเดียว ดินรับแรงอัดเท่านั้น; ใช้แรงใช้งานเมื่อเทียบ allowable pressure',
      'N และ M ต้องรวมผลของน้ำหนักฐาน ดินเหนือฐาน และแรงยกแล้ว โปรแกรมไม่เติมน้ำหนักเหล่านี้อัตโนมัติ',
      'ความกว้างสัมผัส a = 3(B/2 − e) สำหรับแรงดันสามเหลี่ยม แตกต่างจาก effective width B − 2e',
      'ยังไม่ตรวจสองแกน การทรุดตัว กำลังเฉือนทะลุ แรงเฉือนทางเดียว เหล็กเสริม หรือเสถียรภาพรวม',
    ],
    diagram: { type: 'footing', ...v }, values: v,
  };
}

export function shoringModel(input = {}) {
  const p = readInputs(shoringGroups, input);
  const concreteLoad = p.thickness * p.concreteWeight;
  const serviceLoad = concreteLoad + p.formLoad + p.liveLoad;
  const designLoad = serviceLoad * p.amplification;
  const area = p.gridX * p.gridY;
  const demand = designLoad * area;
  const capacity = p.capacity * p.reuse;
  const legDemand = demand / p.legs;
  const padPressure = legDemand / (p.padX * p.padY);
  return { ...p, ratedCapacity: p.capacity, concreteLoad, serviceLoad, designLoad, area, demand, reducedCapacity: capacity, legDemand, padPressure, utilization: demand / capacity };
}

function shoringResult(input) {
  const v = shoringModel(input);
  return {
    summary: [
      { label: 'ภาระต่อเฟรม', value: v.demand, unit: 'kN', tone: v.demand <= v.reducedCapacity ? 'ok' : 'warn' },
      { label: 'WLL หลังตัวคูณสภาพ', value: v.reducedCapacity, unit: 'kN' },
      { label: 'สัดส่วนใช้งานเฟรม', value: v.utilization * 100, unit: '%', tone: v.utilization <= 1 ? 'ok' : 'warn' },
      { label: 'หน่วยแรงใต้แผ่นรอง', value: v.padPressure, unit: 'kPa', tone: v.padPressure <= v.allowable ? 'ok' : 'warn' },
    ],
    checks: [
      { label: 'ภาระแนวดิ่งไม่เกิน WLL ที่ปรับลด', pass: v.demand <= v.reducedCapacity, detail: `${format(v.demand)} ≤ ${format(v.reducedCapacity)} kN ต่อเฟรม` },
      { label: 'แรงกดใต้แผ่นรองไม่เกินค่าที่กรอก', pass: v.padPressure <= v.allowable, detail: `${format(v.padPressure)} ≤ ${format(v.allowable)} kPa; สมมติทุกขารับแรงเท่ากัน` },
    ],
    steps: [
      { title: 'ภาระแผ่ต่อพื้นที่', formula: 'q = (γc t + qform + qconstruction) × amplification', result: `q = ${format(v.designLoad)} kPa` },
      { title: 'ภาระลงเฟรม', formula: 'Atributary = gridX × gridY; Pframe = q × Atributary', result: `A = ${format(v.area)} m²; Pframe = ${format(v.demand)} kN` },
      { title: 'กำลังทำงานจากข้อมูลที่กรอก', formula: 'WLLadjusted = WLLcertificate × condition factor', result: `WLLadjusted = ${format(v.reducedCapacity)} kN; utilization = ${format(v.utilization * 100)}%` },
      { title: 'แรงกดใต้แผ่นรอง', formula: 'Pleg = Pframe / legs; qpad = Pleg / (padX × padY)', result: `Pleg = ${format(v.legDemand)} kN; qpad = ${format(v.padPressure)} kPa` },
    ],
    notes: [
      'ตัวเลข WLL เริ่มต้นเป็นตัวอย่าง ต้องแทนด้วยใบรับรองผู้ผลิตที่ตรงรุ่น ความสูง ช่วงยืด และรูปแบบติดตั้งจริง',
      'WLL คือ working load limit ที่มีเกณฑ์ผู้ผลิตอยู่แล้ว ไม่ใช่กำลังวิบัติหรือกำลัง LRFD',
      'ภาระเป็นน้ำหนักแผ่บนพื้นที่รับน้ำหนักหนึ่งเฟรม ไม่ครอบคลุมแรงกระจุกตัวจากกองวัสดุ คาน หรืออุปกรณ์เท',
      'ยังไม่ตรวจตง คานรับตง U-head/jack การโก่งเดาะ แรงด้านข้าง bracing การทรุดตัว และลำดับการเท',
      'การเทียบแรงกับ WLL เป็นการคัดกรองเบื้องต้น ต้องตรวจระบบค้ำยันครบชุดก่อนใช้งานจริง',
    ],
    diagram: { type: 'shoring', ...v }, values: v,
  };
}

export const engineeringTools = {
  'retaining-wall': {
    id: 'retaining-wall', title: 'กำแพงกันดิน',
    description: 'Rankine · แรงดันน้ำ · การเลื่อน · การพลิก · แรงกดใต้ฐาน',
    inputGroups: wallGroups,
    assumptions: ['ดินถมแนวราบ ไม่มี cohesion; ระนาบ active pressure แนวดิ่งหลัง heel ไม่มี wall friction', 'แรงด้านข้างคิดตลอด D = H + ความหนาฐาน; ระดับน้ำ hw วัดขึ้นจากใต้ฐาน', 'แรงสถิตต่อกำแพงยาว 1 m; เกณฑ์ FS และ allowable pressure เป็นค่าที่ผู้ใช้กำหนด', 'คัดกรองเสถียรภาพภายนอก ยังไม่ออกแบบเหล็กเสริมหรือรับรองการออกแบบ'],
    references: [sources.wall, sources.contact], calculate: wallResult,
  },
  'rc-beam': {
    id: 'rc-beam', title: 'คานคอนกรีตเสริมเหล็ก',
    description: 'กำลังดัดหน้าตัดสี่เหลี่ยม เหล็กดึงด้านเดียว พร้อมตรวจความเครียด',
    inputGroups: beamGroups,
    assumptions: ['หน้าตัดสี่เหลี่ยม เหล็กดึงด้านเดียวและไม่คิดเหล็กอัด', 'f′c 17–28 MPa; ใช้ φ = 0.90 เฉพาะหน้าตัด tension controlled', 'ผลลัพธ์เป็นกำลังดัดเฉพาะหน้าตัด ไม่ใช่การออกแบบคานครบทุกข้อกำหนด'],
    references: [sources.flexure, sources.strain, sources.aci], calculate: input => flexureResult(beamModel(input)),
  },
  'rc-slab': {
    id: 'rc-slab', title: 'พื้นคอนกรีตทางเดียว',
    description: 'ตรวจแรงดัดต่อแถบกว้าง 1 m จากขนาดและระยะเรียงเหล็ก',
    inputGroups: slabGroups,
    assumptions: ['คำนวณหน้าตัดพื้นเป็นแถบกว้าง 1 m และรับโมเมนต์ทิศเดียว', 'กรอก Mu จากการวิเคราะห์พื้นและชุดแรงที่เลือก; ไม่วิเคราะห์พื้นสองทาง', 'ตรวจเฉพาะกำลังดัดเมื่อหน้าตัด tension controlled'],
    references: [sources.flexure, sources.strain, sources.aci], calculate: input => flexureResult(slabModel(input), true),
  },
  footing: {
    id: 'footing', title: 'ฐานรากเยื้องศูนย์',
    description: 'แรงกดฐานรากแกนเดียว พร้อมตรวจการแยกจากดินและแรงลัพธ์นอกฐาน',
    inputGroups: footingGroups,
    assumptions: ['ฐานแข็ง แรงเยื้องศูนย์แกนเดียว ดินไม่รับแรงดึง', 'แรง N และ M เป็นแรงใช้งานรวมที่ระดับใต้ฐาน', 'หน่วยแรงที่กรอกเป็น allowable แบบ gross; ยังไม่ตรวจเหล็กและการทรุดตัว'],
    references: [sources.contact], calculate: footingResult,
  },
  shoring: {
    id: 'shoring', title: 'ภาระนั่งร้านค้ำยัน',
    description: 'เทียบภาระงานเทกับ WLL ของเฟรมและแรงกดใต้แผ่นรอง',
    inputGroups: shoringGroups,
    assumptions: ['เฟรมรับแรงแนวดิ่งจากพื้นที่รับน้ำหนักที่กรอก และกระจายลงขาเท่ากัน', 'ต้องใช้ WLL จากใบรับรองรุ่นและสภาพการติดตั้งจริง', 'ใช้สถิตยศาสตร์อย่างง่าย ไม่ใช่การตรวจสมาชิก AISC หรือ FEA'],
    references: [], calculate: shoringResult,
  },
};

export function defaultInputs(id) {
  const tool = engineeringTools[id];
  if (!tool) throw new Error('ไม่พบเครื่องมือ');
  return Object.fromEntries(tool.inputGroups.flatMap(group => group.fields.map(f => [f.key, f.default])));
}
