/* Nova Tracker — small built-in Excel (.xlsx) writer and reader. No outside libraries, works offline. */
(function(){
'use strict';
const enc = new TextEncoder(), dec = new TextDecoder();

/* ---------- zip (store) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b){ let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function dosTime(d){ return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; }
function zip(files){
  const parts = [], central = []; let off = 0; const dt = dosTime(new Date());
  for (const f of files) {
    const nm = enc.encode(f.name), d = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(d);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, dt.time, true); h.setUint16(12, dt.date, true); h.setUint32(14, crc, true);
    h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nm, d);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, dt.time, true); c.setUint16(14, dt.date, true); c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true);
    c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + d.length;
  }
  const csize = central.reduce((t, a) => t + a.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ---------- writer ---------- */
const xesc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
function colName(i){ let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function dateSerial(iso){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso)); if (!m) return null; return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 864e5; }
const STYLE = { text: 0, head: 1, date: 2, money: 3, rate: 4, int: 5, pct: 6, num: 0 };
function cellXml(ref, v, t){
  if (v && typeof v === 'object' && 'v' in v) { t = v.t || t; v = v.v; }
  if (v === null || v === undefined || v === '') return '';
  if (t === 'date') { const s = dateSerial(v); if (s !== null) return `<c r="${ref}" s="2"><v>${s}</v></c>`; }
  if (typeof v === 'number' && isFinite(v) && t !== 'text') return `<c r="${ref}" s="${STYLE[t] || 0}"><v>${v}</v></c>`;
  return `<c r="${ref}"${t === 'head' ? ' s="1"' : ''} t="inlineStr"><is><t xml:space="preserve">${xesc(v)}</t></is></c>`;
}
function sheetXml(sh){
  let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>';
  sh.cols.forEach((c, i) => { x += `<col min="${i + 1}" max="${i + 1}" width="${c.w || 14}" customWidth="1"/>`; });
  x += '</cols><sheetData>';
  x += '<row r="1">' + sh.cols.map((c, ci) => cellXml(colName(ci) + '1', c.h, 'head')).join('') + '</row>';
  sh.rows.forEach((r, ri) => { x += `<row r="${ri + 2}">` + r.map((v, ci) => cellXml(colName(ci) + (ri + 2), v, (sh.cols[ci] || {}).t || 'text')).join('') + '</row>'; });
  return x + '</sheetData></worksheet>';
}
const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="0.0000"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="7">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
function write(sheets){
  const names = sheets.map(s => String(s.name).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31));
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      names.map((n, i) => `<sheet name="${xesc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: STYLES },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) }))
  ];
  return zip(files);
}

/* ---------- reader ---------- */
function unzip(buf){
  const u = new Uint8Array(buf), dv = new DataView(buf);
  let e = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) { if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; } }
  if (e < 0) throw new Error('This file isn’t an Excel workbook (.xlsx).');
  const n = dv.getUint16(e + 10, true), cd = dv.getUint32(e + 16, true);
  const out = new Map(); let p = cd;
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u.subarray(p + 46, p + 46 + nlen));
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    out.set(name.replace(/^\//, ''), { method, data: u.subarray(start, start + csize) });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
async function inflate(entry){
  if (!entry) return null;
  if (entry.method === 0) return entry.data;
  if (entry.method !== 8) throw new Error('This workbook uses a compression the app can’t read.');
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t open Excel files. Update Chrome and try again.');
  const s = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const tags = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
const textOf = node => tags(node, 't').map(t => t.textContent).join('');
function colIndex(ref){ const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
async function read(fileOrBuffer){
  const buf = fileOrBuffer instanceof ArrayBuffer ? fileOrBuffer : await fileOrBuffer.arrayBuffer();
  const z = unzip(buf), parse = async name => { const d = await inflate(z.get(name)); return d ? new DOMParser().parseFromString(dec.decode(d), 'application/xml') : null; };
  const wb = await parse('xl/workbook.xml'); if (!wb) throw new Error('This file isn’t an Excel workbook (.xlsx).');
  const rels = await parse('xl/_rels/workbook.xml.rels'), target = {};
  if (rels) tags(rels, 'Relationship').forEach(r => { let t = r.getAttribute('Target') || ''; t = t.replace(/^\//, ''); if (!t.startsWith('xl/')) t = 'xl/' + t; target[r.getAttribute('Id')] = t; });
  const sstDoc = await parse('xl/sharedStrings.xml'), sst = sstDoc ? tags(sstDoc, 'si').map(textOf) : [];
  const sheets = {};
  for (const sh of tags(wb, 'sheet')) {
    const rid = sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sh.getAttribute('r:id');
    const doc = await parse(target[rid] || ''); if (!doc) continue;
    const rows = [];
    tags(doc, 'row').forEach(row => {
      const ri = (+row.getAttribute('r') || rows.length + 1) - 1, arr = []; let seq = 0;
      tags(row, 'c').forEach(c => {
        let ci = colIndex(c.getAttribute('r')); if (ci < 0) ci = seq; seq = ci + 1;
        const t = c.getAttribute('t'), vEl = tags(c, 'v')[0], v = vEl ? vEl.textContent : null; let val = null;
        if (t === 's') val = v === null ? null : (sst[+v] ?? null);
        else if (t === 'inlineStr') val = textOf(c);
        else if (t === 'str') val = v;
        else if (t === 'b') val = v === '1';
        else if (t === 'e') val = null;
        else if (v !== null && v !== '') { const n = Number(v); val = Number.isFinite(n) ? n : v; }
        arr[ci] = val;
      });
      rows[ri] = arr;
    });
    sheets[sh.getAttribute('name')] = Array.from(rows, r => r || []);
  }
  return sheets;
}
function serialToISO(n){ const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n * 864e5)); return d.toISOString().slice(0, 10); }

window.NovaXLSX = { write, read, serialToISO, dateSerial };
})();

