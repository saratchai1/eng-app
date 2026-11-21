import { sketch, icon } from './visuals.js';
import { escapeHTML as e, format, download, csv } from './utils.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_DATA_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64;
const MODES = { calibrate: 'ตั้งสเกล', length: 'ระยะ', area: 'พื้นที่', count: 'นับจุด' };
const clone = value => JSON.parse(JSON.stringify(value));
const point = p => {
  if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('พิกัดจุดต้องเป็นตัวเลขที่มีค่าจำกัด');
  return { x: p.x, y: p.y };
};
export function lineLength(a, b) {
  a = point(a); b = point(b);
  return Math.hypot(b.x - a.x, b.y - a.y);
}
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onSegment = (a, b, p) => Math.abs(cross(a, b, p)) < 1e-9 && p.x >= Math.min(a.x,b.x)-1e-9 && p.x <= Math.max(a.x,b.x)+1e-9 && p.y >= Math.min(a.y,b.y)-1e-9 && p.y <= Math.max(a.y,b.y)+1e-9;
function intersects(a,b,c,d) {
  const x = cross(a,b,c), y = cross(a,b,d), z = cross(c,d,a), w = cross(c,d,b);
  return (x*y < -1e-18 && z*w < -1e-18) || onSegment(a,b,c) || onSegment(a,b,d) || onSegment(c,d,a) || onSegment(c,d,b);
}
export function polygonArea(input) {
  if (!Array.isArray(input) || input.length < 3 || input.length > 201) throw new Error('พื้นที่ต้องมีจุด 3–200 จุด');
  const points = input.map(point);
  if (lineLength(points[0],points.at(-1)) < 1e-12) points.pop();
  if (points.length < 3 || points.length > 200) throw new Error('พื้นที่ต้องมีจุดต่างกันอย่างน้อย 3 จุด');
  for (let i=0;i<points.length;i++) {
    if (lineLength(points[i],points[(i+1)%points.length]) < 1e-12) throw new Error('จุดต่อเนื่องซ้ำกัน');
    for (let j=i+1;j<points.length;j++) {
      if (j===i+1 || (i===0 && j===points.length-1)) continue;
      if (intersects(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length])) throw new Error('ขอบพื้นที่ตัดกัน กรุณาเลือกจุดเรียงรอบรูป');
    }
  }
  return Math.abs(points.reduce((sum,p,i) => {
    const q=points[(i+1)%points.length]; return sum+p.x*q.y-q.x*p.y;
  },0))/2;
}
export function validImageData(src) {
  if (typeof src !== 'string' || src.length > MAX_DATA_LENGTH) return false;
  return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src);
}
function normalizedPoint(p) {
  const q=point(p);
  if(q.x<0 || q.x>1 || q.y<0 || q.y>1) throw new Error('พิกัดต้องอยู่ภายในภาพ');
  return q;
}
function finitePositive(v,min,max) { return typeof v==='number' && Number.isFinite(v) && v>=min && v<=max; }
export function normalizeTakeoffState(raw) {
  const fallback = { image:null, width:800, height:500, metersPerPixel:.02, calibration:{points:[{x:.125,y:.2},{x:.875,y:.2}],meters:12}, measures:[], draftLabel:'', mode:'length' };
  if(raw===undefined || raw===null) return fallback;
  if(typeof raw!=='object' || Array.isArray(raw)) throw new Error('ข้อมูลการวัดไม่ถูกต้อง');
  const state={...fallback};
  if(raw.image) {
    if(!validImageData(raw.image.src)) throw new Error('ภาพที่นำเข้าต้องเป็น PNG/JPEG/WebP ไม่เกิน 2 MB');
    if(!Number.isInteger(raw.image.width) || !Number.isInteger(raw.image.height) || !finitePositive(raw.image.width,1,12000) || !finitePositive(raw.image.height,1,12000) || raw.image.width*raw.image.height>36000000) throw new Error('ขนาดภาพไม่ถูกต้องหรือใหญ่เกิน 36 ล้านพิกเซล');
    state.image={src:raw.image.src,width:raw.image.width,height:raw.image.height,name:String(raw.image.name||'ภาพนำเข้า').slice(0,150)};
    state.width=state.image.width; state.height=state.image.height;
    state.metersPerPixel=null; state.calibration=null;
  }
  if(raw.calibration) {
    if(!Array.isArray(raw.calibration.points) || raw.calibration.points.length!==2 || !finitePositive(raw.calibration.meters,.0001,1000000)) throw new Error('ข้อมูลระยะอ้างอิงไม่ถูกต้อง');
    const points=raw.calibration.points.map(normalizedPoint);
    const pixels=lineLength({x:points[0].x*state.width,y:points[0].y*state.height},{x:points[1].x*state.width,y:points[1].y*state.height});
    if(pixels<1) throw new Error('จุดอ้างอิงต้องห่างกันอย่างน้อย 1 พิกเซล');
    state.calibration={points,meters:raw.calibration.meters};
    state.metersPerPixel=raw.calibration.meters/pixels;
  } else if(raw.image) {
    state.metersPerPixel=null;
  }
  if(raw.measures!==undefined && (!Array.isArray(raw.measures) || raw.measures.length>200)) throw new Error('รองรับรายการวัดไม่เกิน 200 รายการ');
  let total=0;
  state.measures=(raw.measures||[]).map((m,i)=>{
    if(!m || !['length','area','count'].includes(m.type) || !Array.isArray(m.points) || m.points.length>200) throw new Error('รายการวัดไม่ถูกต้อง');
    const points=m.points.map(normalizedPoint); total+=points.length;
    if(total>2000 || (m.type==='length' && points.length!==2) || (m.type==='area' && points.length<3) || (m.type==='count' && points.length<1)) throw new Error('จำนวนจุดวัดไม่ถูกต้อง');
    if(m.type==='area' && polygonArea(points)<=1e-12) throw new Error('พื้นที่ต้องมากกว่าศูนย์');
    return {id:'m'+i,type:m.type,name:String(m.name||MODES[m.type]).slice(0,100),points};
  });
  state.draftLabel=String(raw.draftLabel||'').slice(0,100);
  state.mode=Object.hasOwn(MODES,raw.mode)?raw.mode:'length';
  if(!state.metersPerPixel && ['length','area'].includes(state.mode)) state.mode='calibrate';
  return state;
}
function measurement(m,state) {
  if(m.type==='count') return {value:m.points.length,unit:'จุด'};
  if(!state.metersPerPixel) return {value:null,unit:m.type==='area'?'m²':'m'};
  const points=m.points.map(p=>({x:p.x*state.width,y:p.y*state.height}));
  return {value:m.type==='length'?lineLength(points[0],points[1])*state.metersPerPixel:polygonArea(points)*state.metersPerPixel**2,unit:m.type==='area'?'m²':'m'};
}
const samplePlan = '<rect width="800" height="500" fill="#fafbf8"/><g fill="none" stroke="#64746e" stroke-width="2"><path d="M100 100H700V400H100ZM108 108H692V392H108Z M400 108V208 M400 268V392 M408 108V208 M408 268V392 M408 250H550 M610 250H692 M408 258H550 M610 258H692"/><path d="M400 208A60 60 0 0 1 460 268 M550 250A60 60 0 0 1 610 310" stroke-width="1"/><path d="M100 64H700 M100 54V74 M700 54V74 M65 100V400 M55 100H75 M55 400H75" stroke="#819b8f"/></g><g fill="#365448" font-family="sans-serif" font-size="18" text-anchor="middle"><text x="400" y="52">12.00 m</text><text x="42" y="255" transform="rotate(-90 42 255)">6.00 m</text><text x="250" y="255">ROOM A</text><text x="550" y="177">ROOM B</text><text x="550" y="330">ROOM C</text><text x="400" y="455" font-size="14">ILLUSTRATIVE PLAN · 800 × 500 px · 0.02 m/px</text></g>';
function takeoffSVG(state,pending=[],interactive=false) {
  const W=state.width,H=state.height,s=Math.max(W,H)/800;
  const xy=p=>formatCoordinate(p.x*W)+','+formatCoordinate(p.y*H);
  const reference=state.calibration?'<polyline points="'+state.calibration.points.map(xy).join(' ')+'" fill="none" stroke="#39846a" stroke-width="'+(1.5*s)+'" stroke-dasharray="'+(6*s)+' '+(5*s)+'"/>'+state.calibration.points.map((p,i)=>'<circle cx="'+(p.x*W)+'" cy="'+(p.y*H)+'" r="'+(4*s)+'" fill="white" stroke="#39846a" stroke-width="'+(2*s)+'"/><text x="'+(p.x*W+7*s)+'" y="'+(p.y*H+18*s)+'" font-family="sans-serif" font-size="'+(11*s)+'" fill="#27684f" stroke="white" stroke-width="'+(2*s)+'" paint-order="stroke">REF '+(i+1)+'</text>').join(''):'';
  const paths=state.measures.map((m,i)=>{
    const pts=m.points.map(xy).join(' ');
    const color=m.type==='length'?'#267bba':m.type==='area'?'#a16b23':'#cb5f48';
    const shape=m.type==='area'?'<polygon points="'+pts+'" fill="'+color+'" fill-opacity=".15" stroke="'+color+'" stroke-width="'+(2*s)+'"/>':m.type==='length'?'<polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="'+(3*s)+'"/>':'';
    const dots=m.points.map(p=>'<circle cx="'+(p.x*W)+'" cy="'+(p.y*H)+'" r="'+(m.type==='count'?5*s:3*s)+'" fill="'+color+'" stroke="white" stroke-width="'+s+'"/>').join('');
    return shape+dots+'<text x="'+(m.points[0].x*W+8*s)+'" y="'+(m.points[0].y*H-8*s)+'" font-family="sans-serif" font-size="'+(14*s)+'" font-weight="700" fill="'+color+'" stroke="white" stroke-width="'+(3*s)+'" paint-order="stroke">'+(i+1)+'</text>';
  }).join('');
  const pendingSvg=pending.length?'<polyline points="'+pending.map(xy).join(' ')+'" fill="none" stroke="#d09a2a" stroke-width="'+(2*s)+'" stroke-dasharray="'+(6*s)+' '+(4*s)+'"/>'+pending.map(p=>'<circle cx="'+(p.x*W)+'" cy="'+(p.y*H)+'" r="'+(5*s)+'" fill="#d09a2a" stroke="white" stroke-width="'+(2*s)+'"/>').join(''):'';
  return '<svg xmlns="http://www.w3.org/2000/svg" '+(interactive?'data-sp-stage tabindex="0" ':'')+'viewBox="0 0 '+W+' '+H+'" role="img" aria-label="แบบสำหรับวัดระยะและพื้นที่" style="display:block;width:100%;height:auto;background:#fff;touch-action:manipulation">'+(state.image?'<image href="'+e(state.image.src)+'" width="'+W+'" height="'+H+'" preserveAspectRatio="none"/>':samplePlan)+reference+paths+pendingSvg+'</svg>';
}
function formatCoordinate(v){return Math.round(v*10000)/10000;}
function resultTable(state,editable=false){
  return '<div class="sp-table-wrap"><table class="sp-table"><thead><tr><th>#</th><th>รายการ</th><th>ชนิด</th><th>ปริมาณ</th><th>หน่วย</th>'+(editable?'<th>จัดการ</th>':'')+'</tr></thead><tbody>'+state.measures.map((m,i)=>{
    const r=measurement(m,state);return '<tr><td>'+(i+1)+'</td><td>'+(editable?'<input aria-label="ชื่อรายการ '+(i+1)+'" data-sp-name="'+i+'" value="'+e(m.name)+'" maxlength="100">':e(m.name))+'</td><td>'+MODES[m.type]+'</td><td>'+(r.value===null?'ตั้งสเกลก่อน':format(r.value,3))+'</td><td>'+r.unit+'</td>'+(editable?'<td><button type="button" class="sp-text-button" data-sp-action="delete" data-index="'+i+'" aria-label="ลบรายการ '+(i+1)+'">ลบ</button></td>':'')+'</tr>';
  }).join('')+(state.measures.length?'':'<tr><td colspan="'+(editable?6:5)+'" class="sp-empty">เลือกโหมดแล้วแตะจุดบนภาพเพื่อเริ่มวัด</td></tr>')+'</tbody></table></div>';
}
function mountTakeoff(container,initial,ctx){
  let state;
  try{state=normalizeTakeoffState(initial);}catch(error){ctx.notify(error.message);state=normalizeTakeoffState(null);}
  let pending=[],realDistance=state.calibration?.meters||1,destroyed=false,uploadRevision=0;
  const manual={open:false,x:'50',y:'50'};
  function render(){
    const existingDetails=container.querySelector('.sp-coordinate');
    if(existingDetails){manual.open=existingDetails.open;manual.x=container.querySelector('[data-sp-x]').value;manual.y=container.querySelector('[data-sp-y]').value;}
    const active=document.activeElement;
    const focusAttribute=container.contains(active)?['data-sp-name','data-sp-label','data-sp-distance','data-sp-x','data-sp-y'].find(attribute=>active.hasAttribute(attribute)):null;
    const focusValue=focusAttribute?active.getAttribute(focusAttribute):null;
    const selection=focusAttribute&&typeof active.selectionStart==='number'?[active.selectionStart,active.selectionEnd]:null;
    const calibrated=!!state.metersPerPixel;
    container.innerHTML='<section class="sp-workspace"><div class="sp-intro"><div><span class="sp-eyebrow">IMAGE TAKEOFF</span><h2>วัดจากภาพแบบ</h2><p>1 เลือกภาพ · 2 ตั้งสเกลจากระยะที่ทราบ · 3 วัดระยะ พื้นที่ หรือนับจุด</p></div><button type="button" class="sp-button sp-primary" data-sp-action="upload" aria-label="เลือกภาพ">'+icon('upload')+'เลือกภาพ</button><input type="file" data-sp-upload aria-label="ไฟล์ภาพแบบ PNG JPEG หรือ WebP" accept="image/png,image/jpeg,image/webp" hidden></div><p class="sp-note">PNG / JPEG / WebP ไม่เกิน 2 MB · ภาพจาก PDF ให้แปลงเป็นภาพก่อน · ใช้แบบแปลนมุมมองตรงที่มีสเกลสม่ำเสมอ ไม่มี OCR หรือถอด BOQ อัตโนมัติ</p><div class="sp-layout"><div class="sp-canvas-panel"><div class="sp-modebar" role="group" aria-label="โหมดวัด">'+Object.entries(MODES).map(([id,name])=>'<button type="button" class="sp-mode '+(state.mode===id?'is-active':'')+'" aria-pressed="'+(state.mode===id)+'" data-sp-action="mode" data-mode="'+id+'" '+(!calibrated&&['length','area'].includes(id)?'disabled':'')+'>'+name+'</button>').join('')+'<button type="button" class="sp-text-button" data-sp-action="sample">ใช้ภาพตัวอย่าง</button></div><div class="sp-stage">'+takeoffSVG(state,pending,true)+'</div><div class="sp-canvas-caption"><span>'+e(state.image?.name||'ภาพตัวอย่างที่เขียนขึ้นใหม่')+'</span><span>'+state.width+' × '+state.height+' px</span></div><div class="sp-status" aria-live="polite">'+modeInstruction()+'</div><div class="sp-row"><button type="button" class="sp-button" data-sp-action="undo" '+(!pending.length?'disabled':'')+'>ย้อนจุดล่าสุด</button><button type="button" class="sp-button sp-primary" data-sp-action="finish" '+(state.mode!=='area'||pending.length<3?'disabled':'')+'>ปิดรูปและบันทึกพื้นที่</button></div></div><aside class="sp-side"><section class="sp-panel"><h3>สเกลของภาพ</h3><div class="sp-scale '+(!calibrated?'sp-attention':'')+'">'+(calibrated?format(state.metersPerPixel,6)+' <small>m / pixel</small>':'ยังไม่ได้ตั้งสเกล')+'</div><p>แตะสองจุดที่มีระยะจริงกำกับบนแบบ แล้วกรอกระยะนั้น</p><label class="sp-field">ระยะจริงระหว่างจุดอ้างอิง (m)<input type="number" data-sp-distance min=".0001" max="1000000" step="any" value="'+e(realDistance)+'"></label><button type="button" class="sp-button sp-primary sp-full" data-sp-action="calibrate" '+(state.mode!=='calibrate'||pending.length!==2?'disabled':'')+'>บันทึกสเกลจาก 2 จุด</button><p class="sp-note">เปลี่ยนสเกลแล้วระยะและพื้นที่เดิมจะคำนวณใหม่ทั้งหมด</p></section><section class="sp-panel"><h3>ชื่อรายการถัดไป</h3><input class="sp-label-input" aria-label="ชื่อรายการถัดไป" data-sp-label maxlength="100" value="'+e(state.draftLabel)+'" placeholder="เช่น พื้นห้องประชุม"><p class="sp-note">โหมดนับจุดจะรวมจุดชื่อเดียวกันที่บันทึกต่อเนื่อง</p><details class="sp-coordinate" '+(manual.open?'open':'')+'><summary>เพิ่มจุดด้วยพิกัด</summary><label class="sp-field">X จากซ้าย (%)<input data-sp-x type="number" min="0" max="100" step="any" value="'+e(manual.x)+'"></label><label class="sp-field">Y จากบน (%)<input data-sp-y type="number" min="0" max="100" step="any" value="'+e(manual.y)+'"></label><button type="button" class="sp-button" data-sp-action="coordinate">เพิ่มจุด</button></details></section></aside></div><section class="sp-panel sp-measurements"><div class="sp-section-head"><div><h3>รายการวัด</h3><p>'+state.measures.length+' รายการ · ผลเป็นปริมาณเรขาคณิตจากภาพ</p></div><button type="button" class="sp-button" data-sp-action="csv">'+icon('download')+'ส่งออก CSV</button></div>'+resultTable(state,true)+'</section></section>';
    if(focusAttribute){
      const target=Array.from(container.querySelectorAll('['+focusAttribute+']')).find(node=>node.getAttribute(focusAttribute)===focusValue);
      if(target){target.focus({preventScroll:true});if(selection)target.setSelectionRange(...selection);}
    }
  }
  function modeInstruction(){
    if(state.mode==='calibrate')return pending.length===2?'เลือกครบ 2 จุดแล้ว กรอกระยะจริงและกดบันทึกสเกล':'แตะจุดอ้างอิงบนภาพ '+pending.length+'/2 จุด';
    if(state.mode==='length')return 'แตะจุดต้นและจุดปลาย '+pending.length+'/2 จุด';
    if(state.mode==='area')return 'แตะมุมตามลำดับรอบพื้นที่ ('+pending.length+' จุด) แล้วกดปิดรูป หลีกเลี่ยงขอบตัดกัน';
    return 'แตะตำแหน่งที่ต้องการนับ แต่ละจุดจะบันทึกทันที';
  }
  function changed(){ctx.onChange();}
  function addMeasurement(type,points){
    if(state.measures.length>=200)throw new Error('บันทึกได้ไม่เกิน 200 รายการ');
    if(state.measures.reduce((n,m)=>n+m.points.length,0)+points.length>2000)throw new Error('รองรับจุดวัดรวมไม่เกิน 2,000 จุด');
    const name=state.draftLabel.trim()||MODES[type]+' '+(state.measures.length+1);
    const last=state.measures.at(-1);
    if(type==='count' && last?.type==='count' && (state.draftLabel.trim()?last.name===name:true) && last.points.length<200) last.points.push(...points);
    else state.measures.push({id:'m'+Date.now(),type,name,points:clone(points)});
    pending=[];changed();render();
  }
  function addPoint(p){
    p=normalizedPoint(p);
    if(state.mode==='count')return addMeasurement('count',[p]);
    if(['length','area'].includes(state.mode)&&!state.metersPerPixel)throw new Error('กรุณาตั้งสเกลก่อนวัด');
    if(pending.length>=200)throw new Error('รูปหนึ่งรองรับไม่เกิน 200 จุด');
    if(pending.length&&lineLength(p,pending.at(-1))<.00001)throw new Error('เลือกจุดถัดไปที่ต่างจากจุดก่อนหน้า');
    if(state.mode==='calibrate'&&pending.length===2)pending=[];
    pending.push(p);
    if(state.mode==='length'&&pending.length===2)return addMeasurement('length',pending);
    render();
  }
  async function upload(file){
    const revision=++uploadRevision;
    if(!file)return;
    try{
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>MAX_IMAGE_BYTES)throw new Error('เลือก PNG/JPEG/WebP ขนาดไม่เกิน 2 MB');
      const src=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('อ่านภาพไม่สำเร็จ'));r.readAsDataURL(file);});
      if(!validImageData(src))throw new Error('ข้อมูลภาพไม่ถูกต้อง');
      const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('เปิดภาพนี้ไม่ได้'));image.src=src;});
      if(destroyed||revision!==uploadRevision)return;
      state=normalizeTakeoffState({image:{src,name:file.name,width:img.naturalWidth,height:img.naturalHeight},measures:[],mode:'calibrate'});
      pending=[];realDistance=1;render();changed();ctx.notify('โหลดภาพแล้ว กรุณาตั้งสเกลใหม่ก่อนวัดระยะหรือพื้นที่');
    }catch(error){if(!destroyed)ctx.notify(error.message);}
  }
  const onInput=event=>{
    const el=event.target;
    if(el.matches('[data-sp-distance]'))realDistance=el.value;
    if(el.matches('[data-sp-label]')){state.draftLabel=el.value.slice(0,100);changed();}
    if(el.matches('[data-sp-name]')){const m=state.measures[Number(el.dataset.spName)];if(m){m.name=el.value.slice(0,100);changed();}}
  };
  const onChange=event=>{if(event.target.matches('[data-sp-upload]'))upload(event.target.files?.[0]);};
  const onClick=event=>{
    try{
      const stage=event.target.closest('[data-sp-stage]');
      if(stage&&container.contains(stage)){
        if(event.detail===0)return;
        const rect=stage.getBoundingClientRect();
        return addPoint({x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))});
      }
      const button=event.target.closest('[data-sp-action]');
      if(!button||!container.contains(button))return;
      const action=button.dataset.spAction;
      if(action==='upload'){container.querySelector('[data-sp-upload]').click();return;}
      if(action==='mode'){state.mode=button.dataset.mode;pending=[];render();changed();}
      if(action==='undo'){pending.pop();render();}
      if(action==='coordinate'){
        const xInput=container.querySelector('[data-sp-x]').value,yInput=container.querySelector('[data-sp-y]').value;
        if(xInput.trim()===''||yInput.trim()==='')throw new Error('กรอกพิกัด X และ Y');
        addPoint({x:Number(xInput)/100,y:Number(yInput)/100});
      }
      if(action==='sample'){uploadRevision++;state=normalizeTakeoffState(null);pending=[];realDistance=12;render();changed();ctx.notify('ใช้ภาพตัวอย่างและสเกล 0.02 m/pixel แล้ว');}
      if(action==='delete'){state.measures.splice(Number(button.dataset.index),1);render();changed();}
      if(action==='finish'){
        if(pending.length<3)throw new Error('เลือกอย่างน้อย 3 จุด');
        if(polygonArea(pending)<=1e-12)throw new Error('พื้นที่ต้องมากกว่าศูนย์');
        addMeasurement('area',pending);
      }
      if(action==='calibrate'){
        if(pending.length!==2)throw new Error('เลือกจุดอ้างอิง 2 จุดก่อน');
        const meters=Number(realDistance);
        if(!finitePositive(meters,.0001,1000000))throw new Error('ระยะจริงต้องมากกว่าศูนย์และไม่เกิน 1,000,000 m');
        const pixels=lineLength({x:pending[0].x*state.width,y:pending[0].y*state.height},{x:pending[1].x*state.width,y:pending[1].y*state.height});
        if(pixels<1)throw new Error('จุดอ้างอิงต้องห่างกันอย่างน้อย 1 พิกเซล');
        state.calibration={points:clone(pending),meters};state.metersPerPixel=meters/pixels;pending=[];state.mode='length';render();changed();ctx.notify('ตั้งสเกลแล้ว ระยะและพื้นที่อ้างอิงหน่วยเมตร');
      }
      if(action==='csv'){
        download('eng-app-takeoff.csv',csv([['รายการ','ชนิด','ปริมาณ','หน่วย','m/pixel','ภาพ'],...state.measures.map(m=>{const r=measurement(m,state);return[m.name,MODES[m.type],r.value===null?'ยังไม่ตั้งสเกล':r.value,r.unit,state.metersPerPixel??'',state.image?.name||'ตัวอย่าง'];})]),'text/csv;charset=utf-8');ctx.notify('ส่งออกตารางวัด CSV แล้ว');
      }
    }catch(error){ctx.notify(error.message);}
  };
  container.addEventListener('input',onInput);container.addEventListener('change',onChange);container.addEventListener('click',onClick);render();
  return{
    getState:()=>clone(state),
    getReport:()=>'<section class="sp-report"><h2>รายการวัดจากภาพแบบ</h2><p>ภาพ: '+e(state.image?.name||'ภาพแปลนตัวอย่างที่เขียนขึ้นใหม่')+' · '+state.width+' × '+state.height+' px</p><p>สเกล: '+(state.metersPerPixel?format(state.metersPerPixel,8)+' m/pixel; ระยะอ้างอิง '+format(state.calibration.meters,4)+' m':'ยังไม่ตั้งสเกล')+'</p>'+takeoffSVG(state)+resultTable(state)+'<p>ระยะ = ความยาวพิกเซล × สเกล; พื้นที่ = พื้นที่พิกเซล² × สเกล². หน่วย m, m² และจุดตามรายการ ไม่รวมความหนา เศษสูญเสีย หรือราคา ใช้ภาพฉายตรงสเกลเดียวกันทั้งภาพ ความแม่นขึ้นกับภาพและการเลือกจุด</p></section>',
    destroy:()=>{destroyed=true;uploadRevision++;container.removeEventListener('input',onInput);container.removeEventListener('change',onChange);container.removeEventListener('click',onClick);}
  };
}

const DRAWINGS=[
  {id:'wall',name:'แนวคิดกำแพงกันดิน',description:'ผนัง ฐาน และแรงด้านข้าง'},
  {id:'beam',name:'คานคอนกรีตเสริมเหล็ก',description:'องค์ประกอบหน้าตัดและเหล็กดึง'},
  {id:'footing',name:'ฐานรากแผ่',description:'แรงกดและการรองรับใต้ฐาน'},
  {id:'canal',name:'คลองสี่เหลี่ยมคางหมู',description:'ความกว้างท้องคลองและลาดข้าง'},
  {id:'road',name:'ชั้นโครงสร้างทาง',description:'แนวคิดการแบ่งชั้นวัสดุ'},
  {id:'shoring',name:'ระบบค้ำยันพื้น',description:'เส้นทางถ่ายน้ำหนักและค้ำยันทแยง'},
];
function standaloneDrawing(item){
  const inside=sketch(item.id).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'').replaceAll('currentColor','#234c40').replaceAll('var(--art-bg,#edf5f1)','#edf5f1').replaceAll('class="accent-stroke"','stroke="#b38031"').replaceAll('class="accent-fill"','fill="#b38031"').replaceAll('<text ','<text fill="#234c40" stroke="none" font-family="sans-serif" font-size="12" ');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 460" role="img" aria-label="'+e(item.name)+'"><rect width="640" height="460" fill="#f8faf7"/><text x="32" y="36" font-size="22" font-family="sans-serif" fill="#234c40">'+e(item.name)+'</text><g transform="translate(32 66) scale(1.8)" fill="none" stroke="#234c40" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">'+inside+'</g><text x="32" y="416" font-family="sans-serif" font-size="14" fill="#53665c">ภาพร่างเชิงอธิบาย · ไม่ได้มาตราส่วน · ไม่ใช่แบบก่อสร้าง</text><text x="32" y="440" font-family="sans-serif" font-size="12" fill="#65796e">ENG APP · Original schematic · Not a DOH standard drawing</text></svg>';
}
function mountDrawings(container,initial,ctx){
  let selected=DRAWINGS.some(d=>d.id===initial?.selected)?initial.selected:'wall';
  const current=()=>DRAWINGS.find(d=>d.id===selected);
  function render(){
    container.innerHTML='<section class="sp-workspace"><div class="sp-intro"><div><span class="sp-eyebrow">SCHEMATIC LIBRARY</span><h2>คลังภาพร่างประกอบ</h2><p>ภาพ SVG ที่เขียนขึ้นใหม่ ใช้อธิบายแนวคิดและประกอบการคำนวณ</p></div></div><p class="sp-note">ทั้ง 6 ภาพเป็นแผนภาพ ไม่ใช่แบบมาตรฐานกรมทางหลวง ไม่มีมิติและรายละเอียดเพียงพอสำหรับก่อสร้าง</p><div class="sp-drawing-layout"><div class="sp-drawing-grid">'+DRAWINGS.map(d=>'<button type="button" class="sp-drawing-card '+(selected===d.id?'is-active':'')+'" data-sp-select="'+d.id+'" aria-pressed="'+(selected===d.id)+'">'+sketch(d.id,d.name)+'<strong>'+d.name+'</strong><span>'+d.description+'</span></button>').join('')+'</div><section class="sp-panel sp-preview"><div class="sp-section-head"><h3>'+current().name+'</h3><button type="button" class="sp-button sp-primary" data-sp-download>'+icon('download')+'ดาวน์โหลด SVG</button></div>'+standaloneDrawing(current())+'<p class="sp-note">ดาวน์โหลดไฟล์เวกเตอร์แบบ self-contained เพื่อเปิดในเบราว์เซอร์หรือโปรแกรมเขียนภาพ</p></section></div></section>';
  }
  function onClick(event){
    const select=event.target.closest('[data-sp-select]');
    if(select){selected=select.dataset.spSelect;render();ctx.onChange();}
    if(event.target.closest('[data-sp-download]')){download('eng-app-schematic-'+selected+'.svg',standaloneDrawing(current()),'image/svg+xml;charset=utf-8');ctx.notify('ดาวน์โหลดภาพร่าง SVG แล้ว');}
  }
  container.addEventListener('click',onClick);render();
  return{getState:()=>({selected}),getReport:()=>'<section class="sp-report"><h2>ภาพร่างประกอบการอธิบาย</h2>'+standaloneDrawing(current())+'<p>เขียนขึ้นใหม่ ไม่ใช่แบบมาตรฐานหน่วยงานหรือแบบสำหรับก่อสร้าง</p></section>',destroy:()=>container.removeEventListener('click',onClick)};
}
const NOTES=[
  {title:'คอนกรีต: เริ่มจากปริมาตรจริง',subtitle:'แยกองค์ประกอบและหักส่วนซ้ำ',formula:'V = ความยาว × ความกว้าง × ความหนา',example:'พื้น 8 × 6 m หนา 0.15 m มีปริมาตร 7.20 m³ ก่อนหักช่องเปิดหรือปรับส่วนซ้ำกับคาน',body:'กำหนดขอบเขตว่าปริมาณคานนับเต็มความลึกหรือเฉพาะส่วนต่ำกว่าพื้น แล้วใช้วิธีเดียวกันทั้งโครงการ เพื่อไม่บวกคอนกรีตซ้ำ ช่องเปิดและรายละเอียดจริงต้องตรวจจากแบบ',mistake:'15 cm ต้องใช้ 0.15 m ในสูตร ไม่ใช่ 15 m และไม่ควรรวมเศษสูญเสียโดยไม่แสดงอัตราที่เลือก'},
  {title:'งานดินและชั้นทาง: ระบุสภาพปริมาตร',subtitle:'ปริมาตรแน่นเดิม หลวม และบดอัดไม่เท่ากัน',formula:'Vชั้นทาง = L × B × t',example:'ทางยาว 100 m กว้าง 6 m ชั้นวัสดุหนาหลังบดอัด 0.20 m ให้ปริมาตรหลังบดอัด 120 m³',body:'แยกแต่ละชั้นตามความหนาในแบบ ปริมาณสั่งซื้ออาจต่างจากปริมาตรหลังบดอัด หากใช้ตัวคูณปรับสภาพต้องระบุว่าคูณจากสภาพใดไปสภาพใดและอ้างอิงข้อมูลวัสดุจริง',mistake:'ไม่ใช้ตัวคูณดินหลวมแทนตัวคูณการบดอัดโดยอัตโนมัติ และไม่คิดวัสดุทุกชั้นด้วยความหนารวมเพียงค่าเดียว'},
  {title:'เหล็กเสริม: ความยาวกับน้ำหนัก',subtitle:'หน่วยของเส้นผ่านศูนย์กลางต้องชัด',formula:'น้ำหนักต่อเมตร ≈ d² / 162.2 kg/m เมื่อ d เป็น mm',example:'เหล็ก D16 หนักประมาณ 1.578 kg/m; ความยาวรวม 120 m จึงหนักประมาณ 189.4 kg ก่อนเพิ่มส่วนทาบ งอ และสูญเสีย',body:'สูตรมาจากพื้นที่วงกลมคูณความหนาแน่นเหล็กประมาณ 7,850 kg/m³ งานถอดจริงต้องนับจำนวน ความยาวตัด ระยะทาบ/งอ และรายละเอียดในแบบ ไม่ใช่เลือกอัตรา kg/m³ ค่าเดียวแล้วเรียกว่าบัญชีดัดเหล็ก',mistake:'D16 หมายถึง 16 mm ไม่ใช่ 16 cm การใช้ความยาวมาตรฐานของเส้นแทนความยาวตัดทำให้ปริมาณผิดได้'},
  {title:'BOQ: ปริมาณต้องคูณราคาหน่วยเดียวกัน',subtitle:'แยกวัสดุ ค่าแรง และรายการเพิ่ม',formula:'ต้นทุนตรง = Σ[Q × (ราคาวัสดุ/หน่วย + ค่าแรง/หน่วย)]',example:'คอนกรีต 10 m³ วัสดุ 2,500 บาท/m³ ค่าแรง 300 บาท/m³ ได้ต้นทุนตรง 28,000 บาท; ถ้าสมมติค่าจัดการ 10% เป็น 30,800 บาท ก่อนภาษี',body:'ระบุแหล่งราคา วันที่ พื้นที่ และสิ่งที่ราคาได้รวมไว้แล้ว เช่น ขนส่ง เครื่องมือ หรือค่าแรง ค่าอำนวยการ กำไร และภาษีควรแสดงฐานคำนวณแยกชัดเจน อัตราที่ใช้เป็นเงื่อนไขของงานนั้น',mistake:'ราคาเป็นบาท/ตันต้องไม่คูณปริมาณ kg โดยตรง และไม่บวกภาษีซ้ำกับราคาที่รวมภาษีแล้ว'},
  {title:'ดัชนีราคา: เข้าใจแบบจำลองก่อนใช้ Factor K',subtitle:'ดัชนีถ่วงน้ำหนักทั่วไปเป็นเพียงตัวอย่าง',formula:'Kตัวอย่าง = Σ[wi × (Ii / I0i)] โดย Σwi = 1',example:'วัสดุ A น้ำหนัก 0.60 ดัชนีเพิ่มจาก 100 เป็น 110; วัสดุ B น้ำหนัก 0.40 ดัชนีเท่าเดิม จะได้ Kตัวอย่าง = 0.60×1.10 + 0.40×1.00 = 1.06',body:'ตัวอย่างนี้อธิบายดัชนีถ่วงน้ำหนัก ไม่ใช่สูตรราชการทั้ง 35 สูตร การปรับค่าจ้างจริงขึ้นกับสูตร ฐานดัชนี งวดงาน และเงื่อนไขสัญญา ต้องตรวจเอกสารเฉพาะงานก่อน',mistake:'ไม่ใช้ K−1 คูณยอดสัญญาทั้งฉบับแล้วสรุปว่าเป็นยอดชดเชยที่มีสิทธิได้รับ'},
  {title:'วัดจากภาพ: ทวนสเกลก่อนรวมปริมาณ',subtitle:'ภาพแปลนมุมมองตรงและสเกลสม่ำเสมอ',formula:'Lจริง = Lpixel × s; Aจริง = Apixel × s²',example:'ระยะอ้างอิง 5 m ยาว 250 px ให้ s = 0.02 m/px; พื้นที่ 10,000 px² จึงเป็น 4 m²',body:'เลือกจุดอ้างอิงที่ห่างกันพอเหมาะและตรวจซ้ำกับมิติอีกแนว ภาพถ่ายเอียง มุมมอง perspective หรือภาพที่ยืดแกนไม่เท่ากันใช้สเกลค่าเดียวไม่ได้ การแปลง PDF เป็นภาพไม่ทำให้ปริมาณได้รับการยืนยันอัตโนมัติ',mistake:'การคำนวณพื้นที่ต้องใช้สเกลยกกำลังสอง และพื้นที่ m² ยังไม่ใช่ปริมาตร m³ จนกว่าจะกำหนดความหนา'}
];
function noteHTML(note){return '<article class="sp-lesson"><span class="sp-eyebrow">ESTIMATION NOTE</span><h2>'+e(note.title)+'</h2><p class="sp-lead">'+e(note.subtitle)+'</p><div class="sp-formula">'+e(note.formula)+'</div><h3>ลองแทนค่า</h3><p>'+e(note.example)+'</p><h3>นำไปใช้กับงาน</h3><p>'+e(note.body)+'</p><div class="sp-callout"><strong>จุดที่ควรตรวจ</strong><p>'+e(note.mistake)+'</p></div></article>';}
function mountGuide(container,initial,ctx){
  let selected=Number.isInteger(initial?.selected)&&initial.selected>=0&&initial.selected<NOTES.length?initial.selected:0;
  function render(){container.innerHTML='<section class="sp-workspace"><div class="sp-intro"><div><span class="sp-eyebrow">FIELD NOTES</span><h2>สมุดโน้ตงานประมาณราคา</h2><p>บทเรียนสั้นที่เขียนขึ้นใหม่ · ไม่ใช่คู่มือราคากลางราชการปี 2569</p></div></div><div class="sp-guide-layout"><nav class="sp-lesson-nav" aria-label="หัวข้อบทเรียน">'+NOTES.map((n,i)=>'<button type="button" data-sp-lesson="'+i+'" class="'+(i===selected?'is-active':'')+'" aria-current="'+(i===selected?'page':'false')+'">'+icon('book')+'<span>'+e(n.title)+'</span></button>').join('')+'</nav>'+noteHTML(NOTES[selected])+'</div></section>';}
  function onClick(event){const b=event.target.closest('[data-sp-lesson]');if(b){selected=Number(b.dataset.spLesson);render();ctx.onChange();}}
  container.addEventListener('click',onClick);render();
  return{getState:()=>({selected}),getReport:()=>'<section class="sp-report"><h1>สมุดโน้ตงานประมาณราคา</h1><p>เนื้อหาที่เขียนขึ้นใหม่เพื่อเรียนรู้ ไม่ใช่คู่มือทางราชการ</p>'+NOTES.map(noteHTML).join('')+'</section>',destroy:()=>container.removeEventListener('click',onClick)};
}
export const QUIZ_QUESTIONS=[
  {q:'พื้นขนาด 5 × 4 m หนา 0.15 m มีปริมาตรเท่าใด?',options:['3 m³','30 m³','1.5 m³','20 m³'],answer:0,explanation:'ปริมาตร = 5 × 4 × 0.15 = 3 m³ ใช้หน่วยเมตรทุกด้าน'},
  {q:'ความยาว 2,500 mm เท่ากับข้อใด?',options:['25 m','0.25 m','2.5 m','250 m'],answer:2,explanation:'1,000 mm = 1 m จึงหาร 2,500 ด้วย 1,000'},
  {q:'แรง 100 kN กระจายสม่ำเสมอบนพื้นที่ 2 m² ให้แรงดันเท่าใด?',options:['200 kPa','50 kPa','100 kPa','2 kPa'],answer:1,explanation:'แรงดัน = แรง/พื้นที่ = 100/2 = 50 kN/m² = 50 kPa'},
  {q:'คานรองรับอย่างง่ายรับน้ำหนักแผ่ w=10 kN/m ช่วง L=4 m มีโมเมนต์สูงสุดเท่าใด?',options:['10 kN·m','40 kN·m','80 kN·m','20 kN·m'],answer:3,explanation:'สำหรับกรณีรองรับสองปลายและน้ำหนักแผ่เต็มช่วง Mmax = wL²/8 = 10×16/8 = 20 kN·m'},
  {q:'วัสดุ 8 m³ ราคา 2,000 บาท/m³ และค่าแรง 250 บาท/m³ มีต้นทุนตรงเท่าใด?',options:['16,250 บาท','18,000 บาท','16,000 บาท','20,000 บาท'],answer:1,explanation:'8 × (2,000 + 250) = 18,000 บาท ก่อนรายการเพิ่มอื่น'},
  {q:'เมื่อสเกลภาพเปลี่ยนจาก 0.01 เป็น 0.02 m/pixel พื้นที่จริงจากรูปเดิมเปลี่ยนอย่างไร?',options:['เพิ่ม 2 เท่า','เท่าเดิม','เพิ่ม 4 เท่า','ลดครึ่งหนึ่ง'],answer:2,explanation:'พื้นที่คูณด้วยสเกลยกกำลังสอง อัตราส่วนจึงเป็น (0.02/0.01)² = 4'},
  {q:'แรงดันน้ำสถิตที่ลึก 2 m ใช้ γw=9.81 kN/m³ มีค่าประมาณเท่าใด?',options:['19.62 kPa','9.81 kPa','4.905 kPa','39.24 kPa'],answer:0,explanation:'p = γw h = 9.81×2 = 19.62 kPa ไม่ต้องคูณสัมประสิทธิ์แรงดันดิน'},
  {q:'เส้นทางวิกฤตใน CPM ที่ไม่มีข้อจำกัดทรัพยากรหมายถึงข้อใด?',options:['งานที่ใช้งบสูงสุดเท่านั้น','งานที่เริ่มก่อนทุกงาน','งานที่ใช้คนมากที่สุด','เส้นทางกิจกรรมที่กำหนดระยะเวลาโครงการ'],answer:3,explanation:'เส้นทางที่ใช้เวลารวมยาวที่สุดตามเครือข่ายกำหนดระยะเวลาแล้วเสร็จ กิจกรรมบนเส้นทางมี total float เป็นศูนย์ในกรณีมาตรฐาน'},
  {q:'ฐานกว้าง B=3 m รับแรงเยื้องศูนย์หนึ่งแกน ขอบ middle third อยู่ที่ |e| เท่าใด?',options:['1.5 m','0.5 m','1.0 m','3.0 m'],answer:1,explanation:'เกณฑ์สัมผัสเต็มฐานในแบบจำลองเชิงเส้นคือ |e| ≤ B/6 = 3/6 = 0.5 m'},
  {q:'คำนวณเหล็กจาก kg/m³ เพียงค่าเดียวแล้วคูณปริมาตรคอนกรีต ควรเรียกผลว่าอะไร?',options:['บัญชีดัดเหล็กครบถ้วน','แบบเหล็กสำหรับก่อสร้าง','ประมาณการตามอัตราสมมติ','ผลตรวจเหล็กตามมาตรฐาน'],answer:2,explanation:'เป็นวิธีประมาณเบื้องต้น ยังไม่ทราบความยาวตัด ระยะทาบ งอ จำนวนและตำแหน่งเหล็กจากแบบจริง'},
  {q:'ภาพถ่ายแบบเอียงมี perspective ควรทำอย่างไรก่อนวัดพื้นที่ด้วยสเกลเดียว?',options:['ใช้สเกลจากด้านใดก็ได้ทันที','คูณพื้นที่ด้วย 2','เพิ่มความหนาวัสดุ','ใช้ภาพฉายตรงหรือแก้ perspective และตรวจสเกลก่อน'],answer:3,explanation:'ภาพเอียงทำให้สเกลเปลี่ยนไปตามตำแหน่ง ภาพฉายตรงที่สเกลคงที่เหมาะกับการวัดแบบนี้'},
  {q:'ผลตรวจแรงดัดคานผ่านเพียงรายการเดียว บอกอะไรได้?',options:['กำลังดัดผ่านเฉพาะแบบจำลองและข้อมูลที่ตรวจ','คานผ่านทุกมาตรฐานแล้ว','ไม่ต้องตรวจแรงเฉือน','อนุมัติก่อสร้างได้ทันที'],answer:0,explanation:'ยังต้องตรวจแรงเฉือน การโก่ง รอยร้าว รายละเอียดเหล็ก การยึดเหนี่ยว และเงื่อนไขอื่นที่เกี่ยวข้อง'}
];
export function scoreQuiz(answers){
  if(!Array.isArray(answers)||answers.length!==QUIZ_QUESTIONS.length)throw new Error('คำตอบต้องมี 12 ช่อง');
  if(answers.some(a=>a!==null&&(!Number.isInteger(a)||a<0||a>3)))throw new Error('ตัวเลือกคำตอบไม่ถูกต้อง');
  return {score:answers.reduce((sum,a,i)=>sum+(a===QUIZ_QUESTIONS[i].answer?1:0),0),answered:answers.filter(a=>a!==null).length,total:QUIZ_QUESTIONS.length};
}
function mountQuiz(container,initial,ctx){
  let answers=Array(12).fill(null),submitted=false;
  if(initial?.answers){try{scoreQuiz(initial.answers);answers=[...initial.answers];submitted=initial.submitted===true;}catch(error){ctx.notify(error.message);}}
  function render(){
    const s=scoreQuiz(answers);
    container.innerHTML='<section class="sp-workspace"><div class="sp-intro"><div><span class="sp-eyebrow">ENGINEERING PRACTICE</span><h2>ทบทวนพื้นฐานวิศวกรรม</h2><p>12 ข้อที่แต่งขึ้นใหม่ พร้อมวิธีคิด · ไม่ใช่คลังข้อสอบจริงของหน่วยงาน</p></div><div class="sp-quiz-score" aria-live="polite">'+(submitted?'<strong>'+s.score+' / 12</strong><span>คะแนนของคุณ</span>':'<strong class="sp-answer-count">'+s.answered+' / 12</strong><span>ข้อที่ตอบแล้ว</span>')+'</div></div><div class="sp-quiz-list">'+QUIZ_QUESTIONS.map((q,i)=>'<fieldset class="sp-question"><legend><span class="sp-question-number">'+(i+1)+'</span>'+e(q.q)+'</legend><div class="sp-options">'+q.options.map((option,j)=>'<label class="sp-option '+(submitted?(j===q.answer?'sp-correct':j===answers[i]?'sp-wrong':''):'')+'"><input type="radio" name="sp-question-'+i+'" data-sp-question="'+i+'" value="'+j+'" '+(answers[i]===j?'checked':'')+'><span class="sp-option-letter">'+String.fromCharCode(65+j)+'</span><span>'+e(option)+'</span></label>').join('')+'</div>'+(submitted?'<div class="sp-explanation"><strong>'+(answers[i]===q.answer?'ตอบถูก':answers[i]===null?'ยังไม่ได้ตอบ':'คำตอบที่ถูกคือ '+String.fromCharCode(65+q.answer))+'</strong><p>'+e(q.explanation)+'</p></div>':'')+'</fieldset>').join('')+'</div><div class="sp-quiz-actions"><button type="button" class="sp-button sp-primary" data-sp-submit>'+icon('check')+(submitted?'ตรวจคะแนนอีกครั้ง':'ตรวจคะแนนและดูวิธีคิด')+'</button><button type="button" class="sp-button" data-sp-reset>เริ่มใหม่</button><span>ข้อที่ไม่ตอบได้ 0 คะแนน</span></div></section>';
  }
  function onChange(event){const input=event.target.closest('[data-sp-question]');if(!input)return;answers[Number(input.dataset.spQuestion)]=Number(input.value);if(submitted){submitted=false;render();}else container.querySelector('.sp-answer-count').textContent=scoreQuiz(answers).answered+' / 12';ctx.onChange();}
  function onClick(event){if(event.target.closest('[data-sp-submit]')){submitted=true;render();ctx.onChange();ctx.notify('ได้ '+scoreQuiz(answers).score+' จาก 12 คะแนน ดูวิธีคิดใต้แต่ละข้อได้เลย');}if(event.target.closest('[data-sp-reset]')){answers=Array(12).fill(null);submitted=false;render();ctx.onChange();}}
  container.addEventListener('change',onChange);container.addEventListener('click',onClick);render();
  return{getState:()=>({answers:[...answers],submitted}),getReport:()=>'<section class="sp-report"><h2>แบบฝึกหัดพื้นฐานวิศวกรรม</h2><p>ข้อสอบที่แต่งขึ้นใหม่ 12 ข้อ · '+(submitted?'คะแนน '+scoreQuiz(answers).score+' / 12':'ยังไม่ตรวจคะแนน')+'</p>'+QUIZ_QUESTIONS.map((q,i)=>'<section><h3>'+(i+1)+'. '+e(q.q)+'</h3><p>คำตอบ: '+(answers[i]===null?'ยังไม่ตอบ':e(q.options[answers[i]]))+'</p>'+(submitted?'<p>เฉลย: '+e(q.options[q.answer])+'</p><p>'+e(q.explanation)+'</p>':'')+'</section>').join('')+'</section>',destroy:()=>{container.removeEventListener('change',onChange);container.removeEventListener('click',onClick);}};
}
export function mountSpecial(container,toolId,initialState=null,context={}){
  const ctx={onChange:typeof context.onChange==='function'?context.onChange:()=>{},notify:typeof context.notify==='function'?context.notify:()=>{}};
  const mounts={'drawing-takeoff':mountTakeoff,drawings:mountDrawings,guide:mountGuide,quiz:mountQuiz};
  if(!mounts[toolId])throw new Error('ไม่พบเครื่องมือพิเศษ');
  return mounts[toolId](container,initialState,ctx);
}
