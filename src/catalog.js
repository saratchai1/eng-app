export const categories=[
  {id:'all',label:'ทั้งหมด',icon:'grid'},
  {id:'cost',label:'ราคา · ปริมาณ · ต้นทุน',icon:'calculator'},
  {id:'management',label:'บริหาร · ตรวจสอบงาน',icon:'chart'},
  {id:'design',label:'ออกแบบวิศวกรรม',icon:'ruler'},
  {id:'drawing',label:'เขียนแบบ · ตัวอย่าง',icon:'layers'},
  {id:'learn',label:'เรียนรู้ · เตรียมสอบ',icon:'book'}
];

export const catalog=[
 {id:'boq-building',title:'ประมาณราคางานอาคาร',en:'BUILDING COST',category:'cost',kind:'workflow',art:'boq',color:'orange',badge:'เริ่มใช้งานง่าย',description:'ตารางปริมาณ วัสดุ และค่าแรง พร้อมค่าดำเนินการและภาษี',tags:['BOQ','CSV','งบประมาณ'],scope:'ตารางต้นทุนทั่วไป · กรอกราคาเอง'},
 {id:'boq-road',title:'ประมาณราคางานทาง',en:'ROAD COST',category:'cost',kind:'workflow',art:'road',color:'blue',description:'จัดรายการงานดิน ชั้นทาง ผิวจราจร และงานระบายน้ำ',tags:['ถนน','BOQ','ต้นทุน'],scope:'ชุดรายการตัวอย่าง · ไม่ใช่ราคากลางราชการ'},
 {id:'boq-irrigation',title:'ประมาณราคางานชลประทาน',en:'IRRIGATION COST',category:'cost',kind:'workflow',art:'canal',color:'cyan',description:'ตารางต้นทุนคลอง งานดิน และคอนกรีตดาดคลอง',tags:['คลอง','BOQ','ต้นทุน'],scope:'ราคาและรายการปรับแก้ได้'},
 {id:'quantity-building',title:'ถอดปริมาณงานอาคาร',en:'BUILDING TAKEOFF',category:'cost',kind:'calculator',art:'building',color:'blue',badge:'คำนวณทันที',description:'คำนวณคอนกรีต แบบหล่อ และปริมาณเหล็กประมาณการ',tags:['คาน','เสา','พื้น'],scope:'ปริมาณจากขนาดชิ้นส่วน · เหล็กเป็นค่าประมาณ'},
 {id:'quantity-road',title:'ถอดปริมาณงานทาง',en:'ROAD TAKEOFF',category:'cost',kind:'calculator',art:'road',color:'slate',description:'คำนวณชั้นทาง ปริมาตรผิวจราจร และน้ำหนักวัสดุ',tags:['ชั้นทาง','ปริมาตร','วัสดุ'],scope:'ถนนหน้าตัดคงที่ · ไม่รวมสะพานและท่อเหลี่ยม'},
 {id:'price-book',title:'คลังราคาวัสดุและค่าแรง',en:'MATERIAL PRICE BOOK',category:'cost',kind:'workflow',art:'prices',color:'green',description:'เก็บราคาของโครงการ แก้ไขและส่งออกตารางอ้างอิง',tags:['วัสดุ','ค่าแรง','ราคา'],scope:'ข้อมูลตัวอย่างและราคาที่ผู้ใช้กรอก · ไม่ใช่ราคาสด'},
 {id:'factor-k',title:'ดัชนีปรับราคางานก่อสร้าง',en:'WEIGHTED PRICE INDEX',category:'cost',kind:'calculator',art:'trend',color:'purple',description:'ทดลองคำนวณดัชนีถ่วงน้ำหนัก พร้อมแสดงที่มาทุกพจน์',tags:['Factor K','ดัชนี','ปรับราคา'],scope:'กรอกสูตรและดัชนีเอง · ไม่ใช่ 35 สูตรทางราชการ'},
 {id:'drawing-takeoff',title:'ถอดปริมาณจากภาพแบบ',en:'DRAWING TAKEOFF',category:'cost',kind:'special',art:'plan',color:'cyan',badge:'วัดจากภาพ',description:'ตั้งสเกลแล้ววัดระยะ พื้นที่ และนับรายการบนภาพแบบ',tags:['วัดระยะ','พื้นที่','PNG JPG'],scope:'รองรับภาพ PNG / JPG / WebP · ไม่ใช่ PDF หรือ OCR'},
 {id:'guide',title:'คู่มือประมาณราคา',en:'ESTIMATION NOTES',category:'cost',kind:'special',art:'guide',color:'orange',description:'หลักคิดถอดแบบ หน่วย ปริมาณสุทธิ และตรวจสอบราคา',tags:['ความรู้','BOQ','ตรวจทาน'],scope:'บทเรียนเขียนขึ้นใหม่ · ไม่ใช่คู่มือราคากลาง 2569'},
 {id:'quantity-canal',title:'ถอดปริมาณคลอง',en:'CANAL TAKEOFF',category:'cost',kind:'calculator',art:'canal',color:'cyan',description:'ปริมาตรขุดคลองรูปคางหมูและคอนกรีตดาดคลอง',tags:['ชลประทาน','งานดิน','คอนกรีต'],scope:'หน้าตัดคงที่ · ระบุวิธีประมาณความหนาดาด'},
 {id:'boq-warehouse',title:'ประมาณราคาโกดังและโรงงาน',en:'WAREHOUSE COST',category:'cost',kind:'workflow',art:'warehouse',color:'slate',description:'จัดต้นทุนงานฐานราก โครงสร้าง หลังคา และพื้นโรงงาน',tags:['โกดัง','โรงงาน','BOQ'],scope:'ตารางราคา · ไม่วิเคราะห์โมเดลโครงสร้าง'},
 {id:'planning',title:'วางแผนงานก่อสร้าง',en:'PROJECT PLANNING',category:'management',kind:'workflow',art:'gantt',color:'blue',badge:'Gantt + CPM',description:'เชื่อมงานก่อนหน้า วิเคราะห์วิกฤต และติดตามความก้าวหน้า',tags:['Gantt','CPM','แผนงาน'],scope:'ความสัมพันธ์ Finish-to-start · วันปฏิทิน'},
 {id:'inspection',title:'ตรวจบ้านและบันทึกข้อบกพร่อง',en:'HOME INSPECTION',category:'management',kind:'workflow',art:'house',color:'green',description:'เช็กรายการตรวจ บันทึกรายละเอียด และแนบรูปประกอบ',tags:['Checklist','Defect','ตรวจรับ'],scope:'บันทึกในเบราว์เซอร์ · ส่งออกสำรองได้'},
 {id:'rc-beam',title:'ตรวจคานคอนกรีตเสริมเหล็ก',en:'RC BEAM',category:'design',kind:'calculator',art:'beam',color:'blue',badge:'แสดงวิธีคำนวณ',description:'ตรวจแรงดัดหน้าตัดสี่เหลี่ยม พร้อมค่าความเครียดเหล็ก',tags:['คอนกรีต','คาน','แรงดัด'],scope:'เหล็กชั้นเดียว · tension-controlled · ไม่ตรวจแรงเฉือน'},
 {id:'retaining-wall',title:'ตรวจเสถียรภาพกำแพงกันดิน',en:'RETAINING WALL',category:'design',kind:'calculator',art:'wall',color:'orange',badge:'ดิน + น้ำ',description:'Rankine แรงน้ำ การเลื่อน การพลิก และแรงกดใต้ฐาน',tags:['กำแพง','ดิน','ฐานราก'],scope:'สถิต ดินราบ · ไม่ตรวจเหล็ก แผ่นดินไหว หรือ global slip'},
 {id:'rc-slab',title:'ตรวจพื้นคอนกรีตทางเดียว',en:'ONE-WAY SLAB',category:'design',kind:'calculator',art:'slab',color:'blue',description:'ตรวจแรงดัดของแถบพื้นกว้าง 1 เมตรและระยะห่างเหล็ก',tags:['พื้น','เหล็กเสริม','คอนกรีต'],scope:'แถบพื้น 1 ม. · ไม่ตรวจเจาะทะลุและการโก่งตัว'},
 {id:'shoring',title:'ตรวจน้ำหนักบรรทุกนั่งร้าน',en:'SHORING LOAD',category:'design',kind:'calculator',art:'shoring',color:'slate',description:'หาน้ำหนักลงเฟรม เปรียบเทียบกำลังใช้งานจากผู้ผลิต',tags:['นั่งร้าน','แบบหล่อ','น้ำหนัก'],scope:'แรงแนวดิ่ง · ผู้ใช้ระบุกำลังรับน้ำหนักที่มีหลักฐาน'},
 {id:'footing',title:'ฐานรากรับแรงเยื้องศูนย์',en:'ECCENTRIC FOOTING',category:'design',kind:'calculator',art:'footing',color:'purple',description:'แรงกดใต้ฐานและพื้นที่สัมผัสดินเมื่อแรงเยื้องศูนย์',tags:['ฐานราก','Bearing','เยื้องศูนย์'],scope:'โมเมนต์แกนเดียว · ไม่ตรวจเหล็กและการทรุดตัว'},
 {id:'drawings',title:'คลังภาพร่างวิศวกรรม',en:'SCHEMATIC LIBRARY',category:'drawing',kind:'special',art:'plan',color:'blue',description:'ภาพร่างหน้าตัดที่เขียนขึ้นใหม่ ดาวน์โหลดเป็น SVG',tags:['ภาพร่าง','SVG','หน้าตัด'],scope:'ภาพสื่อสารแนวคิด · ไม่ใช่แบบ DOH หรือแบบก่อสร้าง'},
 {id:'quiz',title:'ทบทวนพื้นฐานวิศวกรรม',en:'ENGINEERING PRACTICE',category:'learn',kind:'special',art:'quiz',color:'orange',description:'ฝึก 12 ข้อเรื่องหน่วย ปริมาณ โครงสร้าง และแผนงาน',tags:['แบบฝึกหัด','เฉลย','พื้นฐาน'],scope:'คำถามเขียนขึ้นใหม่ · ไม่ใช่ข้อสอบ ก.พ. จริง'}
];
