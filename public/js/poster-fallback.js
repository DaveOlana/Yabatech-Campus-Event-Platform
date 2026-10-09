document.querySelectorAll('[data-poster-image]').forEach(function (image) {
  image.setAttribute('loading', 'lazy');
  image.setAttribute('referrerpolicy', 'no-referrer');
  image.addEventListener('error', function () {
    image.hidden = true;
    var fallback = image.parentElement && image.parentElement.querySelector('[data-poster-fallback]');
    if (fallback) fallback.hidden = false;
  });
});
