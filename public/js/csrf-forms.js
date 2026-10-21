(function () {
  var source = document.querySelector('[data-csrf-token]');
  if (!source) return;
  var token = source.getAttribute('data-csrf-token');
  document.querySelectorAll('form[method="POST"], form[method="post"]').forEach(function (form) {
    if (!token || form.querySelector('input[name="_csrf"]')) return;
    var input = document.createElement('input');
    input.type = 'hidden'; input.name = '_csrf'; input.value = token; form.prepend(input);
  });
})();

window.addEventListener('pageshow', function (event) {
  if (event.persisted) {
    window.location.reload();
  }
});
