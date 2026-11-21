import {finite as n,format as f} from './utils.js';

const field=(key,label,unit,value,min,max,step=0.01)=>({key,label,unit,default:value,min,max,step});
const group=(title,fields)=>({title,fields});
const metric=(label,value,unit)=>({label,value,unit});

export function buildingQuantity(p) {
 const L=n(p.length,'ความยาว / ความสูง',{min:.01,max:1000}),b=n(p.width,'ความกว้าง',{min:.01,max:1000}),h=n(p.depth,'ความลึก / ความหนา',{min:.01,max:100}),count=n(p.count,'จำนวน',{min:1,max:100000,integer:true});
 const steel=n(p.steelRatio,'อัตราเหล็กประมาณการ',{min:0,max:1000}),waste=n(p.allowance,'เผื่อคอนกรีต',{min:0,max:50});
 if(!['beam','column','slab'].includes(p.element))throw new Error('เลือกชนิดชิ้นส่วนให้ถูกต้อง');
 const volume=L*b*h*count;
 const formwork=(p.element==='beam'?(2*h+b)*L:p.element==='column'?2*(b+h)*L:L*b)*count;
 return {volume,order:volume*(1+waste/100),formwork,steel:volume*steel};
}
export function roadQuantity(p) {
 const L=n(p.length,'ความยาวถนน',{min:.01,max:100000}),W=n(p.width,'ความกว้าง',{min:.1,max:100}),base=n(p.base,'ความหนาพื้นทาง',{min:0,max:3}),sub=n(p.subbase,'ความหนารองพื้นทาง',{min:0,max:3}),surface=n(p.surface,'ความหนาผิวทาง',{min:0,max:1}),density=n(p.density,'ความหนาแน่นผิวทาง',{min:.1,max:5});
 const loose=n(p.looseFactor,'ตัวคูณปริมาตรหลวม',{min:1,max:3});
 return {area:L*W,base:L*W*base,subbase:L*W*sub,surface:L*W*surface,asphaltMass:L*W*surface*density,looseBase:L*W*base*loose};
}
export function canalQuantity(p) {
 const b=n(p.bottom,'กว้างท้องคลอง',{min:.01,max:1000}),d=n(p.depth,'ความลึก',{min:.01,max:100}),z=n(p.slope,'ลาดข้าง z:1',{min:0,max:10}),L=n(p.length,'ความยาว',{min:.01,max:100000}),t=n(p.thickness,'ความหนาดาด',{min:0,max:1});
 const A=b*d+z*d*d,P=b+2*d*Math.sqrt(1+z*z);
 return {area:A,top:b+2*z*d,excavation:A*L,liningArea:P*L,concrete:P*L*t};
}
export function weightedIndex(p) {
 const w=['fixed','labor','cement','steel'].map(k=>n(p[k],`น้ำหนัก ${k}`,{min:0,max:1}));
 if(Math.abs(w.reduce((a,b)=>a+b,0)-1)>1e-8)throw new Error('ผลรวมน้ำหนักคงที่ + แรงงาน + ปูน + เหล็ก ต้องเท่ากับ 1.000');
 const names=['labor','cement','steel'];
 const ratios=names.map(k=>n(p[k+'Now'],`ดัชนีปัจจุบัน ${k}`,{min:.001,max:1000000})/n(p[k+'Base'],`ดัชนีฐาน ${k}`,{min:.001,max:1000000}));
 const K=w[0]+ratios.reduce((sum,r,i)=>sum+w[i+1]*r,0);
 const amount=n(p.amount,'มูลค่างาน',{min:0,max:1e12});
 return {K,ratios,adjusted:amount*K,difference:amount*(K-1)};
}

export const quantityTools={
 'quantity-building':{
  id:'quantity-building',title:'ถอดปริมาณงานอาคาร',description:'ปริมาณเรขาคณิตของชิ้นส่วนหน้าตัดคงที่',
  inputGroups:[group('ชนิดและขนาด',[{key:'element',label:'ชนิดชิ้นส่วน',type:'select',default:'beam',options:[{value:'beam',label:'คาน — แบบท้องและสองข้าง'},{value:'column',label:'เสา — แบบสี่ด้าน'},{value:'slab',label:'พื้น — แบบท้องพื้น'}]},field('length','ความยาว / ความสูง','ม.',6,.01,1000),field('width','ความกว้าง','ม.',.3,.01,1000),field('depth','ความลึก / ความหนา','ม.',.6,.01,100),field('count','จำนวนชิ้น','ชิ้น',4,1,100000,1)]),group('ประมาณการวัสดุ',[field('steelRatio','อัตราเหล็กประมาณการ','กก./ลบ.ม.',120,0,1000,1),field('allowance','เผื่อคอนกรีตสั่งซื้อ','%',3,0,50,.5)])],
  assumptions:['ชิ้นส่วนทรงสี่เหลี่ยม หน้าตัดคงที่ ไม่หักรอยต่อและช่องเปิด','คาน: แบบท้องและสองข้าง ไม่รวมหน้าปิดหัว; เสา: แบบสี่ด้าน; พื้น: เฉพาะท้องพื้น','เหล็กจากอัตรา กก./ลบ.ม. เป็นค่าเผื่อประมาณราคา ไม่ใช่ BBS หรือการออกแบบเหล็ก'],references:[],
  calculate(p){const r=buildingQuantity(p);return {summary:[metric('คอนกรีตสุทธิ',r.volume,'ลบ.ม.'),metric('พื้นที่แบบหล่อ',r.formwork,'ตร.ม.'),metric('เหล็กประมาณการ',r.steel,'กก.')],checks:[],steps:[{title:'ปริมาตรคอนกรีต',formula:'V = L × b × h × จำนวน',result:`${f(r.volume,3)} ลบ.ม.`},{title:'คอนกรีตสั่งซื้อ',formula:'Vorder = V × (1 + เผื่อ / 100)',result:`${f(r.order,3)} ลบ.ม.`},{title:'พื้นที่แบบหล่อ',formula:p.element==='beam'?'A = (2h + b) × L × จำนวน':p.element==='column'?'A = 2(b + h) × L × จำนวน':'A = L × b × จำนวน',result:`${f(r.formwork,3)} ตร.ม.`},{title:'ปริมาณเหล็กประมาณการ',formula:'Wsteel = Vสุทธิ × อัตราเหล็กที่กรอก',result:`${f(r.steel,2)} กก.`}],notes:['ตรวจรอยต่อคาน–เสาและพื้นก่อนรวมปริมาณหลายชิ้น เพื่อไม่ให้นับคอนกรีตซ้ำ'],values:r};}
 },
 'quantity-road':{
  id:'quantity-road',title:'ถอดปริมาณงานทาง',description:'ชั้นทางสี่เหลี่ยมผืนผ้าและความหนาคงที่',
  inputGroups:[group('ขนาดถนน',[field('length','ความยาว','ม.',100,.01,100000,1),field('width','ความกว้าง','ม.',7,.1,100,.1)]),group('ชั้นทาง',[field('subbase','หนารองพื้นทาง','ม.',.2,0,3),field('base','หนาพื้นทาง','ม.',.15,0,3),field('surface','หนาผิวทาง','ม.',.05,0,1),field('density','ความหนาแน่นผิวทาง','ตัน/ลบ.ม.',2.4,.1,5),field('looseFactor','ตัวคูณพื้นทางหลวม','เท่า',1.2,1,3)])],
  assumptions:['ความหนาตั้งฉากแนวดิ่ง ใช้ความกว้างเดียวกันทุกชั้นตลอดแนว','ไม่รวมไหล่ทาง ความลาดโค้ง งานขุดถม และการเผื่อก่อสร้าง','ความหนาแน่นและตัวคูณปริมาตรหลวมเป็นตัวอย่าง ต้องแทนด้วยผลทดสอบวัสดุ'],references:[],
  calculate(p){const r=roadQuantity(p);return {summary:[metric('พื้นที่ถนน',r.area,'ตร.ม.'),metric('ปริมาตรผิวทาง',r.surface,'ลบ.ม.'),metric('น้ำหนักผิวทาง',r.asphaltMass,'ตัน')],checks:[],table:{headers:['รายการ','ปริมาณ','หน่วย'],rows:[['รองพื้นทางบดอัด',f(r.subbase),'ลบ.ม.'],['พื้นทางบดอัด',f(r.base),'ลบ.ม.'],['พื้นทางก่อนบดอัด (ประมาณ)',f(r.looseBase),'ลบ.ม.'],['ผิวทาง',f(r.surface),'ลบ.ม.']]},steps:[{title:'ปริมาตรแต่ละชั้น',formula:'V = ความยาว × ความกว้าง × ความหนา',result:`พื้นทาง ${f(r.base)} ลบ.ม.`},{title:'น้ำหนักวัสดุผิวทาง',formula:'W = Vผิวทาง × ความหนาแน่น',result:`${f(r.asphaltMass)} ตัน`}],notes:['ปริมาตรหลวมกับปริมาตรบดอัดเป็นคนละฐานวัด ต้องระบุใน BOQ ให้ตรงกัน'],values:r};}
 },
 'quantity-canal':{
  id:'quantity-canal',title:'ถอดปริมาณคลอง',description:'หน้าตัดคลองสี่เหลี่ยมคางหมู',
  inputGroups:[group('หน้าตัดคลอง',[field('bottom','กว้างท้องคลอง','ม.',2,.01,1000),field('depth','ความลึก','ม.',1.5,.01,100),field('slope','ลาดข้าง z:1 (แนวนอน:แนวตั้ง)','',1.5,0,10,.1),field('length','ความยาวคลอง','ม.',100,.01,100000,1),field('thickness','ความหนาคอนกรีตดาด','ม.',.1,0,1)])],
  assumptions:['ขนาดที่กรอกคือรูปตัดขุดก่อนเผื่อพื้นที่คอนกรีตดาดและวัสดุชั้นรอง ต้องปรับรูปตัดขุดจริงให้รวมส่วนนี้เอง','คอนกรีตดาดประมาณแบบผิวบาง: ความยาวผิวด้านใน × ความหนา','ไม่รวมคอนกรีตหนาที่มุม รอยต่อ คานขอบ และอาคารชลประทาน'],references:[],
  calculate(p){const r=canalQuantity(p);return {summary:[metric('ปริมาตรคลองก่อนเผื่อดาด',r.excavation,'ลบ.ม.'),metric('พื้นที่ดาดคลอง',r.liningArea,'ตร.ม.'),metric('คอนกรีตดาดประมาณ',r.concrete,'ลบ.ม.')],checks:[],steps:[{title:'ความกว้างปากคลอง',formula:'T = b + 2zd',result:`${f(r.top)} ม.`},{title:'พื้นที่หน้าตัดขุด',formula:'A = bd + zd²',result:`${f(r.area)} ตร.ม.`},{title:'ปริมาตรดินขุด',formula:'V = A × L',result:`${f(r.excavation)} ลบ.ม.`},{title:'ผิวดาดคลอง',formula:'S = [b + 2d√(1 + z²)] × L',result:`${f(r.liningArea)} ตร.ม.`},{title:'คอนกรีตดาดแบบผิวบาง',formula:'Vc ≈ S × t',result:`${f(r.concrete)} ลบ.ม.`}],notes:['ปริมาตรคอนกรีตเป็นการประมาณผิวบาง ไม่ใช่ผลต่างพื้นที่รูปตัดชั้นใน–ชั้นนอกที่มุม'],values:r};}
 },
 'factor-k':{
  id:'factor-k',title:'ดัชนีปรับราคางานก่อสร้าง',description:'ดัชนีถ่วงน้ำหนักที่ผู้ใช้กำหนดเอง',
  inputGroups:[group('มูลค่าและน้ำหนัก (รวม = 1)',[field('amount','มูลค่างานฐาน','บาท',1000000,0,1e12,1000),field('fixed','ส่วนคงที่ a','',.15,0,1),field('labor','น้ำหนักแรงงาน b','',.25,0,1),field('cement','น้ำหนักปูน c','',.35,0,1),field('steel','น้ำหนักเหล็ก d','',.25,0,1)]),group('ดัชนีที่กรอกเอง',[field('laborBase','แรงงาน — เดือนฐาน','',100,.001,1e6),field('laborNow','แรงงาน — เดือนปัจจุบัน','',105,.001,1e6),field('cementBase','ปูน — เดือนฐาน','',100,.001,1e6),field('cementNow','ปูน — เดือนปัจจุบัน','',108,.001,1e6),field('steelBase','เหล็ก — เดือนฐาน','',100,.001,1e6),field('steelNow','เหล็ก — เดือนปัจจุบัน','',112,.001,1e6)])],
  assumptions:['สูตรทั่วไป K = a + b(L/L₀) + c(C/C₀) + d(S/S₀) โดย a+b+c+d=1','ค่าตั้งต้นเป็นตัวเลขสาธิต ไม่ได้เชื่อมดัชนีราคาแบบสด','ผลต่างดัชนีไม่ใช่ยอดชดเชยตามสัญญา: ยังไม่มีเกณฑ์ ±4% สูตรเฉพาะสัญญา ระยะเวลา และเงื่อนไขการเบิก'],references:[],
  calculate(p){const r=weightedIndex(p);return {summary:[{label:'ดัชนีถ่วงน้ำหนัก K',value:r.K,unit:'',digits:5},metric('มูลค่าตามดัชนี',r.adjusted,'บาท'),metric('ส่วนต่างตามดัชนี',r.difference,'บาท')],checks:[{label:'น้ำหนักรวม 1.000',pass:true,detail:'ส่วนคงที่และน้ำหนักวัสดุรวมครบหนึ่ง'}],steps:[{title:'ดัชนีถ่วงน้ำหนัก',formula:'K = a + b(L/L₀) + c(C/C₀) + d(S/S₀)',substitution:`${p.fixed} + ${p.labor}(${p.laborNow}/${p.laborBase}) + ${p.cement}(${p.cementNow}/${p.cementBase}) + ${p.steel}(${p.steelNow}/${p.steelBase})`,result:f(r.K,5)},{title:'ส่วนต่างตามดัชนี',formula:'Δ = มูลค่างานฐาน × (K − 1)',result:`${f(r.difference)} บาท`}],notes:['เพื่อทดลองความไวของราคาและตรวจเลขเท่านั้น ต้องตรวจสูตรและดัชนีตามสัญญาก่อนคิดเงินชดเชย'],values:r};}
 }
};
