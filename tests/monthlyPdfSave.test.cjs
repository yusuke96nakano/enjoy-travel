const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ts = require('typescript');

function setup({ ios = false, ipad = false, picker = 'success', share = 'success', canShare = true, writeError } = {}) {
  const events = [];
  const blob = new Blob(['%PDF-test'], { type: 'application/pdf' });
  const filename = '2026-08_出張報告書_一括.pdf';
  const writable = {
    async write(value) { events.push('write'); assert.equal(value, blob); if (writeError) throw writeError; },
    async close() { events.push('close'); },
    async abort() { events.push('abort'); },
  };
  const window = picker === 'missing' ? {} : {
    async showSaveFilePicker(options) {
      events.push('picker');
      assert.equal(options.suggestedName, filename);
      assert.deepEqual(JSON.parse(JSON.stringify(options.types[0].accept)), { 'application/pdf': ['.pdf'] });
      if (picker !== 'success') throw new DOMException('picker error', picker);
      return { async createWritable() { events.push('createWritable'); return writable; } };
    },
  };
  const navigator = {
    userAgent: ios ? 'iPhone Safari' : 'Macintosh Chrome',
    platform: ipad ? 'MacIntel' : 'MacIntel',
    maxTouchPoints: ipad ? 5 : ios ? 5 : 0,
    canShare(data) { events.push('canShare'); assert.equal(data.files[0].name, filename); return canShare; },
    async share(data) {
      events.push('share');
      assert.equal(data.files[0].type, 'application/pdf');
      if (share !== 'success') throw new DOMException('share error', share);
    },
  };
  if (share === 'missing') delete navigator.share;
  const context = { exports: {}, window, navigator, Blob, File, DOMException };
  const source = ts.transpileModule(fs.readFileSync('lib/monthlyPdfSave.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, context);
  return {
    events,
    run: () => context.exports.saveMonthlyPdf(
      () => { events.push('render'); return blob; }, filename,
      (value, name) => { events.push('download'); assert.equal(value, blob); assert.equal(name, filename); },
    ),
  };
}

const cases = [
  ['Mac Chrome: picker opens before PDF rendering; writes and closes file', {}, ['picker','render','createWritable','write','close']],
  ['Mac: picker cancellation produces no PDF, error or download', { picker: 'AbortError' }, ['picker']],
  ['Desktop without picker: direct download despite share support', { picker: 'missing' }, ['render','download']],
  ['Picker unavailable in context: download fallback', { picker: 'SecurityError' }, ['picker','render','download']],
  ['iPhone Safari: share instead of picker', { ios: true }, ['render','canShare','share']],
  ['iPad desktop UA: share instead of picker', { ipad: true }, ['render','canShare','share']],
  ['iPhone: share cancellation does not download', { ios: true, share: 'AbortError' }, ['render','canShare','share']],
  ['iPhone: unsupported file sharing downloads', { ios: true, canShare: false }, ['render','canShare','download']],
  ['iPhone: share failure downloads', { ios: true, share: 'NotAllowedError' }, ['render','canShare','share','download']],
  ['iPhone: missing share downloads', { ios: true, share: 'missing' }, ['render','download']],
  ['Write cancellation aborts and does not download', { writeError: new DOMException('cancel', 'AbortError') }, ['picker','render','createWritable','write','abort']],
];
for (const [name, options, expected] of cases) test(name, async () => {
  const app = setup(options);
  await app.run();
  assert.deepEqual(app.events, expected);
});
test('Disk write failure aborts and propagates for the UI error message', async () => {
  const error = new Error('disk full');
  const app = setup({ writeError: error });
  await assert.rejects(app.run, error);
  assert.deepEqual(app.events, ['picker','render','createWritable','write','abort']);
});
