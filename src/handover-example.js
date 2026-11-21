import { engineeringTools } from './engineering.js';
import { buildingQuantity, quantityTools } from './quantities.js';
import { normalizeDocument } from './document-control.js';
import { captureReviewItem, isReviewTimestamp } from './review-register.js';
import { uniqueId } from './utils.js';

/**
 * Authored example for practising document handover, not a complete building design.
 * The BOQ uses a one-time quantity snapshot; model loads are separate stated examples.
 * Nothing is written to storage and no existing project is modified here.
 */
export function createHandoverExample({ idFactory = uniqueId, now = new Date().toISOString() } = {}) {
  if (!isReviewTimestamp(now)) throw new Error('วันที่สร้างชุดตัวอย่างไม่ถูกต้อง');
  if (typeof idFactory !== 'function') throw new Error('ตัวสร้างรหัสงานไม่ถูกต้อง');
  const issueDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(now));
  const ids = new Set();
  const nextId = () => {
    const id = idFactory();
    if (typeof id !== 'string' || !id.trim() || id.length > 200 || /[\u0000-\u001f\u007f]/.test(id) || ids.has(id)) {
      throw new Error('รหัสงานตัวอย่างว่าง ซ้ำ หรือไม่ถูกต้อง');
    }
    ids.add(id);
    return id;
  };
  const commonBasis = 'ชุดข้อมูลสาธิตสำหรับอาคารสำนักงานสมมติ 6 × 8 ม. พื้นที่ 48 ตร.ม. ใช้ฝึกการประสานเอกสาร ไม่ใช่แบบก่อสร้างครบชุด ไม่มีการวิเคราะห์แรงร่วมระหว่างเครื่องมือ';
  const metadata = (code, basis) => normalizeDocument({
    projectCode: `DEMO-OFFICE / ${code}`,
    client: 'เจ้าของอาคารตัวอย่าง',
    site: 'อาคารสำนักงานสมมติ 6 × 8 ม. — ไม่มีสถานที่ก่อสร้างจริง',
    preparedBy: 'ชุดตัวอย่าง ENG APP',
    checkedBy: '',
    revision: 'P01',
    issueDate,
    purpose: 'draft',
    designBasis: `${commonBasis}\n\n${basis}`,
  });
  const record = (toolId, name, data, code, basis) => ({
    schemaVersion: 1,
    id: nextId(),
    toolId,
    name: `${name} (ตัวอย่าง)`,
    createdAt: now,
    updatedAt: now,
    data: { ...data, _document: metadata(code, basis) },
  });
  const addObservation = (project, { title, detail, owner, priority = 'normal' }) => {
    const definition = engineeringTools[project.toolId] || quantityTools[project.toolId];
    project.data._review = {
      schemaVersion: 1,
      toolId: project.toolId,
      nextSequence: 2,
      pending: null,
      items: [captureReviewItem(definition, project.data, {
        id: 'example-review-1', sequence: 1, now,
        document: project.data._document,
        title, detail, owner, priority, status: 'open', response: '',
      })],
    };
    return project;
  };

  const beam = addObservation(record('rc-beam', 'STR-001 · คาน B1 — ตรวจแรงดัด', {
    b: 300, d: 550, fc: 28, fy: 400, diameter: 20, count: 4, mu: 95,
  }, 'STR-001', 'คาน B1 หน้าตัดรวมสมมติ 300 × 600 มม. ใช้ d = 550 มม. และเหล็กดึง 4-DB20; Mu = 95 kN·m เป็นค่าตัวอย่างที่กรอกเอง ไม่ได้คำนวณจากพื้น S1 เครื่องมือนี้ตรวจแรงดัดหน้าตัดเท่านั้น ยังต้องวิเคราะห์แรง ชุดแรง แรงเฉือน ระยะพัฒนาเหล็ก และการโก่งตัว'), {
    title: 'ยืนยัน Mu และตรวจแรงเฉือนของคาน B1',
    detail: 'แทน Mu ด้วยผลวิเคราะห์ของโครงการ ตรวจหน้าตัดรวมและระยะหุ้มจริง และแนบรายการตรวจแรงเฉือน/รายละเอียดเหล็กก่อนใช้ผลนี้',
    owner: 'ผู้ตรวจโครงสร้าง (ตัวอย่าง)', priority: 'critical',
  });
  const slab = addObservation(record('rc-slab', 'STR-002 · พื้น S1 — แถบกว้าง 1 ม.', {
    d: 120, fc: 28, fy: 400, diameter: 10, spacing: 150, mu: 12,
  }, 'STR-002', 'พื้น S1 สมมติความหนารวม 150 มม. ใช้ d = 120 มม. เหล็ก DB10 @150 มม. และ Mu = 12 kN·m/m เป็นค่าตัวอย่างที่กรอกเอง วิเคราะห์เป็นแถบกว้าง 1 ม. ต้องยืนยันระบบพื้นทางเดียว ทิศทางถ่ายแรง และช่วงพาด; ไม่ได้ส่งแรงลงคาน B1 อัตโนมัติ'), {
    title: 'ยืนยันระบบพื้นและตรวจการโก่งตัว',
    detail: 'ตรวจผังรองรับว่าตรงกับสมมติฐานพื้นทางเดียว ยืนยัน Mu จากการวิเคราะห์ และตรวจข้อกำหนดการใช้งานที่อยู่นอกแบบจำลองนี้',
    owner: 'ผู้ตรวจโครงสร้าง (ตัวอย่าง)',
  });
  const footing = addObservation(record('footing', 'GEO-001 · ฐาน F1 — แรงกดใต้ฐาน', {
    width: 2, length: 2, normal: 450, moment: 60, allowable: 200,
  }, 'GEO-001', 'ฐาน F1 สมมติ 2 × 2 ม. ใช้แรงใช้งานรวมที่ระดับใต้ฐาน N = 450 kN, M = 60 kN·m และ allowable แบบ gross = 200 kPa ทั้งหมดเป็นตัวอย่าง ไม่ได้มาจากรายงานสำรวจดินหรือแรงปฏิกิริยาของคาน B1 ต้องตรวจการทรุดตัว กำลังโครงสร้างฐาน และสภาพดินจริงแยกต่างหาก'), {
    title: 'ยืนยันแรงใช้งานและรายงานดินก่อนใช้ค่า allowable',
    detail: 'ระบุที่มาของ N และ M รวมที่ใต้ฐาน แนบข้อมูลสำรวจดินที่รองรับ allowable แบบ gross และตรวจการทรุดตัวกับการออกแบบโครงสร้างฐานราก',
    owner: 'ผู้ตรวจฐานราก (ตัวอย่าง)', priority: 'critical',
  });

  const quantityInputs = {
    element: 'beam', length: 4, width: 0.30, depth: 0.60,
    count: 6, steelRatio: 120, allowance: 3,
  };
  const quantity = addObservation(record('quantity-building', 'QTY-001 · ปริมาณคานกลุ่ม B1 จำนวน 6 ชิ้น', quantityInputs,
    'QTY-001', 'นับเฉพาะคานกลุ่ม B1 จำนวน 6 ชิ้น ยาวชิ้นละ 4 ม. หน้าตัดรวม 0.30 × 0.60 ม. ในผังสมมติ 6 × 8 ม. ไม่รวมคานอีกทิศ เสา พื้น หรือฐานราก ใช้ปริมาตรก่อนหักรอยต่อ; แบบหล่อคิดท้องและสองข้าง; เหล็ก 120 กก./ลบ.ม. เป็นอัตราประมาณราคา ไม่ใช่ปริมาณจาก 4-DB20 หรือ BBS เผื่อสั่งคอนกรีต 3% แยกจากปริมาตรสุทธิใน BOQ'), {
    title: 'หักรอยต่อและแทนอัตราเหล็กด้วยปริมาณจากแบบ',
    detail: 'ตรวจการนับชิ้นส่วนและรอยต่อคาน–เสา–พื้นเพื่อลดปริมาณซ้ำ ก่อนแทนเหล็กประมาณการด้วย BBS ที่ตรวจแล้ว BOQ-001 เป็นสำเนาตัวเลขตอนสร้างชุด ต้องแก้ BOQ แยกเมื่อปริมาณเปลี่ยน',
    owner: 'ผู้ตรวจปริมาณ (ตัวอย่าง)',
  });
  const quantities = buildingQuantity(quantityInputs);
  const boq = record('boq-building', 'BOQ-001 · ต้นทุนเฉพาะคานกลุ่ม B1', {
    version: 1,
    rows: [
      { id: 'B1-CONC', name: 'คอนกรีตคาน B1 — ปริมาตรก่อนเผื่อ', unit: 'ลบ.ม.', quantity: quantities.volume, material: 2400, labor: 450 },
      { id: 'B1-FORM', name: 'แบบหล่อคาน B1 — ท้องและสองข้าง', unit: 'ตร.ม.', quantity: quantities.formwork, material: 250, labor: 220 },
      { id: 'B1-STEEL', name: 'เหล็กคาน B1 — ประมาณที่ 120 กก./ลบ.ม.', unit: 'กก.', quantity: quantities.steel, material: 25, labor: 10 },
    ],
    overhead: 10,
    vat: 7,
    notes: 'BOQ ตัวอย่างเฉพาะคานกลุ่ม B1 จำนวน 6 ชิ้น ไม่ใช่งบทั้งอาคาร ปริมาณอ้างอิง QTY-001 P01 ณ เวลาสร้างชุด: คอนกรีต 4.32 ลบ.ม., แบบหล่อ 36 ตร.ม., เหล็กประมาณการ 518.4 กก. ตัวเลขคัดลอกครั้งเดียวและไม่ปรับตาม QTY-001 อัตโนมัติ ไม่รวมเผื่อคอนกรีตสั่งซื้อ 3% ราคาวัสดุ ค่าแรง ค่าอำนวยการ 10% และ VAT 7% เป็นค่าตัวอย่างเพื่อฝึก ต้องแทนด้วยเงื่อนไขจริงก่อนใช้',
  }, 'BOQ-001', 'ปริมาณต้นทาง QTY-001 P01 ของคาน B1 เพียงกลุ่มเดียว ราคาทั้งหมดเป็นข้อมูลตัวอย่างที่ผู้จัดทำกำหนด ไม่มีการเชื่อมราคาตลาด และไม่มีการรวมราคาจากเอกสารอื่น ตรวจขอบเขต รอยต่อ ปริมาณเหล็ก และฐานเผื่อวัสดุก่อนใช้ยอดนี้');
  const planning = record('planning', 'PLN-001 · แผนกิจกรรมคานกลุ่ม B1', {
    version: 1,
    startDate: '2026-12-01',
    statusDate: '2026-12-08',
    tasks: [
      { id: 'T1', name: 'ตรวจแบบและวิธีการทำงาน', duration: 5, predecessors: '', progress: 100, budget: 0 },
      { id: 'T2', name: 'จัดเตรียมแบบและเหล็ก', duration: 7, predecessors: 'T1', progress: 45, budget: 0 },
      { id: 'T3', name: 'ติดตั้งค้ำยันและแบบคาน', duration: 4, predecessors: 'T2', progress: 0, budget: 0 },
      { id: 'T4', name: 'ติดตั้งเหล็กเสริมคาน', duration: 3, predecessors: 'T3', progress: 0, budget: 0 },
      { id: 'T5', name: 'ตรวจรายการก่อนเท', duration: 1, predecessors: 'T4', progress: 0, budget: 0 },
      { id: 'T6', name: 'เทและบ่มตามแผนตัวอย่าง', duration: 8, predecessors: 'T5', progress: 0, budget: 0 },
      { id: 'T7', name: 'ตรวจเพื่อพิจารณาถอดแบบ', duration: 2, predecessors: 'T6', progress: 0, budget: 0 },
    ],
    notes: 'แผนตัวอย่างเฉพาะกลุ่มคาน B1 ใช้วันปฏิทินและ Finish-to-Start ไม่มี lag เริ่ม 1 ธ.ค. 2569 ประเมินตัวอย่าง ณ 8 ธ.ค. 2569 ความก้าวหน้าเป็นค่าจำลอง งบแต่ละกิจกรรมเป็น 0 จึงถ่วงความก้าวหน้าด้วยระยะเวลา ไม่ใช้เป็นแผนการเงิน ระยะบ่มและการพิจารณาถอดแบบเป็นกิจกรรมสาธิต ต้องกำหนดจากวิธีการและกำลังจริงที่ผู้รับผิดชอบตรวจแล้ว',
  }, 'PLN-001', 'แผนฐานสาธิต 7 กิจกรรม รวม 30 วัน ใช้ทดสอบ Gantt/CPM และสถานะความก้าวหน้า ไม่ใช่กำหนดการที่อนุมัติ ไม่มีข้อจำกัดทรัพยากร วันหยุด หรือความเชื่อมโยงอัตโนมัติกับ BOQ-001 และผลตรวจค้ำยัน/กำลังคอนกรีต');

  const records = [beam, slab, footing, quantity, boq, planning];
  return {
    records,
    state: {
      schemaVersion: 1,
      metadata: {
        title: 'อาคารสำนักงาน 48 ตร.ม. — ชุดประสานงานตัวอย่าง',
        reference: 'DEMO-OFFICE / TR-001',
        recipient: 'ผู้ตรวจประสานงาน (ตัวอย่าง)',
        purpose: 'coordination',
        note: 'ตัวอย่าง 6 เอกสาร: คาน พื้น ฐานราก ปริมาณคาน B1, BOQ เฉพาะกลุ่ม B1 และแผนกิจกรรม ทุกชื่อและตัวเลขเป็นข้อมูลสาธิต ไม่มีการยืนยันตรวจโดยผู้ใช้ ข้อมูลแรงของคาน/พื้น/ฐานเป็นค่าตัวอย่างแยกกัน ต้องวิเคราะห์ความสัมพันธ์ก่อนใช้จริง ปริมาณและ BOQ ครอบคลุมเฉพาะคาน B1 จำนวน 6 ชิ้น และไม่ปรับตามกันอัตโนมัติ',
      },
      selectedIds: records.map(project => project.id),
    },
  };
}
