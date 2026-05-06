(function () {
  const samePageTargets = new Set(['', '#']);

  window.navigateTo = function (href) {
    if (!href) return;
    document.body.classList.add('page-leave');
    setTimeout(function () {
      location.href = href;
    }, 180);
  };

  document.addEventListener('click', function (event) {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented) return;
    if (link.target && link.target !== '_self') return;
    if (link.hasAttribute('download')) return;

    const href = link.getAttribute('href') || '';
    if (samePageTargets.has(href) || href.startsWith('#') || href.startsWith('javascript:')) return;

    let url;
    try {
      url = new URL(href, location.href);
    } catch (_) {
      return;
    }

    if (url.origin !== location.origin || url.href === location.href) return;

    event.preventDefault();
    window.navigateTo(url.href);
  }, true);
})();
