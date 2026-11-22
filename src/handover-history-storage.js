import {restoreHandoverHistory,MAX_HANDOVER_HISTORY_BYTES} from './handover-history.js';

export const HANDOVER_HISTORY_KEY='engapp.handover.history.v1';
export const HANDOVER_HISTORY_LOCK='engapp-handover-history-v1';

/** Reading never repairs or rewrites captured evidence. */
export function readHandoverHistory(storage,{key=HANDOVER_HISTORY_KEY}={}) {
  let raw;
  try{raw=storage.getItem(key);}catch{throw new Error('อ่านฉบับอ้างอิงในเบราว์เซอร์ไม่ได้ กรุณาตรวจการอนุญาตจัดเก็บข้อมูล');}
  return {...restoreHandoverHistory(raw),raw};
}

/**
 * Every cooperating tab uses this same origin lock. The transform is synchronous
 * and runs against the latest archive while locked; one setItem commits the batch.
 * UI selections, unfinished form text and undo tokens change only after success.
 */
export async function updateHandoverHistory(storage,transform,{locks=globalThis.navigator?.locks,key=HANDOVER_HISTORY_KEY}={}) {
  if(!locks || typeof locks.request!=='function')throw new Error('เบราว์เซอร์นี้ยังไม่รองรับการเก็บฉบับอ้างอิงร่วมกันระหว่างแท็บ กรุณาใช้เบราว์เซอร์รุ่นปัจจุบัน หรือส่งออก JSON ของชุดงานไว้ก่อน');
  return locks.request(HANDOVER_HISTORY_LOCK,{mode:'exclusive'},()=>{
    const latest=readHandoverHistory(storage,{key});
    if(latest.rejected || latest.adjusted)throw new Error('ข้อมูลประวัติบางส่วนไม่สมบูรณ์ จึงยังไม่เขียนทับ กรุณาส่งออกฉบับที่ยังเปิดอ่านได้เพื่อสำรอง');
    const planned=transform(latest.state);
    if(!planned || typeof planned.then==='function' || !planned.next)throw new Error('แผนการเก็บฉบับอ้างอิงไม่ถูกต้อง');
    const checked=restoreHandoverHistory(planned.next);
    if(checked.rejected || checked.adjusted)throw new Error('ฉบับอ้างอิงที่กำลังเก็บไม่ผ่านการตรวจ ข้อมูลเดิมยังคงอยู่');
    const persisted={schemaVersion:1,entries:checked.state.entries};
    const encoded=JSON.stringify(persisted);
    if(new TextEncoder().encode(encoded).byteLength>MAX_HANDOVER_HISTORY_BYTES)throw new Error('ประวัติชุดงานเกินพื้นที่ที่กำหนด กรุณาส่งออกและนำฉบับที่ไม่ต้องการออกก่อน');
    try{storage.setItem(key,encoded);}catch{throw new Error('เก็บฉบับอ้างอิงไม่ได้หรือพื้นที่เบราว์เซอร์ไม่พอ ประวัติเดิมยังอยู่และข้อความที่กรอกยังไม่ถูกล้าง กรุณาส่งออก JSON เพื่อสำรอง');}
    return {state:checked.state,value:planned.value};
  });
}
