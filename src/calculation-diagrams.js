import {sketch} from './visuals.js';
import {format as f,escapeHTML as e} from './utils.js';

let figureSequence=0;
const number=value=>typeof value==='number'&&Number.isFinite(value);
const valid=(value,keys)=>value&&keys.every(key=>number(value[key]));
const n=value=>e(f(value));
const coordinate=value=>Number(value.toFixed(4));
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const line=(x1,y1,x2,y2,cls='technical-line')=>`<path class="${cls}" d="M${coordinate(x1)} ${coordinate(y1)}L${coordinate(x2)} ${coordinate(y2)}"/>`;
const label=(x,y,text,cls='technical-label',anchor='start')=>`<text class="${cls}" x="${coordinate(x)}" y="${coordinate(y)}" text-anchor="${anchor}">${e(text)}</text>`;
const tag=(label,value,unit='')=>`<div><dt>${e(label)}</dt><dd>${n(value)}${unit?` <small>${e(unit)}</small>`:''}</dd></div>`;
const head=(code,title)=>`<div class="technical-sheet-head"><span>${e(code)}</span><strong>${e(title)}</strong><span class="technical-live">FROM INPUTS</span></div>`;
const dimHorizontal=(x1,x2,y,text)=>line(x1,y,x2,y,'technical-dimension')+line(x1,y-4,x1,y+4,'technical-dimension')+line(x2,y-4,x2,y+4,'technical-dimension')+label((x1+x2)/2,y-8,text,'technical-label','middle');
const dimVertical=(x,y1,y2,text)=>line(x,y1,x,y2,'technical-dimension')+line(x-4,y1,x+4,y1,'technical-dimension')+line(x-4,y2,x+4,y2,'technical-dimension')+label(x-10,(y1+y2)/2+4,text,'technical-label','end');
const arrowDown=(x,y1,y2,cls='technical-force')=>`<path class="${cls}" d="M${coordinate(x)} ${coordinate(y1)}V${coordinate(y2)}m-4-6 4 6 4-6"/>`;

export function engineeringFigureCaption(id,p={}) {
 if(id==='rc-beam')return `b = ${f(p.b)} mm · d = ${f(p.d)} mm ถึงศูนย์กลางเหล็กดึง · ${f(p.count,0)} DB ${f(p.diameter)} · ไม่กำหนด h / cover และไม่ใช่แบบจัดเหล็ก`;
 if(id==='rc-slab')return `แถบคำนวณ 1,000 mm · d = ${f(p.d)} mm ถึงศูนย์กลางเหล็กดึง · DB ${f(p.diameter)} @ ${f(p.spacing)} mm · ไม่กำหนด h / cover และไม่ใช่แบบจัดเหล็ก`;
 if(id==='retaining-wall')return `H = ${f(p.height)} m เหนือหลังฐาน · B = ${f(p.width)} m · ระดับน้ำวัดจากใต้ฐาน · กราฟแสดงแรงดันด้านข้างรวม`;
 if(id==='footing')return `B × L = ${f(p.width)} × ${f(p.length)} m · N = ${f(p.normal)} kN · M = ${f(p.moment)} kN·m · กราฟแรงกดมีสเกลแยกจากรูปฐาน`;
 return 'ภาพร่างไม่ใช่แบบก่อสร้างและไม่ได้อิงมาตราส่วน';
}

function flexureFigure(id,p,v,uid) {
 const slab=id==='rc-slab',width=slab?1000:p.b;
 const scale=Math.min(205/width,158/p.d),drawWidth=width*scale,drawDepth=p.d*scale;
 const left=(330-drawWidth)/2,top=68,right=left+drawWidth,steelY=top+drawDepth;
 const barRadius=clamp(p.diameter*scale/2,1.3,7);
 const barCoordinates=slab?Array.from({length:Math.ceil(1000/p.spacing)},(_,i)=>left+(i+.5)*p.spacing*scale).filter(x=>x<right):Array.from({length:p.count},(_,i)=>left+drawWidth*(i+1)/(p.count+1));
 const spacingGuide=slab&&barCoordinates.length>1?dimHorizontal(barCoordinates[Math.floor((barCoordinates.length-2)/2)],barCoordinates[Math.floor((barCoordinates.length-2)/2)+1],Math.min(245,steelY+57),`s = ${f(p.spacing)} mm`):'';
 const schematicBars=barCoordinates.map(x=>`<circle class="technical-steel" cx="${coordinate(x)}" cy="${coordinate(steelY)}" r="${coordinate(slab?barRadius:Math.min(barRadius,drawWidth/(p.count+1)*.32))}"/>`).join('');
 // Only b and d are known. The open break below the centroid does not invent h or cover.
 const bottom=steelY+18;
 const section=`<svg class="technical-section" viewBox="0 0 330 300" role="img" aria-label="${slab?'แถบพื้นกว้างหนึ่งเมตรและระยะเหล็ก':'หน้าตัดคาน ความกว้าง และแนวศูนย์กลางเหล็กดึง'}"><title>${slab?'แถบคำนวณพื้น':'หน้าตัดคำนวณคาน'} — d วัดถึงศูนย์กลางเหล็กดึง</title><defs><clipPath id="${uid}-bars"><rect x="${coordinate(left)}" y="${coordinate(steelY-10)}" width="${coordinate(drawWidth)}" height="20"/></clipPath></defs><rect class="technical-concrete-fill" x="${coordinate(left)}" y="${top}" width="${coordinate(drawWidth)}" height="${coordinate(drawDepth+18)}"/><path class="technical-concrete-edge" d="M${coordinate(left)} ${coordinate(bottom)}V${top}H${coordinate(right)}V${coordinate(bottom)}"/><path class="technical-break" d="M${coordinate(left-4)} ${coordinate(bottom-4)}l8 5-8 5 M${coordinate(right-4)} ${coordinate(bottom-4)}l8 5-8 5"/>${line(left-10,steelY,right+10,steelY,'technical-centroid')}${dimHorizontal(left,right,43,slab?'b = 1,000 mm':`b = ${f(width)} mm`)}${dimVertical(40,top,steelY,'d')}${line(45,top,left-5,top,'technical-extension')}${line(45,steelY,left-5,steelY,'technical-extension')}<g clip-path="url(#${uid}-bars)" data-bar-symbols="${barCoordinates.length}">${schematicBars}</g>${spacingGuide}${label(165,274,`d = ${f(p.d)} mm · ${slab?`DB ${f(p.diameter)} @ ${f(p.spacing)}`:`${f(p.count,0)} DB ${f(p.diameter)}`}`,'technical-label','middle')}</svg>`;
 const inScope=v.tensionControlled===true&&valid(v,['a','c','strain'])&&v.a>=0&&v.c>=0&&v.c<p.d;
 const stressScale=158/p.d,stressTop=68,stressBottom=226;
 const stress=inScope?`<svg class="technical-section" viewBox="0 0 330 300" role="img" aria-label="ความลึกแรงอัดสมมูล a และแนวแกนสะเทิน c จากแบบจำลอง"><title>แรงอัดสมมูลและแกนสะเทินจากผลคำนวณ</title><rect class="technical-compression" x="80" y="${stressTop}" width="80" height="${coordinate(v.a*stressScale)}"/>${line(80,stressTop,80,stressBottom,'technical-axis')}${line(70,stressTop+v.c*stressScale,192,stressTop+v.c*stressScale,'technical-neutral-axis')}${line(70,stressBottom,192,stressBottom,'technical-centroid')}${label(210,90,`a = ${f(v.a)} mm`)}${label(210,118,`c = ${f(v.c)} mm`)}${line(160,stressTop+v.a*stressScale,198,90,'technical-extension')}${line(192,stressTop+v.c*stressScale,198,115,'technical-extension')}${label(203,230,'แนวเหล็กดึง','technical-note')}${label(165,274,`εt = ${f(v.strain,6)}`,'technical-label','middle')}</svg>`:`<div class="technical-outside"><span>MODEL LIMIT</span><strong>นอกช่วงที่รองรับ</strong><p>ไม่แสดงบล็อกแรงอัดเป็นผลออกแบบ เมื่อหน้าตัดไม่ผ่านเกณฑ์ความเครียด</p><small>εt = ${e(f(v.strain,6))} · เกณฑ์ ${e(f(v.strainLimit,6))}</small></div>`;
 return `<div class="technical-sheet" data-diagram="${id}">${head(slab?'STR / 02':'STR / 01',slab?'แถบพื้นและแรงอัดสมมูล':'หน้าตัดและแรงอัดสมมูล')}<div class="technical-grid"><section class="technical-panel"><h4>01 <span>${slab?'แถบคำนวณกว้าง 1 เมตร':'รูปทรงและแนวเหล็กดึง'}</span></h4>${section}<p>ขอบล่างเปิดไว้: ไม่ทราบ h และระยะหุ้ม${slab?' · สัญลักษณ์ซ้ำตาม s ไม่ใช่จำนวนเหล็กเต็มต่อแถบ':' · ตำแหน่งเหล็กเป็นสัญลักษณ์ ไม่ตรวจระยะเรียงหรือจำนวนชั้น'}</p></section><section class="technical-panel"><h4>02 <span>ผลของแบบจำลองหน้าตัด</span></h4>${stress}<p>${inScope?'ความลึก a และ c เทียบกับ d; ความกว้างบล็อกแรงอัดเป็นสัญลักษณ์':'ตรวจสมมติฐานและขอบเขตก่อนนำค่ากำลังไปใช้'}</p></section></div><dl class="technical-data">${tag('ความลึกประสิทธิผล d',p.d,'mm')}${tag('เหล็กดึง As',v.steelArea,slab?'mm²/m':'mm²')}${tag('คอนกรีต f′c',p.fc,'MPa')}${tag('เหล็ก fy',p.fy,'MPa')}</dl><div class="technical-legend"><span><i class="technical-key concrete"></i>คอนกรีต</span><span><i class="technical-key steel"></i>เหล็กดึง</span><span><i class="technical-key compression"></i>บล็อกแรงอัดสมมูล</span><span>รูปสื่อสารแบบจำลอง · ไม่ใช่แบบก่อสร้าง</span></div></div>`;
}

function wallFigure(p,v,uid) {
 const D=p.height+p.base,scale=Math.min(210/D,300/p.width),left=100,bottom=282,baseY=bottom-p.base*scale,stemX=left+p.toe*scale,stemR=stemX+p.stem*scale,right=left+p.width*scale,top=bottom-D*scale,far=right+85,waterY=bottom-p.waterHeight*scale;
 const pressure=y=>{const depth=D-(bottom-y)/scale;const dryDepth=Math.min(depth,D-p.waterHeight),wetDepth=Math.max(0,depth-(D-p.waterHeight));return v.ka*(p.surcharge+p.gammaDry*dryDepth+(p.gammaSat-9.81)*wetDepth)+9.81*wetDepth;};
 const pressureMax=pressure(bottom),pressureScale=pressureMax>0?65/pressureMax:0;
 const middle=clamp(waterY,top,bottom);
 const pressurePolygon=`${far},${top} ${far+pressure(top)*pressureScale},${top} ${far+pressure(middle)*pressureScale},${middle} ${far+pressure(bottom)*pressureScale},${bottom} ${far},${bottom}`;
 const soil=`M${stemR} ${top}H${far}V${bottom}H${right}V${baseY}H${stemR}Z`;
 const water=p.waterHeight>0?(waterY>=baseY?`M${right} ${waterY}H${far}V${bottom}H${right}Z`:`M${stemR} ${waterY}H${far}V${bottom}H${right}V${baseY}H${stemR}Z`):'';
 const heelLoad=p.heelSurcharge>0?[.2,.5,.8].map(fraction=>arrowDown(stemR+(right-stemR)*fraction,top-25,top-5)).join(''):'';
 return `<div class="technical-sheet" data-diagram="retaining-wall">${head('GEO / 01','หน้าตัดและแรงดันด้านข้างรวม')}<svg class="live-diagram technical-wide" viewBox="0 0 620 340" role="img" aria-label="หน้าตัดกำแพง แรงดันดินและน้ำรวม และระดับน้ำวัดจากใต้ฐาน"><title>แรงดันรวมลึก H + ความหนาฐาน; H วัดเหนือหลังฐาน</title><defs><pattern id="${uid}-soil" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v10" stroke="#c7c6af" stroke-width="1"/></pattern></defs><path d="${soil}" fill="url(#${uid}-soil)"/>${heelLoad}${water?`<path d="${water}" class="technical-water-fill"/>${line(waterY>=baseY?right:stemR,waterY,far,waterY,'technical-waterline')}${label(far-7,Math.max(top+14,waterY-8),'WL','technical-water-label','end')}`:''}<path class="technical-concrete-solid" d="M${left} ${baseY}h${p.width*scale}v${p.base*scale}H${left}Z M${stemX} ${top}h${p.stem*scale}V${baseY}h${-p.stem*scale}Z"/>${line(60,bottom,far+75,bottom,'technical-axis')}<polygon class="technical-pressure" points="${pressurePolygon}"/>${dimHorizontal(left,right,315,`B = ${f(p.width)} m`)}${dimVertical(70,top,baseY,'H')}${line(75,top,stemX-5,top,'technical-extension')}${line(75,baseY,left-5,baseY,'technical-extension')}${label(28,top-14,`H = ${f(p.height)} m`)}${label(far+32,Math.max(25,top-15),'p(z)','technical-label','middle')}${label(far+30,bottom+22,`${f(pressureMax)} kPa`,'technical-pressure-label','middle')}</svg><dl class="technical-data">${tag('ดินเหนือหลังฐาน H',p.height,'m')}${tag('ระดับน้ำจากใต้ฐาน',p.waterHeight,'m')}${tag('q ด้านข้าง',p.surcharge,'kPa')}${tag('q แนวดิ่งเหนือ heel',p.heelSurcharge,'kPa')}</dl><div class="technical-legend"><span><i class="technical-key concrete"></i>คอนกรีต</span><span><i class="technical-key water"></i>น้ำหลังผนัง</span><span><i class="technical-key compression"></i>แรงดันดิน + น้ำ</span><span>สเกลแรงดันแยกจากรูปทรง</span></div></div>`;
}

function footingFigure(p,v) {
 const left=115,right=505,w=390,maxHeight=82,stable=v.stable===true,ratio=stable&&v.qmax>0?v.qmin/v.qmax:0,contact=w*v.contactWidth/p.width,positive=p.moment>=0;
 const x0=v.regime==='partial'?(positive?left:right-contact):left,x1=v.regime==='partial'?(positive?left+contact:right):right,h0=positive?maxHeight:maxHeight*ratio,h1=positive?maxHeight*ratio:maxHeight;
 const rawResultant=left+w*(.5-p.moment/(p.normal*p.width)),resultant=clamp(rawResultant,55,565);
 const datum=160,leftQ=positive?v.qmax:v.qmin,rightQ=positive?v.qmin:v.qmax;
 return `<div class="technical-sheet" data-diagram="footing">${head('GEO / 02','การสัมผัสดินใต้ฐานราก')}<svg class="live-diagram technical-wide" viewBox="0 0 620 340" role="img" aria-label="ตำแหน่งแรงกดและการกระจายหน่วยแรงใต้ฐานตามเครื่องหมายโมเมนต์"><title>ตำแหน่งแรงลัพธ์ x = B/2 − M/N จากขอบซ้าย; M บวกกดด้านซ้ายมากขึ้น</title>${line(310,70,310,260,'technical-centroid')}<rect class="technical-concrete-solid" x="${left}" y="95" width="${w}" height="48"/>${arrowDown(resultant,42,87)}${label(resultant,29,`N = ${f(p.normal)} kN`,'technical-label','middle')}${rawResultant!==resultant?label(resultant,66,'นอกขอบภาพ','technical-note','middle'):''}${line(left,datum,right,datum,'technical-axis')}${stable?`<path class="technical-pressure" data-pressure-left="${leftQ}" data-pressure-right="${rightQ}" data-contact-start="${coordinate(x0)}" data-contact-end="${coordinate(x1)}" d="M${coordinate(x0)} ${datum}H${coordinate(x1)}V${coordinate(datum+h1)}L${coordinate(x0)} ${coordinate(datum+h0)}Z"/>${label(left,266,`${f(leftQ)} kPa`,'technical-pressure-label','middle')}${label(right,266,`${f(rightQ)} kPa`,'technical-pressure-label','middle')}${dimHorizontal(x0,x1,293,`ช่วงสัมผัส = ${f(v.contactWidth)} m`)}`:label(310,215,'ไม่พบสมดุลรับแรงอัดภายในฐาน','technical-outside-label','middle')}${label(310,325,v.regime==='full'?'สัมผัสเต็มฐาน':v.regime==='partial'?'สัมผัสบางส่วน · ดินไม่รับแรงดึง':'ไม่คำนวณหน่วยแรงรับอัด','technical-note','middle')}</svg><dl class="technical-data">${tag('ฐาน B × L',`${f(p.width)} × ${f(p.length)}`,'m')}${tag('โมเมนต์ M',p.moment,'kN·m')}${tag('ระยะเยื้องศูนย์ |e|',v.eccentricity,'m')}${tag('ช่วงสัมผัส',v.contactWidth,'m')}</dl><div class="technical-legend"><span><i class="technical-key concrete"></i>รูปฐาน: ความหนาเป็นสัญลักษณ์</span><span><i class="technical-key compression"></i>แรงกดดิน (อัดเป็นบวก)</span><span>M บวก: แรงกดมากด้านซ้าย</span></div></div>`;
}

/** Diagrams consume the current model values, never an imported computed answer. */
export function engineeringFigure(id,p={},v={},art='beam') {
 const uid=`eng-figure-${++figureSequence}`;
 if((id==='rc-beam'||id==='rc-slab')&&valid(p,['d','diameter','fc','fy'])&&p.d>0&&p.diameter>0&&valid(v,['steelArea','strain','strainLimit'])&&(id==='rc-beam'?valid(p,['b','count'])&&p.b>0&&Number.isInteger(p.count)&&p.count>=1&&p.count<=24:valid(p,['spacing'])&&p.spacing>p.diameter&&p.spacing>=25))return flexureFigure(id,p,v,uid);
 if(id==='retaining-wall'&&valid(p,['height','width','toe','stem','base','waterHeight','surcharge','heelSurcharge','gammaDry','gammaSat'])&&valid(v,['ka'])&&p.height>0&&p.width>0&&p.base>0&&p.width>p.toe+p.stem&&p.waterHeight>=0&&p.waterHeight<=p.height+p.base)return wallFigure(p,v,uid);
 if(id==='footing'&&valid(p,['width','length','normal','moment'])&&p.width>0&&p.length>0&&p.normal>0&&valid(v,['contactWidth'])&&v.contactWidth>=0&&(v.stable!==true||valid(v,['qmax','qmin','eccentricity'])))return footingFigure(p,v);
 return sketch(art);
}
