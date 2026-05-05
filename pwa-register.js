(function () {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', function () {
        var basePath = new URL('./', window.location.href).pathname;
        navigator.serviceWorker.register(basePath + 'sw.js', { scope: basePath })
            .catch(function (err) {
                console.warn('Service Worker não registrado:', err);
            });
    });
})();
