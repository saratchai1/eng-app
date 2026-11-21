import test from 'node:test';
import assert from 'node:assert/strict';
import {engineeringFigure,engineeringFigureCaption} from '../src/calculation-diagrams.js';
import {engineeringTools,defaultInputs} from '../src/engineering.js';

function render(id,override={}) {
 const p={...defaultInputs(id),...override};
 const result=engineeringTools[id].calculate(p);
 return {markup:engineeringFigure(id,p,result.values),p,values:result.values};
}
function attr(markup,name){const match=markup.match(new RegExp(name+'="([^"]+)"'));assert.ok(match,`Missing ${name}`);return Number(match[1]);}

test('RC beam redraws b/d geometry and bar symbols from current input without inventing h or cover',()=>{
 const first=render('rc-beam');
 const deeper=render('rc-beam',{d:700,count:6});
 assert.match(first.markup,/data-diagram="rc-beam"/);
 assert.equal(attr(first.markup,'data-bar-symbols'),4);
 assert.equal(attr(deeper.markup,'data-bar-symbols'),6);
 assert.match(deeper.markup,/d = 700 mm/);
 assert.match(first.markup,/ไม่ทราบ h และระยะหุ้ม/);
 assert.match(first.markup,/ไม่ตรวจระยะเรียงหรือจำนวนชั้น/);
 const width=m=>Number(m.match(/class="technical-concrete-fill"[^>]+width="([^"]+)"/)[1]);
 assert.ok(width(deeper.markup)<width(first.markup),'A deeper section preserves the b:d aspect instead of keeping a fixed illustration');
 assert.doesNotMatch(first.markup,/ปลอก|cover =|h =/);
});

test('RC compression plot uses returned a/c values and suppresses the plot outside the model strain scope',()=>{
 const {markup,values}=render('rc-beam');
 assert.match(markup,new RegExp(`a = ${values.a.toLocaleString('th-TH',{maximumFractionDigits:2})} mm`));
 assert.match(markup,new RegExp(`c = ${values.c.toLocaleString('th-TH',{maximumFractionDigits:2})} mm`));
 assert.match(markup,/class="technical-compression"/);
 const outside=render('rc-beam',{b:150,d:150,diameter:32,count:8}).markup;
 assert.match(outside,/MODEL LIMIT/);
 assert.doesNotMatch(outside,/class="technical-compression"/);
 assert.doesNotMatch(outside,/NaN|Infinity/);
});

test('slab strip remains 1000 mm wide and responds to spacing without reporting rounded whole-bar area',()=>{
 const coarse=render('rc-slab',{spacing:200});
 const fine=render('rc-slab',{spacing:100});
 assert.match(coarse.markup,/b = 1,000 mm/);
 assert.match(coarse.markup,/s = 200 mm/);
 assert.equal(attr(fine.markup,'data-bar-symbols'),2*attr(coarse.markup,'data-bar-symbols'));
 assert.match(coarse.markup,/ไม่ใช่จำนวนเหล็กเต็มต่อแถบ/);
 const fractional=render('rc-slab',{spacing:150});
 assert.match(fractional.markup,new RegExp(fractional.values.steelArea.toLocaleString('th-TH',{maximumFractionDigits:2})));
});

test('rendered SVG identifiers stay unique across simultaneous screen and report instances',()=>{
 const a=render('retaining-wall').markup,b=render('retaining-wall').markup;
 const first=a.match(/<pattern id="([^"]+)"/)[1],second=b.match(/<pattern id="([^"]+)"/)[1];
 assert.notEqual(first,second);
 assert.ok(a.includes(`url(#${first})`));assert.ok(b.includes(`url(#${second})`));
 const beam1=render('rc-beam').markup,beam2=render('rc-beam').markup;
 assert.notEqual(beam1.match(/<clipPath id="([^"]+)"/)[1],beam2.match(/<clipPath id="([^"]+)"/)[1]);
});

test('positive and negative footing moment mirror pressure and partial contact about the centre',()=>{
 const positive=render('footing',{width:2,length:3,normal:600,moment:360});
 const negative=render('footing',{width:2,length:3,normal:600,moment:-360});
 assert.ok(attr(positive.markup,'data-pressure-left')>attr(positive.markup,'data-pressure-right'));
 assert.ok(attr(negative.markup,'data-pressure-left')<attr(negative.markup,'data-pressure-right'));
 assert.equal(attr(positive.markup,'data-pressure-left'),attr(negative.markup,'data-pressure-right'));
 assert.equal(attr(positive.markup,'data-contact-start'),115);
 assert.equal(attr(negative.markup,'data-contact-end'),505);
 assert.equal(attr(positive.markup,'data-contact-end')+attr(negative.markup,'data-contact-start'),620);
});

test('out-of-base resultant is not drawn as a centred stable force or assigned fictitious pressures',()=>{
 const {markup}=render('footing',{width:2,normal:600,moment:1200});
 assert.match(markup,/ไม่พบสมดุลรับแรงอัดภายในฐาน/);
 assert.match(markup,/นอกขอบภาพ/);
 assert.match(markup,/M55 42V87/);
 assert.doesNotMatch(markup,/data-pressure-left|data-pressure-right|NaN|Infinity/);
});

test('wall caption distinguishes H above base from water elevation measured at the underside',()=>{
 const {markup,p}=render('retaining-wall',{height:3,base:.4,waterHeight:1.5,surcharge:20,heelSurcharge:5});
 assert.match(markup,/แรงดันรวมลึก H \+ ความหนาฐาน/);
 assert.match(markup,/ระดับน้ำจากใต้ฐาน/);
 assert.match(markup,/q ด้านข้าง/);
 assert.match(markup,/q แนวดิ่งเหนือ heel/);
 assert.match(engineeringFigureCaption('retaining-wall',p),/เหนือหลังฐาน.*ระดับน้ำวัดจากใต้ฐาน/);
});

test('valid extreme geometry stays finite and malformed numerical inputs cannot inject SVG',()=>{
 for(const [id,params] of [['rc-beam',{b:3000,d:50,count:24}],['rc-beam',{b:80,d:2500,count:1}],['rc-slab',{d:500,diameter:6,spacing:25}],['retaining-wall',{height:.3,width:20,base:3,waterHeight:3.3}],['footing',{normal:.01,moment:1000000}]]) {
  const {markup}=render(id,params);
  assert.doesNotMatch(markup,/NaN|Infinity|undefined/,id);
 }
 const p=defaultInputs('rc-beam');
 const v=engineeringTools['rc-beam'].calculate(p).values;
 const safe=engineeringFigure('rc-beam',{...p,b:'<svg onload="alert(1)">'},v);
 assert.doesNotMatch(safe,/onload|alert\(/);
 assert.doesNotMatch(safe,/NaN|Infinity/);
});
