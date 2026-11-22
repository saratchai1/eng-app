import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandoverExample} from '../src/handover-example.js';
import {captureHandoverReference} from '../src/handover-history.js';
import {HANDOVER_HISTORY_KEY,readHandoverHistory,updateHandoverHistory} from '../src/handover-history-storage.js';

const now='2026-11-22T02:00:00.000Z';
const example=createHandoverExample({idFactory:(()=>{let id=0;return()=>`source-${++id}`;})(),now});
const reference=(id,code=id)=>captureHandoverReference(example.records,example.state,{id,code,note:'Reference for an explicit review round',now,appVersion:'0.7'});
const memoryStorage=()=>{
  const data=new Map();let writes=0,fail=false;
  return {getItem:key=>data.get(key)??null,setItem(key,value){if(fail)throw new Error('quota');writes++;data.set(key,value);},get writes(){return writes;},set fail(value){fail=value;}};
};
const serialLocks=()=>{
  let tail=Promise.resolve();
  return {request(_name,_options,callback){const result=tail.then(callback);tail=result.catch(()=>{});return result;}};
};
const append=entry=>state=>({next:{...state,entries:[...state.entries,entry],selectedId:entry.id},value:entry.id});

test('reference capture persists one evidence-only archive without changing source jobs or drafts',async()=>{
  const storage=memoryStorage(),locks=serialLocks();
  storage.setItem('engapp.projects.v1','original jobs');storage.setItem('engapp.draft.v3.rc-beam.source-1','unfinished response');
  const before=storage.writes;
  const entry=reference('r1');
  const result=await updateHandoverHistory(storage,state=>({next:{...append(entry)(state).next,draft:{code:'do not store',note:'separate form draft'}},value:entry.id}),{locks});
  assert.equal(result.value,'r1');assert.equal(storage.writes,before+1);
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(HANDOVER_HISTORY_KEY))).sort(),['entries','schemaVersion']);
  assert.deepEqual(readHandoverHistory(storage).state.entries[0],entry);
  assert.equal(storage.getItem('engapp.projects.v1'),'original jobs');
  assert.equal(storage.getItem('engapp.draft.v3.rc-beam.source-1'),'unfinished response');
});

test('quota failure leaves every previously captured byte and source record intact',async()=>{
  const storage=memoryStorage(),locks=serialLocks();
  await updateHandoverHistory(storage,append(reference('r1')),{locks});
  const original=storage.getItem(HANDOVER_HISTORY_KEY),writes=storage.writes;
  storage.fail=true;
  await assert.rejects(updateHandoverHistory(storage,append(reference('r2')),{locks}),/พื้นที่|เก็บฉบับ/);
  assert.equal(storage.getItem(HANDOVER_HISTORY_KEY),original);assert.equal(storage.writes,writes);
});

test('simultaneous cooperating tabs retain both captures by reading after the shared lock is acquired',async()=>{
  const storage=memoryStorage(),locks=serialLocks();
  const [a,b]=await Promise.all([
    updateHandoverHistory(storage,append(reference('tab-a')),{locks}),
    updateHandoverHistory(storage,append(reference('tab-b')),{locks}),
  ]);
  assert.equal(a.value,'tab-a');assert.equal(b.value,'tab-b');
  assert.deepEqual(readHandoverHistory(storage).state.entries.map(entry=>entry.id),['tab-a','tab-b']);
});

test('undo reinserts only the removed reference while retaining another tab’s newer capture',async()=>{
  const storage=memoryStorage(),locks=serialLocks();
  await updateHandoverHistory(storage,append(reference('r1')),{locks});
  await updateHandoverHistory(storage,append(reference('r2')),{locks});
  const removed=await updateHandoverHistory(storage,state=>({next:{...state,entries:state.entries.filter(entry=>entry.id!=='r1')},value:state.entries.find(entry=>entry.id==='r1')}),{locks});
  await updateHandoverHistory(storage,append(reference('new-tab')),{locks});
  await updateHandoverHistory(storage,state=>({next:{...state,entries:[removed.value,...state.entries]}}),{locks});
  assert.deepEqual(readHandoverHistory(storage).state.entries.map(entry=>entry.id),['r1','r2','new-tab']);
});

test('malformed saved evidence is disclosed without a repair write or subsequent overwrite',async()=>{
  const storage=memoryStorage(),locks=serialLocks();
  const malformed=JSON.stringify({schemaVersion:1,entries:[reference('r1'),{id:'invalid',code:'R2'}]});
  storage.setItem(HANDOVER_HISTORY_KEY,malformed);const writes=storage.writes;
  const result=readHandoverHistory(storage);assert.ok(result.rejected>0);
  await assert.rejects(updateHandoverHistory(storage,append(reference('r3')),{locks}),/ไม่สมบูรณ์/);
  assert.equal(storage.getItem(HANDOVER_HISTORY_KEY),malformed);assert.equal(storage.writes,writes);
});

test('duplicate evidence and unavailable lock capability cannot commit a misleading archive',async()=>{
  const storage=memoryStorage(),locks=serialLocks();
  const entry=reference('r1');await updateHandoverHistory(storage,append(entry),{locks});
  const original=storage.getItem(HANDOVER_HISTORY_KEY),writes=storage.writes;
  await assert.rejects(updateHandoverHistory(storage,append(entry),{locks}),/ไม่ผ่าน/);
  await assert.rejects(updateHandoverHistory(storage,append(reference('r2')),{locks:null}),/รองรับ/);
  assert.equal(storage.getItem(HANDOVER_HISTORY_KEY),original);assert.equal(storage.writes,writes);
});
