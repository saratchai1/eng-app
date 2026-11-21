import {sketch} from './visuals.js';
import {format as f} from './utils.js';

export function engineeringFigure(id,p,v,art='beam') {
 if(id==='retaining-wall') {
  const D=p.height+p.base,scale=Math.min(225/D,310/p.width),left=90,bottom=285,baseY=bottom-p.base*scale,stemX=left+p.toe*scale,stemR=stemX+p.stem*scale,right=left+p.width*scale,top=bottom-D*scale,far=right+90,waterY=bottom-p.waterHeight*scale;
  const pressure=y=>{const depth=D-(bottom-y)/scale;const dryDepth=Math.min(depth,D-p.waterHeight),wetDepth=Math.max(0,depth-(D-p.waterHeight));return v.ka*(p.surcharge+p.gammaDry*dryDepth+(p.gammaSat-9.81)*wetDepth)+9.81*wetDepth;};
  const pressureMax=pressure(bottom),pressureScale=pressureMax>0?65/pressureMax:0;
  const middle=Math.max(top,Math.min(bottom,waterY));
  const pressurePolygon=`${far},${top} ${far+pressure(top)*pressureScale},${top} ${far+pressure(middle)*pressureScale},${middle} ${far+pressure(bottom)*pressureScale},${bottom} ${far},${bottom}`;
  const soil=`M${stemR} ${top}H${far}V${bottom}H${right}V${baseY}H${stemR}Z`;
  const water=p.waterHeight>0?(waterY>=baseY?`M${right} ${waterY}H${far}V${bottom}H${right}Z`:`M${stemR} ${waterY}H${far}V${bottom}H${right}V${baseY}H${stemR}Z`):'';
  return `<svg class="live-diagram" viewBox="0 0 620 340" role="img" aria-label="หน้าตัดกำแพง แรงดันรวม และระดับน้ำตามข้อมูลที่กรอก"><defs><pattern id="soil-hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v12" stroke="#d9c5a7"/></pattern></defs><path d="${soil}" fill="url(#soil-hatch)"/>${water?`<path d="${water}" fill="#75c9e3" opacity=".35"/><path d="M${waterY>=baseY?right:stemR} ${waterY}H${far}" stroke="#349cbd" stroke-width="2" stroke-dasharray="6 4"/><text x="${far-5}" y="${waterY-7}" text-anchor="end" fill="#2389aa" font-size="13">WL</text>`:''}<path d="M${left} ${baseY}h${p.width*scale}v${p.base*scale}H${left}Z M${stemX} ${top}h${p.stem*scale}V${baseY}h${-p.stem*scale}Z" fill="#e7edf4" stroke="#20486a" stroke-width="2"/><path d="M45 ${bottom}H${far+70}" stroke="#9eafbd"/><polygon points="${pressurePolygon}" fill="#f58335" fill-opacity=".15" stroke="#f58335" stroke-width="1.7"/><text x="${left+p.width*scale/2}" y="315" text-anchor="middle" fill="#173e63" font-size="15">B = ${f(p.width)} m</text><text x="${Math.max(5,stemX-90)}" y="${(top+baseY)/2}" fill="#173e63" font-size="14">H = ${f(p.height)} m</text><text x="${right}" y="${Math.max(15,top-17)}" text-anchor="end" fill="#997553" font-size="13">q = ${f(p.surcharge)} kPa</text><text x="${far}" y="${bottom+22}" text-anchor="middle" fill="#bb6b2b" font-size="12">p = ${f(pressureMax)} kPa</text></svg>`;
 }
 if(id==='footing'&&v){
  const left=100,right=460,w=360,maxHeight=80,stable=v.stable,ratio=stable&&v.qmax>0?v.qmin/v.qmax:0,contact=w*v.contactWidth/p.width,positive=p.moment>=0;
  const x0=v.regime==='partial'?(positive?left:right-contact):left,x1=v.regime==='partial'?(positive?left+contact:right):right,h0=positive?maxHeight:maxHeight*ratio,h1=positive?maxHeight*ratio:maxHeight;
  const resultant=stable?left+w*(.5-p.moment/(p.normal*p.width)):280;
  return `<svg class="live-diagram" viewBox="0 0 560 300" role="img" aria-label="การกระจายแรงกดและตำแหน่งแรงลัพธ์ใต้ฐาน"><rect x="100" y="90" width="360" height="55" fill="#e6edf4" stroke="#234b6e" stroke-width="2"/><path d="M${resultant} 25v57m-5-7 5 7 5-7" fill="none" stroke="#234b6e" stroke-width="2"/><text x="${resultant}" y="18" text-anchor="middle" fill="#173e63" font-size="13">N ที่ e = ${f(v.eccentricity,3)} m</text>${stable?`<path d="M${x0} 158H${x1}V${158+h1}L${x0} ${158+h0}Z" fill="#f5833528" stroke="#f58335" stroke-width="2"/><text x="${positive?x0:x1}" y="261" text-anchor="middle" fill="#173e63" font-size="15">qmax ${f(v.qmax)} kPa</text>`:`<text x="280" y="205" text-anchor="middle" fill="#b54434" font-size="18">แรงลัพธ์อยู่นอกฐาน / ไม่มีสมดุล</text>`}<text x="280" y="285" text-anchor="middle" fill="#64748b" font-size="13">${v.regime==='full'?'สัมผัสเต็มฐาน':v.regime==='partial'?'สัมผัสบางส่วน · ดินไม่รับแรงดึง':'ไม่คำนวณหน่วยแรงรับอัด'}</text></svg>`;
 }
 return sketch(art);
}
