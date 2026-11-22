export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const format = (value,digits=2) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('th-TH',{maximumFractionDigits:digits}) : String(value ?? '—');
export function download(filename,content,type='text/plain;charset=utf-8') {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const link=document.createElement('a');link.href=url;link.download=filename;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
export function csv(rows) {
  return '\uFEFF'+rows.map(row=>row.map(value=>{
    let text=String(value ?? '');
    if ((/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) && !/^-?\d+(\.\d+)?$/.test(text)) text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  }).join(',')).join('\r\n');
}
export function finite(value,label,{min=-Infinity,max=Infinity,integer=false}={}) {
  if(typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`${label}: กรุณากรอก${integer?'จำนวนเต็ม':'ตัวเลข'}${Number.isFinite(min)?' ตั้งแต่ '+min:''}${Number.isFinite(max)?' ถึง '+max:''}`);
  return value;
}
export const today = () => new Date().toLocaleDateString('th-TH',{timeZone:'Asia/Bangkok',year:'numeric',month:'short',day:'numeric'});
export const uniqueId = () => globalThis.crypto?.randomUUID?.() || `eng-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
