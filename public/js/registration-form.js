document.querySelectorAll('#registerForm input, #registerForm select').forEach(function (element) {
  element.addEventListener('input', function () {
    element.classList.remove('input-error');
    var parent = element.closest('.form-group');
    var error = parent && parent.querySelector('.field-error');
    if (error) error.hidden = true;
  });
});
