(function () {
  document.querySelectorAll('[data-poster-upload]').forEach(function (container) {
    var input = container.querySelector('[data-poster-input]');
    var preview = container.querySelector('[data-poster-preview]');
    var image = container.querySelector('[data-poster-preview-image]');
    var fileName = container.querySelector('[data-poster-file-name]');
    var remove = container.querySelector('[data-poster-remove]');
    var posterUrl = container.querySelector('[data-poster-url]');
    var posterBlobPath = container.querySelector('[data-poster-blob-path]');
    var hasPersistedPoster = container.dataset.hasPersistedPoster === 'true';
    var form = container.closest('form');
    var objectUrl;
    if (!input || !preview || !image) return;
    function syncPosterRequirement() {
      var hasFile = !!(input.files && input.files[0]);
      var hasUploadedReference = !!(posterUrl && posterUrl.value && posterBlobPath && posterBlobPath.value);
      var removesExisting = !!(remove && remove.checked);
      var missing = (!hasPersistedPoster || removesExisting) && !hasFile && !hasUploadedReference;
      input.required = missing;
      input.setCustomValidity(missing ? 'Add an event poster before saving this draft.' : '');
    }
    input.addEventListener('change', function () {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      var file = input.files && input.files[0];
      if (!file) { syncPosterRequirement(); return; }
      objectUrl = URL.createObjectURL(file);
      image.src = objectUrl;
      image.hidden = false;
      preview.hidden = false;
      if (fileName) fileName.textContent = file.name;
      if (remove) remove.checked = false;
      syncPosterRequirement();
    });
    if (remove) remove.addEventListener('change', function () {
      preview.hidden = remove.checked && !(input.files && input.files[0]);
      syncPosterRequirement();
    });
    if (posterUrl) posterUrl.addEventListener('change', syncPosterRequirement);
    syncPosterRequirement();
    if (form && container.dataset.directUpload !== 'true') form.addEventListener('submit', function (event) {
      if (form.dataset.submitStarted === 'true') { event.preventDefault(); return; }
      form.dataset.submitStarted = 'true';
      if (event.submitter) event.submitter.disabled = true;
      var status = container.querySelector('[data-poster-upload-status]');
      if (status) status.textContent = 'Saving your draft…';
    });
  });
})();
