  // The native caption is outside the scrollable application viewport. Padding
  // on the document cannot enforce this boundary after scrollIntoView or focus.
  var nativeViewportActive = false;
  var nativeViewportWatching = false;

  function nativeCaptionBounds(rect, visible, width, height) {
    if (!visible) return { bottom: 0, left: 0, width: 0 };
    var y = rect && Number.isFinite(rect.y) ? rect.y : 0;
    var h = rect && Number.isFinite(rect.height) ? rect.height : 48;
    var x = rect && Number.isFinite(rect.x) ? rect.x : 0;
    var w = rect && Number.isFinite(rect.width) ? rect.width : Math.max(0, width - 140);
    return { bottom: Math.max(0, Math.min(height, y + h)), left: Math.max(0, x), width: Math.max(0, Math.min(width - x, w)) };
  }

  function nativePopoverPosition(frame, popup, requested) {
    var left = Math.max(frame.left + 8, Math.min(requested.left, frame.right - popup.width - 8));
    var top = Math.max(frame.top + 8, Math.min(requested.top, frame.bottom - popup.height - 8));
    return { left: left - frame.left, top: top - frame.top };
  }

  function nativeClampPopovers() {
    if (!nativeViewportActive) return;
    var app = $('#app'), frame = app.getBoundingClientRect();
    $$('.popover', app).forEach(function (popup) {
      var rect = popup.getBoundingClientRect();
      // Existing producers supply viewport coordinates. Once normalized, use
      // the actual rectangle during resize instead of subtracting twice.
      var requested = popup.dataset.nativePositioned ? rect : {
        left: Number.parseFloat(popup.style.left) || frame.left,
        top: Number.parseFloat(popup.style.top) || frame.top,
      };
      var position = nativePopoverPosition(frame, rect, requested);
      popup.style.left = position.left + 'px';
      popup.style.top = position.top + 'px';
      popup.dataset.nativePositioned = 'true';
    });
  }

  function nativeViewportSync() {
    var overlay = navigator.windowControlsOverlay;
    var enabled = !DEMO && API.platform === 'win32' && (!overlay || overlay.visible);
    var bounds = nativeCaptionBounds(overlay && overlay.getTitlebarAreaRect(), enabled, innerWidth, innerHeight);
    nativeViewportActive = enabled && bounds.bottom > 0;
    var root = document.documentElement;
    root.classList.toggle('native-caption-viewport', nativeViewportActive);
    root.style.setProperty('--native-caption-bottom', bounds.bottom + 'px');
    root.style.setProperty('--native-caption-left', bounds.left + 'px');
    root.style.setProperty('--native-caption-width', bounds.width + 'px');
    if (nativeViewportActive) root.style.setProperty('--native-caption-surface', getComputedStyle($('#app')).getPropertyValue('--surf'));
    nativeClampPopovers();
  }

  function nativeViewportInit() {
    nativeViewportSync();
    if (nativeViewportWatching || DEMO || API.platform !== 'win32') return;
    nativeViewportWatching = true;
    window.addEventListener('resize', nativeViewportSync);
    if (navigator.windowControlsOverlay) navigator.windowControlsOverlay.addEventListener('geometrychange', nativeViewportSync);
    // All menu producers append to this root. Observe insertion, not the whole
    // document's changing attributes, and clamp before the next paint.
    new MutationObserver(function (records) {
      if (records.some(function (record) { return Array.from(record.addedNodes).some(function (node) { return node.nodeType === 1 && node.classList.contains('popover'); }); })) nativeClampPopovers();
    }).observe($('#app'), { childList: true });
  }

  function nativeContentScrollTop() {
    var shell = nativeViewportActive && $('.shell');
    return shell ? shell.scrollTop : window.scrollY;
  }
  function nativeContentScrollTo(top) {
    var shell = nativeViewportActive && $('.shell');
    if (shell) shell.scrollTo(0, top); else window.scrollTo(0, top);
  }
