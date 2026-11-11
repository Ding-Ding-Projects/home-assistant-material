  // ==========================================================================================
  // Converter, Base64 toolkit, QR codes, ZIP and drawing. Everything runs in this window with the
  // bundled libraries in vendor/ (pdf-lib, fflate, qrcode-generator, jsQR); nothing is uploaded.
  // ==========================================================================================
  var MB = 1024 * 1024;
  function hex(b, n) { return Array.prototype.map.call(b.slice(0, n || b.length), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  async function sha256(bytes) { var d = await crypto.subtle.digest('SHA-256', bytes); return hex(new Uint8Array(d)); }
  function fmtSize(n) { n = +n || 0; return n < 1024 ? n + ' B' : n < MB ? (n / 1024).toFixed(1) + ' KB' : n < 1024 * MB ? (n / MB).toFixed(1) + ' MB' : n < 1024 * 1024 * MB ? (n / MB / 1024).toFixed(1) + ' GB' : (n / MB / 1024 / 1024).toFixed(2) + ' TB'; }
  function readBytes(blob, start, end) { return blob.slice(start || 0, end == null ? blob.size : end).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  function baseName(n) { var i = n.lastIndexOf('.'); return i > 0 ? n.slice(0, i) : n; }

  // Type from the first bytes, never from the name alone.
  var SIGS = [['png', 'image/png', '89504e470d0a1a0a'], ['jpeg', 'image/jpeg', 'ffd8ff'], ['gif', 'image/gif', '47494638'], ['webp', 'image/webp', /^52494646.{8}57454250/], ['bmp', 'image/bmp', '424d'], ['pdf', 'application/pdf', '25504446'], ['zip', 'application/zip', '504b0304'], ['gzip', 'application/gzip', '1f8b'], ['mp3', 'audio/mpeg', /^(494433|fffb|fff3)/], ['wav', 'audio/wav', /^52494646.{8}57415645/], ['ogg', 'audio/ogg', '4f676753'], ['flac', 'audio/flac', '664c6143'], ['mp4', 'video/mp4', /^.{8}66747970/], ['webm', 'video/webm', '1a45dfa3'], ['7z', 'application/x-7z-compressed', '377abcaf271c'], ['rar', 'application/vnd.rar', '526172211a07']];
  async function detect(file) {
    var b = await readBytes(file, 0, 4096), h = hex(b, 16);
    for (var i = 0; i < SIGS.length; i++) { var s = SIGS[i]; if (typeof s[2] === 'string' ? h.indexOf(s[2]) === 0 : s[2].test(h)) { var t = { kind: s[0], mime: s[1] }; if (t.kind === 'zip' && /\.(docx|xlsx|pptx|odt|ods)$/i.test(file.name)) t.office = true; return t; } }
    var text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(b.slice(0, b.length - (b.length === 4096 ? 4 : 0))); } catch (e) { return { kind: 'binary', mime: 'application/octet-stream' }; }
    var tt = text.replace(/^﻿/, '').trimStart();
    if (/^<svg[\s>]|^<\?xml[^>]*>\s*<svg/i.test(tt)) return { kind: 'svg', mime: 'image/svg+xml', text: true };
    if (/^[[{]/.test(tt)) return { kind: 'json', mime: 'application/json', text: true };
    if (/^<\?xml|^</.test(tt)) return { kind: 'xml', mime: 'application/xml', text: true };
    if (/^data:[\w.+-]+\/[\w.+-]+[;,]/.test(tt)) return { kind: 'dataurl', mime: 'text/plain', text: true };
    var first = tt.split(/\r?\n/)[0] || '';
    if (/\t/.test(first)) return { kind: 'tsv', mime: 'text/tab-separated-values', text: true };
    if (/,/.test(first) && tt.split(/\r?\n/).length > 1) return { kind: 'csv', mime: 'text/csv', text: true };
    if (/^[A-Za-z0-9+/=_\-\s]+$/.test(tt) && tt.replace(/\s/g, '').length >= 8 && tt.replace(/\s/g, '').length % 4 !== 1) return { kind: 'base64', mime: 'text/plain', text: true };
    return { kind: 'text', mime: 'text/plain', text: true };
  }

  // ---------- Adapter registry: category, sources, target, what can change, and how it runs ----------
  var CATS = [['pdf', 'Documents and PDF'], ['image', 'Images'], ['audio', 'Audio'], ['video', 'Video'], ['archive', 'Archives'], ['data', 'Structured data'], ['text', 'Code and text'], ['binary', 'Binary encodings']];
  var IMG = ['png', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
  function A(id, cat, from, to, name, lossy, run, opts) { return Object.assign({ id: id, cat: cat, from: from, to: to, name: name, lossy: lossy, run: run, enabled: !!run }, opts || {}); }
  function off(id, cat, from, to, name, why) { return A(id, cat, from, to, name, '', null, { why: why }); }
  async function toBitmap(file, t) {
    if (t.kind === 'svg') { var url = URL.createObjectURL(new Blob([await file.text()], { type: 'image/svg+xml' })); try { var img = new Image(); img.src = url; await img.decode(); var c = document.createElement('canvas'); c.width = Math.min(8000, img.naturalWidth || 1024); c.height = Math.min(8000, img.naturalHeight || 1024); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c; } finally { URL.revokeObjectURL(url); } }
    var bm = await createImageBitmap(file); if (bm.width * bm.height > 100e6) throw new Error('The picture has more than 100 million pixels.'); return bm;
  }
  function imgTo(mime, q) {
    return async function (file, t, o) {
      var bm = await toBitmap(file, t), c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; var x = c.getContext('2d');
      if (mime === 'image/jpeg') { x.fillStyle = o.bg || '#ffffff'; x.fillRect(0, 0, c.width, c.height); }
      x.drawImage(bm, 0, 0); var blob = await new Promise(function (r) { c.toBlob(r, mime, q); });
      if (!blob || blob.type !== mime) throw new Error('This window cannot write ' + mime + '.');
      return [{ name: baseName(file.name) + '.' + ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[mime], blob: blob }];
    };
  }
  async function pdfDoc(file) { var PDF = window.PDFLib; if (!PDF) throw new Error('The PDF library did not load.'); try { return await PDF.PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false }); } catch (e) { if (/encrypt/i.test(e.message)) throw new Error('This PDF is encrypted. Encrypted PDFs are not opened here.'); throw new Error('This PDF could not be read: ' + e.message.slice(0, 120)); } }
  function parseRange(s, n) {
    var out = []; String(s || '').split(',').forEach(function (p) { p = p.trim(); if (!p) return; var m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(p); if (!m) throw new Error('"' + p + '" is not a page or a range like 2-5.'); var a = +m[1], b = m[2] ? +m[2] : a; if (a < 1 || b > n || a > b) throw new Error('Pages ' + p + ' are outside 1 to ' + n + '.'); for (var i = a; i <= b; i++) out.push(i - 1); });
    if (!out.length) throw new Error('Give at least one page.'); return out;
  }
  async function pdfSave(doc, name, check) {
    var bytes = await doc.save(); var again = await window.PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
    if (check) check(again); return { name: name, blob: new Blob([bytes], { type: 'application/pdf' }), note: again.getPageCount() + ' pages, checked by reopening' };
  }
  var PDFTOOLS = {
    inspect: async function (file) { var d = await pdfDoc(file); var info = { pages: d.getPageCount(), title: d.getTitle() || '', author: d.getAuthor() || '', subject: d.getSubject() || '', keywords: d.getKeywords() || '', creator: d.getCreator() || '', producer: d.getProducer() || '', created: d.getCreationDate() ? d.getCreationDate().toISOString() : '', modified: d.getModificationDate() ? d.getModificationDate().toISOString() : '', sizes: d.getPages().slice(0, 50).map(function (p, i) { return (i + 1) + ': ' + Math.round(p.getWidth()) + ' x ' + Math.round(p.getHeight()) + ' pt, rotated ' + p.getRotation().angle; }) }; return [{ name: baseName(file.name) + '.inspect.json', blob: new Blob([JSON.stringify(info, null, 2)], { type: 'application/json' }), note: info.pages + ' pages' }]; },
    split: async function (file) { var d = await pdfDoc(file), n = d.getPageCount(), files = {}; if (n > 2000) throw new Error('More than 2000 pages.'); for (var i = 0; i < n; i++) { var o = await window.PDFLib.PDFDocument.create(); var pg = await o.copyPages(d, [i]); o.addPage(pg[0]); var r = await pdfSave(o, '', function (a) { if (a.getPageCount() !== 1) throw new Error('Page ' + (i + 1) + ' did not split cleanly.'); }); files[baseName(file.name) + '-page-' + String(i + 1).padStart(String(n).length, '0') + '.pdf'] = new Uint8Array(await r.blob.arrayBuffer()); } return [{ name: baseName(file.name) + '-pages.zip', blob: new Blob([window.fflate.zipSync(files, { level: 0 })], { type: 'application/zip' }), note: n + ' one-page PDFs in a ZIP' }]; },
    extract: async function (file, t, o) { var d = await pdfDoc(file), idx = parseRange(o.pages, d.getPageCount()), out = await window.PDFLib.PDFDocument.create(); (await out.copyPages(d, idx)).forEach(function (p) { out.addPage(p); }); return [await pdfSave(out, baseName(file.name) + '-pages-' + o.pages.replace(/\s/g, '') + '.pdf', function (a) { if (a.getPageCount() !== idx.length) throw new Error('The page count came out wrong.'); })]; },
    reorder: async function (file, t, o) { var d = await pdfDoc(file), idx = parseRange(o.order, d.getPageCount()), out = await window.PDFLib.PDFDocument.create(); (await out.copyPages(d, idx)).forEach(function (p) { out.addPage(p); }); return [await pdfSave(out, baseName(file.name) + '-reordered.pdf', function (a) { if (a.getPageCount() !== idx.length) throw new Error('The page count came out wrong.'); })]; },
    rotate: async function (file, t, o) { var d = await pdfDoc(file), idx = o.pages ? parseRange(o.pages, d.getPageCount()) : d.getPageIndices(), deg = +o.angle || 90, want = {}; idx.forEach(function (i) { var p = d.getPage(i); var a = (p.getRotation().angle + deg) % 360; p.setRotation(window.PDFLib.degrees(a)); want[i] = a; }); return [await pdfSave(d, baseName(file.name) + '-rotated.pdf', function (a) { Object.keys(want).forEach(function (i) { if (a.getPage(+i).getRotation().angle !== want[i]) throw new Error('Page ' + (+i + 1) + ' did not rotate.'); }); })]; },
    metadata: async function (file, t, o) { var d = await pdfDoc(file); ['Title', 'Author', 'Subject', 'Creator'].forEach(function (k) { var v = o['meta' + k]; if (v != null && v !== '') d['set' + k](v); }); if (o.metaKeywords) d.setKeywords(o.metaKeywords.split(',').map(function (x) { return x.trim(); }).filter(Boolean)); d.setModificationDate(new Date()); return [await pdfSave(d, baseName(file.name) + '-metadata.pdf', function (a) { if (o.metaTitle && a.getTitle() !== o.metaTitle) throw new Error('The title did not stick.'); })]; },
    merge: async function (files) { var out = await window.PDFLib.PDFDocument.create(), total = 0; for (var i = 0; i < files.length; i++) { var d = await pdfDoc(files[i]); total += d.getPageCount(); (await out.copyPages(d, d.getPageIndices())).forEach(function (p) { out.addPage(p); }); } return [await pdfSave(out, 'merged-' + files.length + '-pdfs.pdf', function (a) { if (a.getPageCount() !== total) throw new Error('The merged page count came out wrong.'); })]; },
    fromImages: async function (files) { var out = await window.PDFLib.PDFDocument.create(); for (var i = 0; i < files.length; i++) { var f = files[i], t = await detect(f), img; if (t.kind === 'png') img = await out.embedPng(await f.arrayBuffer()); else if (t.kind === 'jpeg') img = await out.embedJpg(await f.arrayBuffer()); else { var png = (await imgTo('image/png')(f, t, {}))[0].blob; img = await out.embedPng(await png.arrayBuffer()); } var pg = out.addPage([img.width, img.height]); pg.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height }); } return [await pdfSave(out, 'images-' + files.length + '.pdf', function (a) { if (a.getPageCount() !== files.length) throw new Error('One page per picture did not come out.'); })]; }
  };
  function textOut(name, s, mime) { return [{ name: name, blob: new Blob([s], { type: mime || 'text/plain' }) }]; }
  function parseCsv(s, sep) { var rows = [], row = [], cell = '', q = false; for (var i = 0; i < s.length; i++) { var ch = s[i]; if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; } else if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch; } if (cell || row.length) { row.push(cell); rows.push(row); } var head = rows.shift() || []; return rows.filter(function (r) { return r.length > 1 || r[0]; }).map(function (r) { var o = {}; head.forEach(function (h, i) { o[h] = r[i] == null ? '' : r[i]; }); return o; }); }
  async function rowsOf(file, t) { var s = (await file.text()).replace(/^﻿/, ''); if (t.kind === 'json') { var j = JSON.parse(s); if (!Array.isArray(j)) j = [j]; return j.map(function (r) { return r && typeof r === 'object' ? r : { value: r }; }); } if (t.kind === 'csv') return parseCsv(s, ','); if (t.kind === 'tsv') return parseCsv(s, '\t'); throw new Error('Not a table.'); }
  function dataTo(f) { return async function (file, t) { var rows = await rowsOf(file, t); if (!rows.length) throw new Error('No rows were found.'); return textOut(baseName(file.name) + '.' + f, fmtRows(rows, f, baseName(file.name).replace(/\W/g, '_') || 'rows')); }; }
  function textConv(fn, suffix) { return async function (file) { return textOut(baseName(file.name) + suffix, fn(await file.text())); }; }
  var ADAPTERS = [
    A('pdf-inspect', 'pdf', ['pdf'], 'json', 'Inspect a PDF: pages, sizes, rotation, metadata', '', function (f) { return PDFTOOLS.inspect(f); }),
    A('pdf-split', 'pdf', ['pdf'], 'zip', 'Split a PDF into one file per page', '', function (f) { return PDFTOOLS.split(f); }),
    A('pdf-extract', 'pdf', ['pdf'], 'pdf', 'Extract pages', '', function (f, t, o) { return PDFTOOLS.extract(f, t, o); }, { needs: 'pages' }),
    A('pdf-reorder', 'pdf', ['pdf'], 'pdf', 'Reorder pages', '', function (f, t, o) { return PDFTOOLS.reorder(f, t, o); }, { needs: 'order' }),
    A('pdf-rotate', 'pdf', ['pdf'], 'pdf', 'Rotate pages', '', function (f, t, o) { return PDFTOOLS.rotate(f, t, o); }, { needs: 'rotate' }),
    A('pdf-metadata', 'pdf', ['pdf'], 'pdf', 'Change title, author, subject and keywords', 'The modification date is set to now.', function (f, t, o) { return PDFTOOLS.metadata(f, t, o); }, { needs: 'meta' }),
    A('pdf-merge', 'pdf', ['pdf'], 'pdf', 'Merge every chosen PDF into one, in queue order', '', null, { batch: function (fs2) { return PDFTOOLS.merge(fs2); }, enabled: true }),
    A('img-pdf', 'pdf', IMG, 'pdf', 'Pictures into one PDF, a page each', 'GIF and WebP pictures become PNG pages; animation keeps its first frame.', null, { batch: function (fs2) { return PDFTOOLS.fromImages(fs2); }, enabled: true }),
    off('docx-pdf', 'pdf', ['docx', 'odt'], 'pdf', 'Word or OpenDocument to PDF', 'No document layout engine is bundled with this app.'),
    off('pdf-docx', 'pdf', ['pdf'], 'docx', 'PDF to Word', 'No PDF text-layout reader is bundled with this app.'),
    A('img-png', 'image', IMG, 'png', 'To PNG', 'Animation keeps its first frame. Colour profiles and metadata (EXIF) are not kept.', imgTo('image/png')),
    A('img-jpeg', 'image', IMG, 'jpeg', 'To JPEG (quality 90)', 'JPEG has no transparency: see-through parts become white. It is lossy. Animation keeps its first frame; metadata is not kept.', imgTo('image/jpeg', 0.9)),
    A('img-webp', 'image', IMG, 'webp', 'To WebP (quality 90)', 'Lossy at quality 90. Animation keeps its first frame; metadata is not kept.', imgTo('image/webp', 0.9)),
    off('img-heic', 'image', ['heic', 'avif'], 'png', 'HEIC or AVIF to PNG', 'No HEIC decoder is bundled with this app.'),
    off('img-tiff', 'image', ['tiff'], 'png', 'TIFF to PNG', 'No TIFF decoder is bundled with this app.'),
    off('audio-any', 'audio', ['mp3', 'wav', 'ogg', 'flac'], 'mp3', 'Between MP3, WAV, OGG and FLAC', 'No audio encoder (such as FFmpeg) is bundled with this app.'),
    off('video-any', 'video', ['mp4', 'webm'], 'mp4', 'Between MP4 and WebM', 'No video encoder (such as FFmpeg) is bundled with this app.'),
    A('zip-make', 'archive', ['*'], 'zip', 'Every chosen file into one ZIP', '', null, { batch: async function (fs2) { var files = {}; for (var i = 0; i < fs2.length; i++) { var n = fs2[i].name, k = 1; while (files[n]) n = baseName(fs2[i].name) + ' (' + (k++) + ')' + fs2[i].name.slice(baseName(fs2[i].name).length); files[n] = new Uint8Array(await fs2[i].arrayBuffer()); } var z = window.fflate.zipSync(files); var back = window.fflate.unzipSync(z); if (Object.keys(back).length !== fs2.length) throw new Error('The ZIP did not reopen with every file.'); return [{ name: 'files-' + fs2.length + '.zip', blob: new Blob([z], { type: 'application/zip' }), note: fs2.length + ' files, checked by reopening' }]; }, enabled: true }),
    A('zip-list', 'archive', ['zip'], 'txt', 'List what is inside a ZIP', '', async function (f) { var names = []; window.fflate.unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: function (e) { names.push(e.name + '  ' + fmtSize(e.originalSize)); return false; } }); return textOut(baseName(f.name) + '.contents.txt', names.join('\n') || '(empty)'); }),
    A('zip-extract', 'archive', ['zip'], '*', 'Take every file out of a ZIP', 'Folders inside become part of each file name, joined with " - ".', async function (f) { var u = window.fflate.unzipSync(new Uint8Array(await f.arrayBuffer())); var out = []; Object.keys(u).forEach(function (n) { if (/\/$/.test(n)) return; if (out.length > 5000) throw new Error('More than 5000 files inside.'); out.push({ name: n.replace(/\//g, ' - '), blob: new Blob([u[n]]) }); }); return out; }),
    A('gzip-make', 'archive', ['*'], 'gz', 'Compress with gzip', '', async function (f) { return [{ name: f.name + '.gz', blob: new Blob([window.fflate.gzipSync(new Uint8Array(await f.arrayBuffer()), { filename: f.name })], { type: 'application/gzip' }) }]; }),
    A('gzip-open', 'archive', ['gzip'], '*', 'Uncompress gzip', '', async function (f) { return [{ name: f.name.replace(/\.gz$/i, '') || 'uncompressed.bin', blob: new Blob([window.fflate.gunzipSync(new Uint8Array(await f.arrayBuffer()))]) }]; }),
    off('7z-rar', 'archive', ['7z', 'rar'], '*', 'Open 7z or RAR', 'No 7z or RAR reader is bundled with this app.'),
    A('json-csv', 'data', ['json', 'csv', 'tsv'], 'csv', 'To CSV', 'Nested values are written as JSON text in their cell.', dataTo('csv')),
    A('json-tsv', 'data', ['json', 'csv', 'tsv'], 'tsv', 'To TSV', 'Tabs and line breaks inside values become spaces.', dataTo('tsv')),
    A('any-json', 'data', ['json', 'csv', 'tsv'], 'json', 'To JSON', 'From CSV or TSV, every value becomes text.', dataTo('json')),
    A('any-jsonl', 'data', ['json', 'csv', 'tsv'], 'jsonl', 'To JSON Lines', '', dataTo('jsonl')),
    A('any-yaml', 'data', ['json', 'csv', 'tsv'], 'yaml', 'To YAML', 'Nested values are written as JSON text.', dataTo('yaml')),
    A('any-toml', 'data', ['json', 'csv', 'tsv'], 'toml', 'To TOML', 'Nested values are written as JSON text.', dataTo('toml')),
    A('any-xml', 'data', ['json', 'csv', 'tsv'], 'xml', 'To XML', 'Names are made safe for XML tags.', dataTo('xml')),
    A('any-md', 'data', ['json', 'csv', 'tsv'], 'md', 'To a Markdown table', '', dataTo('md')),
    A('any-html', 'data', ['json', 'csv', 'tsv'], 'html', 'To an HTML table', '', dataTo('html')),
    A('any-sql', 'data', ['json', 'csv', 'tsv'], 'sql', 'To SQL inserts', 'Every column becomes TEXT.', dataTo('sql')),
    off('xlsx', 'data', ['xlsx', 'ods'], 'csv', 'Excel or OpenDocument spreadsheets', 'No spreadsheet reader is bundled with this app.'),
    A('txt-lf', 'text', ['text', 'json', 'csv', 'tsv', 'xml', 'svg'], 'txt', 'Line endings to LF (Linux, macOS)', 'Every CRLF and CR becomes LF.', textConv(function (s) { return s.replace(/\r\n?/g, '\n'); }, '.lf.txt')),
    A('txt-crlf', 'text', ['text', 'json', 'csv', 'tsv', 'xml', 'svg'], 'txt', 'Line endings to CRLF (Windows)', 'Every line ending becomes CRLF.', textConv(function (s) { return s.replace(/\r\n?|\n/g, '\r\n'); }, '.crlf.txt')),
    A('txt-trim', 'text', ['text', 'json', 'csv', 'tsv', 'xml', 'svg'], 'txt', 'Remove spaces at line ends', 'Trailing spaces and tabs are removed.', textConv(function (s) { return s.replace(/[ \t]+$/gm, ''); }, '.trimmed.txt')),
    A('txt-utf16', 'text', ['text', 'json', 'csv', 'tsv', 'xml'], 'txt', 'UTF-8 to UTF-16 LE with a byte order mark', 'The character encoding changes; the text does not.', async function (f) { var s = await f.text(), b = new Uint8Array(2 + s.length * 2); b[0] = 0xff; b[1] = 0xfe; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); b[2 + i * 2] = c & 255; b[3 + i * 2] = c >> 8; } return [{ name: baseName(f.name) + '.utf16.txt', blob: new Blob([b]) }]; }),
    A('json-pretty', 'text', ['json'], 'json', 'Format JSON neatly', 'Spacing changes; numbers past 15 digits may round.', textConv(function (s) { return JSON.stringify(JSON.parse(s), null, 2) + '\n'; }, '.formatted.json')),
    A('bin-b64', 'binary', ['*'], 'txt', 'To Base64 text', '', async function (f) { return textOut(f.name + '.base64.txt', await b64OfBlob(f, {})); }),
    A('b64-bin', 'binary', ['base64', 'dataurl'], '*', 'Base64 text back to the file', '', async function (f) { var s = await f.text(), p = parseDataUrl(s), bytes = p ? p.bytes : b64Decode(s, { lenient: true }); var t = sigOf(bytes); return [{ name: restoredName(f.name, p && p.mime, t), blob: new Blob([bytes]) }]; }),
    A('bin-hex', 'binary', ['*'], 'txt', 'To a hex dump', 'Files over 16 MB are not dumped.', async function (f) { if (f.size > 16 * MB) throw new Error('Over 16 MB.'); return textOut(f.name + '.hex.txt', hexDump(new Uint8Array(await f.arrayBuffer()))); })
  ];
  var conv = { files: [], cat: 'pdf', q: {}, opts: { pages: '1', order: '', angle: '90', metaTitle: '', metaAuthor: '', metaSubject: '', metaKeywords: '' }, running: false, paused: false, cancel: false, dest: '' };
  function adaptersFor(t) { return ADAPTERS.filter(function (a) { return a.from.indexOf('*') >= 0 || (t && a.from.indexOf(t.kind) >= 0); }); }
  R.convert = function () {
    var qd = conv.files.map(function (x) { return x.t; });
    var cats = CATS.map(function (c) {
      var m = matcher(conv.q[c[0]] || ''); var list = ADAPTERS.filter(function (a) { return a.cat === c[0] && m.test(a.name + ' ' + a.from.join(' ') + ' ' + a.to + ' ' + (a.why || '')); });
      return '<section class="section" id="cv-' + c[0] + '" data-k="cv-' + c[0] + '"><h2 class="tl">' + c[1] + ' <span class="bs mu">' + ADAPTERS.filter(function (a) { return a.cat === c[0] && a.enabled; }).length + ' available</span></h2>' + findField('cvq-' + c[0], 'Search ' + c[1].toLowerCase(), conv.q[c[0]] || '') + (m.ok ? '' : '<p class="field-err" role="alert">' + L('badPattern') + esc(m.error) + '</p>') +
        '<div class="col" style="gap:4px">' + (list.length ? list.map(function (a) { var fits = conv.files.length && (a.batch || conv.files.some(function (x) { return a.from.indexOf('*') >= 0 || a.from.indexOf(x.t.kind) >= 0; })); return '<div class="row-item" data-k="ad-' + a.id + '"><span class="col grow"><span class="ll">' + esc(a.name) + (a.enabled ? '' : ' <span class="tag">Not available</span>') + '</span><span class="bs mu">' + esc(a.from.join(', ').replace('*', 'any file')) + ' → ' + esc(a.to === '*' ? 'the original files' : a.to) + (a.enabled ? (a.lossy ? ' · Changes: ' + esc(a.lossy) : ' · Nothing is lost.') : ' · ' + esc(a.why)) + '</span></span>' + (a.enabled ? '<button class="btn ' + (fits ? 'tonal' : 'text') + ' sm" data-adapter="' + a.id + '"' + (fits && !conv.running ? '' : ' disabled') + '>' + (a.batch ? 'Run on the queue' : 'Convert') + '</button>' : '') + '</div>'; }).join('') : '<p class="bm mu">' + L('noMatch') + '</p>') + '</div></section>';
    }).join('');
    var counts = { done: 0, failed: 0, skipped: 0, cancelled: 0 }; conv.files.forEach(function (x) { if (counts[x.state] != null) counts[x.state]++; });
    var queue = '<section class="section card" id="queue" data-k="cvqueue" style="padding:20px"><div class="row" style="gap:8px;flex-wrap:wrap"><h2 class="tl grow">Files <span class="bs mu">' + conv.files.length + '</span></h2><label class="btn fill sm">' + icon('FilePlusOutline', 's') + 'Add files<input type="file" id="cvfiles" multiple hidden></label>' + (conv.files.length ? '<button class="btn text sm" data-act="cvclear"' + (conv.running ? ' disabled' : '') + '>' + L('clear') + '</button>' : '') + '</div>' +
      (conv.files.length ? '<p class="bs mu" aria-live="polite">' + counts.done + ' converted · ' + counts.failed + ' failed · ' + counts.skipped + ' skipped · ' + counts.cancelled + ' cancelled</p>' + (conv.running ? '<div class="row" style="gap:8px"><button class="btn tonal sm" data-act="cvpause">' + (conv.paused ? 'Resume' : 'Pause') + '</button><button class="btn text sm" data-act="cvcancel">' + L('cancel') + '</button></div>' : '') +
        '<div class="col" style="gap:2px;max-height:280px;overflow:auto">' + conv.files.slice(0, 500).map(function (x, i) { return '<div class="row-item" data-k="cvf-' + i + '"><span class="col grow" style="min-width:0"><span class="ll ell">' + esc(x.file.name) + '</span><span class="bs mu">' + esc(x.t.kind.toUpperCase()) + ' by its bytes · ' + fmtSize(x.file.size) + (x.msg ? ' · ' + esc(x.msg) : '') + '</span></span><span class="tag ' + (x.state === 'done' ? 'g' : x.state === 'failed' ? 'a' : x.state === 'working' ? 'p' : '') + '">' + esc(x.state) + '</span>' + (x.out ? x.out.map(function (o, j) { return '<button class="btn text sm" data-cvsave="' + i + ':' + j + '">' + icon('Download', 's') + esc(o.name) + '</button>'; }).join('') : '') + '</div>'; }).join('') + (conv.files.length > 500 ? '<p class="bs mu">And ' + (conv.files.length - 500) + ' more.</p>' : '') + '</div>'
        : '<div class="empty" style="padding:24px"><p class="bm mu">Add or drop files here. Their type is read from their first bytes, then only the conversions that fit light up below.</p></div>') +
      '<details class="fold"><summary class="ll">' + icon('Tune', 's') + 'Options for pages, rotation and metadata</summary><div class="plan" style="padding-top:8px"><label><span class="ll">Pages to extract</span><input class="input" data-cvopt="pages" value="' + esc(conv.opts.pages) + '" placeholder="1-3, 7"></label><label><span class="ll">New order</span><input class="input" data-cvopt="order" value="' + esc(conv.opts.order) + '" placeholder="3, 1, 2"></label><label><span class="ll">Rotate by</span><select class="select" data-cvopt="angle">' + ['90', '180', '270'].map(function (a) { return '<option' + (conv.opts.angle === a ? ' selected' : '') + '>' + a + '</option>'; }).join('') + '</select></label>' + ['Title', 'Author', 'Subject', 'Keywords'].map(function (k) { return '<label><span class="ll">' + k + '</span><input class="input" data-cvopt="meta' + k + '" value="' + esc(conv.opts['meta' + k]) + '"></label>'; }).join('') + '</div></details>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap"><span class="bs mu grow">' + (DEMO ? 'Results download.' : conv.dest ? 'Results go to ' + esc(conv.dest) + '.' : 'Results are saved beside each source file, never over an existing one.') + '</span>' + (DEMO ? '' : '<button class="btn text sm" data-act="cvdest">' + icon('FolderOpen', 's') + (conv.dest ? 'Change the folder' : 'Choose a folder instead') + '</button>') + '</div></section>';
    var hist = (st.convHistory || []).slice(0, 30);
    return '<div class="section" id="top"><h1 class="hl">Convert</h1><p class="bl mu">Files are read and converted on this computer by libraries inside the app. Formats it cannot convert are listed too, with the reason.</p></div>' + queue + cats +
      '<section class="section" id="cvhist" data-k="cvhist"><div class="row"><h2 class="tl grow">History</h2>' + (hist.length ? '<button class="btn text sm" data-act="cvhistexport">' + icon('Export', 's') + L('export') + '</button><button class="btn text sm" data-act="cvhistclear">' + L('clear') + '</button>' : '') + '</div>' + (hist.length ? hist.map(function (h) { return '<div class="row-item"><span class="col grow"><span class="ll">' + esc(h.source) + ' → ' + esc(h.result) + '</span><span class="bs mu">' + esc(when(h.at)) + ' · ' + esc(h.adapter) + ' · ' + fmtSize(h.size) + ' · SHA-256 ' + esc(h.sha.slice(0, 16)) + '…</span></span></div>'; }).join('') : '<p class="bm mu">Nothing converted yet.</p>') + '</section>' + foot();
  };
  async function cvAdd(list) { for (var i = 0; i < list.length; i++) { var f = list[i]; if (f.size > 500 * MB) { toast(f.name + ' is over 500 MB and was skipped.'); continue; } conv.files.push({ file: f, t: await detect(f), state: 'waiting' }); } render(); }
  async function cvDeliver(x, o) {
    var bytes = new Uint8Array(await o.blob.arrayBuffer());
    if (DEMO || !API.writeBeside) { var a = document.createElement('a'); a.href = URL.createObjectURL(o.blob); a.download = o.name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); return o.name; }
    return conv.dest ? API.writeInto(conv.dest, o.name, bytes) : API.writeBeside(x.file, o.name, bytes);
  }
  function cvRecord(x, a, o, sha) { st.convHistory = [{ at: new Date().toISOString(), source: x ? x.file.name : 'the queue', result: o.name, adapter: a.name, size: o.blob.size, sha: sha }].concat(st.convHistory || []).slice(0, 200); save(); }
  async function cvRun(id) {
    var a = ADAPTERS.filter(function (z) { return z.id === id; })[0]; if (!a || !a.enabled) return;
    var go2 = async function () {
      conv.running = true; conv.cancel = false; render();
      if (a.batch) {
        var fit = conv.files.filter(function (x) { return a.from.indexOf('*') >= 0 || a.from.indexOf(x.t.kind) >= 0; });
        conv.files.forEach(function (x) { if (fit.indexOf(x) < 0) { x.state = 'skipped'; x.msg = 'Not a fit for ' + a.name; } else { x.state = 'working'; x.msg = ''; } }); render();
        try { var outs = await a.batch(fit.map(function (x) { return x.file; })); for (var j = 0; j < outs.length; j++) { var where = await cvDeliver(fit[0], outs[j]); cvRecord(null, a, outs[j], await sha256(await outs[j].blob.arrayBuffer())); toast('Saved ' + outs[j].name + (outs[j].note ? ' (' + outs[j].note + ')' : '') + '.'); if (!DEMO) cvShow(where); } fit.forEach(function (x) { x.state = 'done'; x.msg = 'In ' + outs[0].name; }); finishedOne(); }
        catch (e) { fit.forEach(function (x) { x.state = 'failed'; x.msg = e.message; }); toast(a.name + ': ' + e.message); }
      } else {
        var pending = conv.files.filter(function (x) { return x.state !== 'done' || x.adapter !== a.id; }), i = 0;
        var worker = async function () {
          while (i < pending.length) {
            var x = pending[i++];
            if (conv.cancel) { x.state = 'cancelled'; continue; }
            while (conv.paused && !conv.cancel) await new Promise(function (r) { setTimeout(r, 300); });
            if (a.from.indexOf('*') < 0 && a.from.indexOf(x.t.kind) < 0) { x.state = 'skipped'; x.msg = 'Its bytes say ' + x.t.kind.toUpperCase() + ', which this does not take'; continue; }
            x.state = 'working'; x.msg = ''; soon();
            try { var outs = await a.run(x.file, x.t, conv.opts); x.out = []; for (var j = 0; j < outs.length; j++) { var p2 = await cvDeliver(x, outs[j]); outs[j].path = p2; x.out.push(outs[j]); cvRecord(x, a, outs[j], await sha256(await outs[j].blob.arrayBuffer())); } x.state = 'done'; x.adapter = a.id; x.msg = outs.length + ' file' + (outs.length > 1 ? 's' : '') + (outs[0] && outs[0].note ? ', ' + outs[0].note : ''); }
            catch (e) { x.state = 'failed'; x.msg = e.message; }
            soon();
          }
        };
        await Promise.all([worker(), worker()]);
        var nd = conv.files.filter(function (x) { return x.state === 'done'; }).length; toast(nd + ' converted. Each result was written whole or not at all.'); if (nd) finishedOne();
      }
      conv.running = false; conv.paused = false; render();
    };
    if (a.lossy) { dialog(a.name, '<p class="bm">Before it runs, what can change:</p><div class="note"><span>' + icon('InformationOutline') + '</span><span class="bm">' + esc(a.lossy) + '</span></div><p class="bs mu">The source files stay as they are. Results never replace an existing file.</p><div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" data-act="dlg-close">' + L('cancel') + '</button><button class="btn fill" id="cvok">Convert</button></div>', { emoji: '🔁' }); $('#cvok').onclick = function () { closeDialog(); go2(); }; }
    else go2();
  }
  function cvShow(p) { if (p && API.showFile) toast(p, { emoji: '📁' }); }

  // ---------- Base64 toolkit ----------
  var B64A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64Encode(bytes, o) {
    var out = '', i;
    for (i = 0; i + 2 < bytes.length; i += 3) { var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]; out += B64A[n >> 18 & 63] + B64A[n >> 12 & 63] + B64A[n >> 6 & 63] + B64A[n & 63]; }
    var r = bytes.length - i; if (r === 1) { var a = bytes[i] << 16; out += B64A[a >> 18 & 63] + B64A[a >> 12 & 63] + '=='; } else if (r === 2) { var b = (bytes[i] << 16) | (bytes[i + 1] << 8); out += B64A[b >> 18 & 63] + B64A[b >> 12 & 63] + B64A[b >> 6 & 63] + '='; }
    if (o.url) out = out.replace(/\+/g, '-').replace(/\//g, '_'); if (o.pad === false) out = out.replace(/=+$/, '');
    var wrap = o.mime ? 76 : +o.wrap || 0; if (wrap) out = out.match(new RegExp('.{1,' + wrap + '}', 'g')).join('\r\n');
    return out;
  }
  function b64Decode(s, o) {
    o = o || {}; var src = String(s), clean = '', url = o.url;
    for (var k = 0; k < src.length; k++) { var ch = src[k]; if (/\s/.test(ch)) { if (o.strict && !(o.mime && (ch === '\r' || ch === '\n'))) throw new Error('A space or line break at offset ' + k + ' is not allowed in strict mode.'); continue; } clean += ch; }
    if (!o.strict) { clean = clean.replace(/-/g, '+').replace(/_/g, '/'); }
    else if (url) { var bad = /[+/]/.exec(clean); if (bad) throw new Error('"' + bad[0] + '" at offset ' + bad.index + ' is not in the URL-safe alphabet.'); clean = clean.replace(/-/g, '+').replace(/_/g, '/'); }
    var m = /[^A-Za-z0-9+/=]/.exec(clean); if (m) throw new Error('"' + m[0] + '" at offset ' + m.index + ' is not Base64.');
    var eq = clean.indexOf('='); if (eq >= 0 && /[^=]/.test(clean.slice(eq))) throw new Error('Padding "=" at offset ' + eq + ' is followed by more characters.');
    if (clean.length % 4) { if (o.strict && o.pad !== false) throw new Error('The length is not a multiple of 4: padding is missing.'); if (clean.length % 4 === 1) throw new Error('The text ends with one stray character.'); clean += '===='.slice(clean.length % 4); }
    var bin = atob(clean), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
  }
  function encText(s, enc) { if (enc === 'utf-8') return new TextEncoder().encode(s); var b = []; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); if (enc === 'latin1') { if (c > 255) throw new Error('"' + s[i] + '" at position ' + i + ' does not exist in Latin-1.'); b.push(c); } else if (enc === 'utf-16le') b.push(c & 255, c >> 8); else b.push(c >> 8, c & 255); } return new Uint8Array(b); }
  function decText(b, enc) { return new TextDecoder(enc === 'latin1' ? 'iso-8859-1' : enc, { fatal: true }).decode(b); }
  async function b64OfBlob(blob, o, progress) { var parts = [], CH = 3 * MB; for (var i = 0; i < blob.size; i += CH) { if (o.cancel && o.cancel()) throw new Error('Cancelled.'); parts.push(b64Encode(await readBytes(blob, i, i + CH), { url: o.url, pad: true })); if (progress) progress(Math.min(1, (i + CH) / blob.size)); } var out = parts.join(''); if (o.pad === false) out = out.replace(/=+$/, ''); var wrap = o.mime ? 76 : +o.wrap || 0; if (wrap && out) out = out.match(new RegExp('.{1,' + wrap + '}', 'g')).join('\r\n'); return out; }
  function parseDataUrl(s) { var m = /^\s*data:([\w.+-]+\/[\w.+-]+)?((?:;[\w-]+=[^;,]*)*)(;base64)?,(.*)$/s.exec(s); if (!m) return null; var params = {}; (m[2] || '').split(';').filter(Boolean).forEach(function (p) { var kv = p.split('='); params[kv[0]] = kv[1]; }); return { mime: m[1] || 'text/plain', params: params, base64: !!m[3], bytes: m[3] ? b64Decode(m[4], { lenient: true }) : new TextEncoder().encode(decodeURIComponent(m[4])) }; }
  function sigOf(b) { var h = hex(b, 16); for (var i = 0; i < SIGS.length; i++) { var s = SIGS[i]; if (typeof s[2] === 'string' ? h.indexOf(s[2]) === 0 : s[2].test(h)) return { kind: s[0], mime: s[1] }; } try { new TextDecoder('utf-8', { fatal: true }).decode(b.slice(0, 4096)); return { kind: 'txt', mime: 'text/plain' }; } catch (e) { return { kind: 'bin', mime: 'application/octet-stream' }; } }
  function restoredName(name, mime, t) { var m = /^(.*)\.base64\.txt$/i.exec(name) || /^(.*)\.b64$/i.exec(name); if (m && /\.[\w]{1,8}$/.test(m[1])) return m[1]; var ext = mime && { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'application/pdf': 'pdf', 'text/plain': 'txt', 'application/json': 'json', 'application/zip': 'zip' }[mime]; return (m ? m[1] : baseName(name)) + '.' + (ext || (t && t.kind !== 'bin' ? (t.kind === 'jpeg' ? 'jpg' : t.kind) : 'bin')); }
  function hexDump(b) { var lines = []; for (var i = 0; i < b.length; i += 16) { var row = b.slice(i, i + 16); lines.push(('0000000' + i.toString(16)).slice(-8) + '  ' + hex(row).replace(/(..)/g, '$1 ').padEnd(48) + ' ' + Array.prototype.map.call(row, function (c) { return c >= 32 && c < 127 ? String.fromCharCode(c) : '.'; }).join('')); } return lines.join('\n'); }
  var b64 = { o: { url: false, pad: true, mime: false, wrap: '', strict: false, enc: 'utf-8' }, input: '', output: '', note: '', undo: [], redo: [], preview: null, files: [] };
  function b64Push() { b64.undo.push({ input: b64.input, output: b64.output }); b64.redo = []; }
  R.base64 = function () {
    var o = b64.o, inB = 0, outB = 0; try { inB = encText(b64.input, o.enc).length; } catch (e) { inB = '?'; } outB = new TextEncoder().encode(b64.output).length;
    var chip = function (k, label) { return '<button class="chip' + (o[k] ? ' sel' : '') + '" aria-pressed="' + !!o[k] + '" data-b64o="' + k + '">' + label + '</button>'; };
    return '<div class="section" id="top"><h1 class="hl">Base64</h1><p class="bl mu">Encode and decode text and files on this computer. Nothing is uploaded.</p></div>' +
      '<section class="section card" id="b64opts" data-k="b64opts" style="padding:20px"><h2 class="tl">Options</h2><div class="chipline">' + chip('url', 'URL-safe (RFC 4648 §5)') + chip('pad', 'Padding') + chip('mime', 'MIME lines (76, CRLF)') + chip('strict', 'Strict decoding') + '<label class="row bs" style="gap:6px">Line length <input class="input" style="width:90px" type="number" min="0" max="1000" data-b64wrap value="' + esc(o.wrap) + '" aria-label="Custom line length, 0 for none"' + (o.mime ? ' disabled' : '') + '></label><label class="row bs" style="gap:6px">Text encoding <select class="select" data-b64enc aria-label="Text encoding">' + [['utf-8', 'UTF-8'], ['utf-16le', 'UTF-16 LE'], ['utf-16be', 'UTF-16 BE'], ['latin1', 'Latin-1']].map(function (e) { return '<option value="' + e[0] + '"' + (o.enc === e[0] ? ' selected' : '') + '>' + e[1] + '</option>'; }).join('') + '</select></label></div></section>' +
      '<section class="section" id="b64text" data-k="b64text"><h2 class="tl">Text</h2><div class="grid2"><label class="col" style="gap:4px"><span class="ll">Input <span class="bs mu">' + inB + ' bytes</span></span><textarea class="input" id="b64i" rows="7" aria-label="Base64 input">' + esc(b64.input) + '</textarea></label><label class="col" style="gap:4px"><span class="ll">Output <span class="bs mu">' + outB + ' bytes</span></span><textarea class="input mono" id="b64o" rows="7" readonly aria-label="Base64 output">' + esc(b64.output) + '</textarea></label></div>' +
      '<div class="chipline"><button class="btn fill sm" data-act="b64e">Encode</button><button class="btn tonal sm" data-act="b64d">Decode</button><button class="btn text sm" data-act="b64swap">' + icon('SwapHorizontal', 's') + 'Swap</button><button class="btn text sm" data-act="b64url">Make a data: URL</button><button class="btn text sm" data-act="b64parse">Read a data: URL</button><button class="btn text sm" data-act="b64paste">' + icon('ContentPaste', 's') + 'Paste</button><button class="btn text sm" data-copy="' + esc(b64.output) + '"' + (b64.output ? '' : ' disabled') + '>' + icon('ContentCopy', 's') + L('copy') + '</button><button class="btn text sm" data-act="b64undo"' + (b64.undo.length ? '' : ' disabled') + '>Undo</button><button class="btn text sm" data-act="b64redo"' + (b64.redo.length ? '' : ' disabled') + '>Redo</button><button class="btn text sm" data-act="b64record"' + (b64.output ? '' : ' disabled') + '>Save a record (JSON)</button></div><p class="bs" id="b64note" role="status" aria-live="polite">' + esc(b64.note) + '</p>' +
      (b64.preview ? '<div class="card" style="padding:12px" data-k="b64prev"><span class="ll">Preview: ' + esc(b64.preview.kind) + ', ' + b64.preview.size + ' bytes</span>' + b64.preview.html + '</div>' : '') + '</section>' +
      '<section class="section" id="b64files" data-k="b64files"><h2 class="tl">Files</h2><p class="bm mu">' + (DEMO ? 'Results download as report.pdf.base64.txt, or with the original name restored.' : 'Encoding writes report.pdf.base64.txt beside report.pdf; decoding restores the original name beside the .txt. Nothing is ever overwritten; each result is checked by decoding it again and comparing SHA-256.') + '</p><div class="grid2"><label class="b64drop" data-b64drop="enc" tabindex="0">' + icon('FileUploadOutline') + '<span class="ll">Encode</span><span class="bs mu">Drop files or choose</span><input type="file" multiple hidden data-b64file="enc"></label><label class="b64drop" data-b64drop="dec" tabindex="0">' + icon('FileDownloadOutline') + '<span class="ll">Decode</span><span class="bs mu">Drop .base64.txt or .b64 files, or choose</span><input type="file" multiple hidden data-b64file="dec"></label></div>' +
      (b64.files.length ? '<div class="col" style="gap:2px">' + b64.files.slice(-50).reverse().map(function (f) { return '<div class="row-item"><span class="col grow"><span class="ll">' + esc(f.name) + ' → ' + esc(f.result || '…') + '</span><span class="bs mu">' + esc(f.msg) + '</span></span>' + (f.fraction != null && f.fraction < 1 && !f.done ? '<span class="pbar" role="progressbar" aria-valuenow="' + Math.round(f.fraction * 100) + '" aria-valuemin="0" aria-valuemax="100" style="width:120px"><i style="width:' + Math.round(f.fraction * 100) + '%"></i></span>' : '<span class="tag ' + (f.ok ? 'g' : f.done ? 'a' : '') + '">' + (f.ok ? 'Verified' : f.done ? 'Failed' : 'Working') + '</span>') + '</div>'; }).join('') + '</div><div class="row" style="gap:8px"><button class="btn text sm" data-act="b64zip">' + icon('FolderZipOutline', 's') + 'Export the results as a ZIP record</button><button class="btn text sm" data-act="b64fclear">' + L('clear') + '</button></div>' : '') + '</section>' + foot();
  };
  function b64Note(t) { b64.note = t; var n = $('#b64note'); if (n) n.textContent = t; }
  function b64Preview(bytes) {
    var t = sigOf(bytes), html = '';
    if (/^(png|jpeg|gif|webp|bmp)$/.test(t.kind)) { var url = URL.createObjectURL(new Blob([bytes], { type: t.mime })); html = '<img src="' + url + '" alt="The decoded picture" style="max-width:100%;max-height:240px;display:block;margin-top:8px;border-radius:12px">'; }
    else if (t.kind === 'txt') html = '<pre class="wb-test" style="max-height:200px;overflow:auto">' + esc(new TextDecoder().decode(bytes.slice(0, 8192))) + (bytes.length > 8192 ? '\n…' : '') + '</pre>';
    else html = '<pre class="wb-test" style="max-height:200px;overflow:auto">' + esc(hexDump(bytes.slice(0, 1024))) + (bytes.length > 1024 ? '\n…' : '') + '</pre>';
    b64.preview = { kind: t.kind.toUpperCase(), size: bytes.length, html: html };
  }
  async function b64File(file, mode) {
    var rec = { name: file.name, msg: 'Starting', fraction: 0 }; b64.files.push(rec); render();
    try {
      var out, outName;
      if (mode === 'enc') {
        if (file.size > 1024 * MB) throw new Error('Over 1 GB.');
        var text = await b64OfBlob(file, Object.assign({}, b64.o), function (f) { rec.fraction = f; rec.msg = Math.round(f * 100) + '%'; soon(); });
        out = new TextEncoder().encode(text); outName = file.name + '.base64.txt';
        var back = b64Decode(text, { lenient: true }); if (await sha256(back) !== await sha256(await file.arrayBuffer())) throw new Error('Decoding the result again did not give the same bytes.');
      } else {
        var s = await file.text(), p = parseDataUrl(s); var bytes = p ? p.bytes : b64Decode(s, Object.assign({}, b64.o));
        var t = sigOf(bytes); outName = restoredName(file.name, p && p.mime, t); out = bytes;
        var re = b64Encode(bytes, { url: false, pad: true }); if (await sha256(b64Decode(re, {})) !== await sha256(bytes)) throw new Error('The round trip did not match.');
      }
      rec.result = await cvDeliver({ file: file }, { name: outName, blob: new Blob([out]) });
      rec.ok = true; rec.done = true; rec.sha = await sha256(out); rec.size = out.length; rec.msg = fmtSize(out.length) + ' · SHA-256 ' + rec.sha.slice(0, 16) + '… matches after a round trip';
      st.convHistory = [{ at: new Date().toISOString(), source: file.name, result: outName, adapter: mode === 'enc' ? 'Base64 encode' : 'Base64 decode', size: out.length, sha: rec.sha }].concat(st.convHistory || []).slice(0, 200); save();
    } catch (e) { rec.done = true; rec.msg = e.message; }
    rec.fraction = 1; render();
  }

  // ---------- QR codes: make one from any text, and show an authenticator code's QR ----------
  function qrSvg(text, size) {
    if (!window.qrcode) throw new Error('The QR maker did not load.');
    var q = window.qrcode(0, 'M'); q.addData(unescape(encodeURIComponent(text)), 'Byte'); q.make();
    var n = q.getModuleCount(), cell = Math.max(2, Math.floor((size || 240) / (n + 8))), dim = (n + 8) * cell, d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + ((c + 4) * cell) + ' ' + ((r + 4) * cell) + 'h' + cell + 'v' + cell + 'h-' + cell + 'z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" width="' + dim + '" height="' + dim + '" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  function qrShow(title, text) {
    var svg; try { svg = qrSvg(text, 280); } catch (e) { toast(e.message); return; }
    dialog(title, '<div style="display:grid;place-items:center">' + svg + '</div><p class="bs mu" style="word-break:break-all">' + esc(text.length > 160 ? text.slice(0, 160) + '…' : text) + '</p><div class="row" style="gap:8px"><span class="grow"></span><button class="btn text" id="qrsvg">Save as SVG</button><button class="btn tonal" id="qrpng">Save as PNG</button><button class="btn fill" data-act="dlg-close">' + L('done') + '</button></div>', { emoji: '🔳' });
    $('#qrsvg').onclick = function () { saveText('qr-code.svg', svg); };
    $('#qrpng').onclick = function () { var img = new Image(); img.onload = function () { var c = document.createElement('canvas'); c.width = img.width * 2; c.height = img.height * 2; var x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, c.width, c.height); c.toBlob(function (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'qr-code.png'; a.click(); }); }; img.src = 'data:image/svg+xml;base64,' + btoa(svg); };
  }

  // ---------- ZIP of an export in every format ----------
  function zipAll(name, rows) {
    var files = {}; FORMATS.forEach(function (f) { files[name + '.' + f] = new TextEncoder().encode(fmtRows(rows, f, name)); });
    var z = window.fflate.zipSync(files); var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([z], { type: 'application/zip' })); a.download = name + '-' + new Date().toISOString().slice(0, 10) + '.zip'; a.click(); toast('Saved a ZIP with ' + FORMATS.length + ' formats.');
  }

  // ---------- Drawing (Drawesome-style): seven pens, an area eraser, SVG and PNG export ----------
  var PENS = [['pencil', 'Pencil', 'P', 2, 0.9, 'speed'], ['pen', 'Pen', 'N', 3, 1, 'speed'], ['fineliner', 'Fineliner', 'F', 2, 1, 'const'], ['marker', 'Marker', 'M', 8, 1, 'const'], ['highlighter', 'Highlighter', 'H', 18, 0.35, 'const'], ['brush', 'Brush', 'B', 10, 1, 'speed'], ['fountain', 'Fountain Pen', 'O', 5, 1, 'angle']];
  var INKS = ['#1c1b1f', '#00639b', '#b3261e', '#2e7d32', '#e8a600', '#7b1fa2', '#ffffff'];
  var dr = { strokes: null, undo: [], redo: [], tool: 'pen', color: '#1c1b1f', size: 1, mode: 'tools', bg: null, cur: null };
  function drLoad() { if (dr.strokes) return; try { dr.strokes = JSON.parse(localStorage.getItem('ham-draw-v1') || '[]'); } catch (e) { dr.strokes = []; } }
  function drSave() { try { localStorage.setItem('ham-draw-v1', JSON.stringify(dr.strokes.slice(-2000))); } catch (e) { toast('The drawing is too large to keep; export it to save it.'); } }
  function drSnap() { dr.undo.push(JSON.stringify(dr.strokes)); if (dr.undo.length > 200) dr.undo.shift(); dr.redo = []; }
  // Each point gets a width from the pen's character: faster strokes thin, the fountain pen follows direction.
  function drWidth(pen, p, prev, size) { var base = pen[3] * size; if (!prev) return base; if (pen[5] === 'speed') { var v = Math.hypot(p[0] - prev[0], p[1] - prev[1]) / Math.max(1, p[2] - prev[2]); return Math.max(base * 0.35, base * (1.3 - Math.min(1, v / 2.5))); } if (pen[5] === 'angle') { var a = Math.atan2(p[1] - prev[1], p[0] - prev[0]); return base * (0.35 + 0.9 * Math.abs(Math.sin(a - Math.PI / 4))); } return base; }
  function drPath(s) { var pen = PENS.filter(function (x) { return x[0] === s.tool; })[0] || PENS[1], out = []; for (var i = 1; i < s.pts.length; i++) out.push({ a: s.pts[i - 1], b: s.pts[i], w: drWidth(pen, s.pts[i], s.pts[i - 1], s.size) }); return { pen: pen, segs: out }; }
  function drPaint() {
    var c = $('#drawc'); if (!c) return; var dpr = devicePixelRatio || 1, W2 = c.clientWidth, H = c.clientHeight; c.width = W2 * dpr; c.height = H * dpr; var x = c.getContext('2d'); x.scale(dpr, dpr); x.clearRect(0, 0, W2, H);
    if (dr.bg) x.drawImage(dr.bg, 0, 0, Math.min(W2, dr.bg.width), Math.min(H, dr.bg.height * Math.min(W2, dr.bg.width) / dr.bg.width));
    dr.strokes.concat(dr.cur ? [dr.cur] : []).forEach(function (s) { var p = drPath(s); x.globalAlpha = p.pen[4]; x.strokeStyle = s.color; x.lineCap = p.pen[0] === 'highlighter' || p.pen[0] === 'marker' ? 'square' : 'round'; x.lineJoin = 'round'; if (s.pts.length === 1) { x.fillStyle = s.color; x.beginPath(); x.arc(s.pts[0][0], s.pts[0][1], p.pen[3] * s.size / 2, 0, 7); x.fill(); } if (p.pen[5] === 'const' && p.segs.length) { x.lineWidth = p.segs[0].w; x.beginPath(); x.moveTo(s.pts[0][0], s.pts[0][1]); s.pts.slice(1).forEach(function (q2) { x.lineTo(q2[0], q2[1]); }); x.stroke(); } else p.segs.forEach(function (g) { x.lineWidth = g.w; x.beginPath(); x.moveTo(g.a[0], g.a[1]); x.lineTo(g.b[0], g.b[1]); x.stroke(); }); });
    x.globalAlpha = 1;
  }
  function drSvg() { var c = $('#drawc'), W2 = c ? c.clientWidth : 1000, H = c ? c.clientHeight : 700; return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W2 + '" height="' + H + '" viewBox="0 0 ' + W2 + ' ' + H + '">' + dr.strokes.map(function (s) { var p = drPath(s); if (s.pts.length === 1) return '<circle cx="' + s.pts[0][0] + '" cy="' + s.pts[0][1] + '" r="' + p.pen[3] * s.size / 2 + '" fill="' + s.color + '" opacity="' + p.pen[4] + '"/>'; if (p.pen[5] === 'const') return '<polyline points="' + s.pts.map(function (q2) { return q2[0].toFixed(1) + ',' + q2[1].toFixed(1); }).join(' ') + '" stroke="' + s.color + '" stroke-width="' + (p.segs[0] ? p.segs[0].w : 2) + '" opacity="' + p.pen[4] + '" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'; return '<g stroke="' + s.color + '" opacity="' + p.pen[4] + '" stroke-linecap="round" fill="none">' + p.segs.map(function (g) { return '<line x1="' + g.a[0].toFixed(1) + '" y1="' + g.a[1].toFixed(1) + '" x2="' + g.b[0].toFixed(1) + '" y2="' + g.b[1].toFixed(1) + '" stroke-width="' + g.w.toFixed(2) + '"/>'; }).join('') + '</g>'; }).join('') + '</svg>'; }
  // The eraser removes only the points it covers, splitting a stroke in two where needed.
  function drErase(px, py, r) { var changed = false, out = []; dr.strokes.forEach(function (s) { var run = []; s.pts.forEach(function (p) { if (Math.hypot(p[0] - px, p[1] - py) <= r) { changed = true; if (run.length) out.push(Object.assign({}, s, { pts: run })); run = []; } else run.push(p); }); if (run.length) out.push(Object.assign({}, s, { pts: run })); }); if (changed) dr.strokes = out; return changed; }
  R.draw = function () {
    drLoad(); var pen = PENS.filter(function (x) { return x[0] === dr.tool; })[0];
    var bar = dr.mode === 'min' ? '<button class="drawdisc" data-drmode="tools" aria-label="Open the drawing toolbar. Active: ' + (pen ? pen[1] : 'Eraser') + '"><span style="background:' + dr.color + '"></span>' + icon(dr.tool === 'eraser' ? 'Eraser' : 'Draw', 's') + '</button>' :
      '<div class="drawbar" role="toolbar" aria-label="Drawing tools" data-k="drawbar">' + (dr.mode === 'colors' ? INKS.map(function (c) { return '<button class="ink' + (c === dr.color ? ' sel' : '') + '" data-drink="' + c + '" aria-label="Ink ' + c + '" aria-pressed="' + (c === dr.color) + '" style="background:' + c + '"></button>'; }).join('') + '<input type="color" data-drinkc value="' + dr.color + '" aria-label="Any ink colour">' :
        dr.mode === 'size' ? '<label class="row bs" style="gap:8px">Size <input type="range" min="0.25" max="4" step="0.25" value="' + dr.size + '" data-drsize aria-label="Pen size"> ' + dr.size + '×</label>' :
        PENS.map(function (p) { return '<button class="ib' + (dr.tool === p[0] ? ' sel' : '') + '" data-drtool="' + p[0] + '" aria-pressed="' + (dr.tool === p[0]) + '" title="' + p[1] + ' (' + p[2] + ')" aria-label="' + p[1] + ', shortcut ' + p[2] + '"><span class="penmark" style="height:' + Math.min(14, p[3]) + 'px;opacity:' + p[4] + ';background:' + dr.color + '"></span></button>'; }).join('') + '<button class="ib' + (dr.tool === 'eraser' ? ' sel' : '') + '" data-drtool="eraser" aria-pressed="' + (dr.tool === 'eraser') + '" title="Eraser (E)" aria-label="Eraser, shortcut E">' + icon('Eraser', 's') + '</button>') +
        '<span class="drsep"></span><button class="ib" data-drmode="' + (dr.mode === 'colors' ? 'tools' : 'colors') + '" aria-label="Colours" title="Colours (C)"><span class="inkdot" style="background:' + dr.color + '"></span></button><button class="ib" data-drmode="' + (dr.mode === 'size' ? 'tools' : 'size') + '" aria-label="Size" title="Size (S)">' + icon('FormatLineWeight', 's') + '</button><button class="ib" data-act="drundo" aria-label="Undo" title="Undo (Ctrl Z)"' + (dr.undo.length ? '' : ' disabled') + '>' + icon('Undo', 's') + '</button><button class="ib" data-act="drredo" aria-label="Redo" title="Redo (Ctrl Y)"' + (dr.redo.length ? '' : ' disabled') + '>' + icon('Redo', 's') + '</button><button class="ib" data-drmode="min" aria-label="Make the toolbar small" title="Minimise">' + icon('ChevronDown', 's') + '</button></div>';
    return '<div class="section" id="top"><div class="row" style="gap:8px;flex-wrap:wrap"><h1 class="hl grow">Draw</h1><label class="btn text sm">' + icon('ImageOutline', 's') + 'Draw on a picture<input type="file" accept="image/*" hidden id="drbg"></label><button class="btn text sm" data-act="drsvg">SVG</button><button class="btn text sm" data-act="drpng1">PNG 1×</button><button class="btn text sm" data-act="drpng2">2×</button><button class="btn text sm" data-act="drpng3">3×</button><button class="btn text sm" data-act="drclear"' + (dr.strokes.length ? '' : ' disabled') + '>' + L('clear') + '</button></div><p class="bs mu">Shift keeps a stroke to one of eight directions. Your strokes stay on this computer and come back next time. ' + dr.strokes.length + ' strokes.</p></div>' +
      '<div class="drawwrap" data-k="drawwrap"><canvas id="drawc" tabindex="0" aria-label="Drawing surface. Use the pens with a mouse, pen or finger; keys P, N, F, M, H, B, O choose pens and E the eraser." style="cursor:crosshair"></canvas>' + bar + '</div>' + foot();
  };
  function drExportPng(scale) { var c = $('#drawc'); var o = document.createElement('canvas'); o.width = c.clientWidth * scale; o.height = c.clientHeight * scale; var x = o.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, o.width, o.height); var img = new Image(); img.onload = function () { x.drawImage(img, 0, 0, o.width, o.height); o.toBlob(function (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'drawing-' + scale + 'x.png'; a.click(); }); }; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(drSvg()); }
  (function drInput() {
    var down = false, start = null;
    document.addEventListener('pointerdown', function (e) { if (e.target.id !== 'drawc') return; e.target.setPointerCapture(e.pointerId); var r = e.target.getBoundingClientRect(), p = [e.clientX - r.left, e.clientY - r.top, e.timeStamp]; down = true; drSnap(); if (dr.tool === 'eraser') { drErase(p[0], p[1], 14 * dr.size); drPaint(); return; } start = p; dr.cur = { tool: dr.tool, color: dr.color, size: dr.size, pts: [p] }; drPaint(); });
    document.addEventListener('pointermove', function (e) { if (!down || e.target.id !== 'drawc') return; var r = e.target.getBoundingClientRect(), p = [e.clientX - r.left, e.clientY - r.top, e.timeStamp]; if (dr.tool === 'eraser') { if (drErase(p[0], p[1], 14 * dr.size)) drPaint(); return; } if (e.shiftKey && start) { var a = Math.round(Math.atan2(p[1] - start[1], p[0] - start[0]) / (Math.PI / 4)) * (Math.PI / 4), d = Math.hypot(p[0] - start[0], p[1] - start[1]); dr.cur.pts = [start, [start[0] + Math.cos(a) * d, start[1] + Math.sin(a) * d, p[2]]]; } else dr.cur.pts.push(p); drPaint(); });
    document.addEventListener('pointerup', function () { if (!down) return; down = false; if (dr.cur) { dr.strokes.push(dr.cur); dr.cur = null; } drSave(); render(); });
    document.addEventListener('keydown', function (e) {
      if (st.active !== 'draw' || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || $('#ov')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); action('drundo'); return; } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); action('drredo'); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return; var k = e.key.toUpperCase(), pen = PENS.filter(function (p) { return p[2] === k; })[0];
      if (pen) { dr.tool = pen[0]; render(); } else if (k === 'E') { dr.tool = 'eraser'; render(); } else if (k === 'C') { dr.mode = dr.mode === 'colors' ? 'tools' : 'colors'; render(); } else if (k === 'S') { dr.mode = dr.mode === 'size' ? 'tools' : 'size'; render(); }
    });
    window.addEventListener('resize', function () { if (st.active === 'draw') drPaint(); });
  })();

