(function () {
  document.querySelectorAll('[data-poster-upload]').forEach(function (container) {
    var input = container.querySelector('[data-poster-input]');
    var preview = container.querySelector('[data-poster-preview]');
    var image = container.querySelector('[data-poster-preview-image]');
    var fileName = container.querySelector('[data-poster-file-name]');
    var remove = container.querySelector('[data-poster-remove]');
    var objectUrl;
    if (!input || !preview || !image) return;
    input.addEventListener('change', function () {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      var file = input.files && input.files[0];
      if (!file) return;
      objectUrl = URL.createObjectURL(file);
      image.src = objectUrl;
      image.hidden = false;
      preview.hidden = false;
      if (fileName) fileName.textContent = file.name;
      if (remove) remove.checked = false;
    });
    if (remove) remove.addEventListener('change', function () {
      preview.hidden = remove.checked && !(input.files && input.files[0]);
    });
  });
})();
