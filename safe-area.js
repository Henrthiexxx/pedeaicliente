// safe-area.js — impede que a topbar se misture com a barra de status do sistema
(function () {
  // 1. Garante viewport-fit=cover para que env(safe-area-inset-*) funcione
  var vp = document.querySelector('meta[name="viewport"]');
  if (vp && vp.content.indexOf('viewport-fit') === -1) {
    vp.content += ',viewport-fit=cover';
  }

  function applyTopInset() {
    // Mede env(safe-area-inset-top) via elemento temporário
    var probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;top:env(safe-area-inset-top,0px);' +
      'left:0;width:1px;height:1px;pointer-events:none;opacity:0;visibility:hidden';
    document.documentElement.appendChild(probe);
    var sat = parseFloat(window.getComputedStyle(probe).top) || 0;
    probe.remove();

    if (sat <= 0) return; // sem área protegida, nada a fazer

    // Propaga a variável CSS para que folhas de estilo possam usá-la
    document.documentElement.style.setProperty('--sat', sat + 'px');

    // Aplica padding-top aos cabeçalhos fixos/sticky de qualquer página
    var selectors = [
      'header',
      '.header',
      '.home-hdr',
      '.store-header',
      '.notifications-header',
      '.hdr',
      '[class$="-header"]',
      '[class*="-header"]'
    ];
    var seen = new Set();
    selectors.forEach(function (sel) {
      try {
        document.querySelectorAll(sel).forEach(function (el) {
          if (seen.has(el)) return;
          seen.add(el);
          var pos = window.getComputedStyle(el).position;
          if (pos === 'fixed' || pos === 'sticky') {
            var current = parseFloat(window.getComputedStyle(el).paddingTop) || 0;
            if (current < sat) el.style.paddingTop = sat + 'px';
          }
        });
      } catch (_) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTopInset);
  } else {
    applyTopInset();
  }
})();
