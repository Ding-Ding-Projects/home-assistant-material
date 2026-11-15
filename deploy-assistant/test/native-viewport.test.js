'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// These test the coordinate arithmetic and scroll routing, not browser layout.
// The built native window still requires caption-intersection verification.
const source = fs.readFileSync(path.join(__dirname, '../src/renderer/parts/native-viewport.js'), 'utf8');
function helpers() {
  const calls = [];
  const shell = { scrollTop: 85.333, scrollTo(x, y) { calls.push(['shell', x, y]); } };
  const context = { $: () => shell, window: { scrollY: 17, scrollTo(x, y) { calls.push(['window', x, y]); } } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, calls };
}

test('caption reservation uses the actual overlay rectangle at both measured widths', () => {
  const { context } = helpers();
  for (const [width, available] of [[360, 224], [1440, 1304]]) {
    const result = context.nativeCaptionBounds({ x: 0, y: 0, width: available, height: 48 }, true, width, 1000);
    assert.equal(result.bottom, 48);
    assert.equal(result.width, available);
  }
  assert.equal(context.nativeCaptionBounds({ x: 0, y: 4, width: 200, height: 48 }, true, 360, 1000).bottom, 52);
  assert.equal(context.nativeCaptionBounds(null, true, 360, 1000).bottom, 48);
  assert.equal(context.nativeCaptionBounds(null, false, 360, 1000).bottom, 0);
});

test('popover coordinates remain within the reserved native content viewport', () => {
  const { context } = helpers();
  for (const width of [360, 1440]) {
    const frame = { top: 48, bottom: 1000, left: 0, right: width };
    const popup = { width: 260, height: 400 };
    for (const requested of [{ left: width - 20, top: -17.333 }, { left: 10, top: 990 }]) {
      const position = context.nativePopoverPosition(frame, popup, requested);
      const actualTop = frame.top + position.top;
      const actualLeft = frame.left + position.left;
      assert.ok(actualTop >= 56);
      assert.ok(actualTop + popup.height <= 992);
      assert.ok(actualLeft >= 8);
      assert.ok(actualLeft + popup.width <= width - 8);
    }
  }
});

test('scroll preservation targets the internal shell only while the native boundary is active', () => {
  const { context, calls } = helpers();
  context.nativeViewportActive = true;
  assert.equal(context.nativeContentScrollTop(), 85.333);
  context.nativeContentScrollTo(85.333);
  context.nativeViewportActive = false;
  assert.equal(context.nativeContentScrollTop(), 17);
  context.nativeContentScrollTo(17);
  assert.deepEqual(calls, [['shell', 0, 85.333], ['window', 0, 17]]);
});
