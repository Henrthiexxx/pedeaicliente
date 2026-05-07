// swipe-back.js — arrastar da borda esquerda para a direita navega de volta
(function () {
  var startX = 0, startY = 0, startTime = 0, tracking = false;
  var EDGE_ZONE = 44;    // px da borda esquerda onde o gesto começa
  var MIN_DIST  = 80;    // distância mínima horizontal
  var MAX_VERT  = 60;    // máximo de desvio vertical permitido
  var MAX_TIME  = 450;   // ms máximo para o gesto

  document.addEventListener('touchstart', function (e) {
    var t = e.changedTouches[0];
    if (t.clientX > EDGE_ZONE) { tracking = false; return; }
    startX    = t.clientX;
    startY    = t.clientY;
    startTime = Date.now();
    tracking  = true;
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (!tracking) return;
    tracking = false;
    var t  = e.changedTouches[0];
    var dx = t.clientX - startX;
    var dy = Math.abs(t.clientY - startY);
    var dt = Date.now() - startTime;
    if (dx >= MIN_DIST && dy < MAX_VERT && dt < MAX_TIME) {
      history.back();
    }
  }, { passive: true });
})();
