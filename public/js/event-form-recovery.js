(function () {
  var PREFIX = 'ycep:event-draft:';
  var MAX_AGE_MS = 24 * 60 * 60 * 1000;

  function storageKey(key) {
    return PREFIX + key;
  }

  function readSaved(key) {
    try {
      var raw = sessionStorage.getItem(storageKey(key));
      if (!raw) return null;
      var saved = JSON.parse(raw);
      if (!saved || typeof saved.savedAt !== 'number' || Date.now() - saved.savedAt > MAX_AGE_MS) {
        sessionStorage.removeItem(storageKey(key));
        return null;
      }
      return saved;
    } catch (_error) {
      return null;
    }
  }

  function valuesFromForm(form) {
    var values = {};
    form.querySelectorAll('[name]').forEach(function (control) {
      var name = control.name;
      if (!name || name === '_csrf' || name === 'poster' || name === 'removePoster' || control.disabled) return;
      if ((control.type === 'checkbox' || control.type === 'radio') && !control.checked) return;
      if (control.tagName === 'SELECT' && control.multiple) {
        values[name] = Array.from(control.selectedOptions).map(function (option) { return option.value; });
        return;
      }
      if (!values[name]) values[name] = [];
      values[name].push(control.value);
    });
    return values;
  }

  function hasMeaningfulValue(values) {
    return Object.keys(values).some(function (name) {
      return values[name].some(function (value) { return String(value).trim() !== ''; });
    });
  }

  function sameValues(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function restoreValues(form, values) {
    form.querySelectorAll('[name]').forEach(function (control) {
      var name = control.name;
      if (!name || name === '_csrf' || name === 'poster' || name === 'removePoster' || control.disabled) return;
      var savedValues = values[name] || [];
      if (control.type === 'checkbox' || control.type === 'radio') {
        control.checked = savedValues.indexOf(control.value) !== -1;
      } else if (control.tagName === 'SELECT' && control.multiple) {
        Array.from(control.options).forEach(function (option) { option.selected = savedValues.indexOf(option.value) !== -1; });
      } else {
        control.value = savedValues[0] || '';
      }
    });
    form.querySelectorAll('select').forEach(function (control) {
      control.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function clearAfterSuccessfulSave() {
    var url = new URL(window.location.href);
    if (url.searchParams.get('saved') !== '1') return;
    var match = window.location.pathname.match(/^\/organizer\/events\/([0-9a-f-]{36})$/i);
    try {
      sessionStorage.removeItem(storageKey('new'));
      if (match) sessionStorage.removeItem(storageKey(match[1]));
    } catch (_error) {
      return;
    }
    url.searchParams.delete('saved');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }

  clearAfterSuccessfulSave();

  var form = document.querySelector('[data-event-draft-form]');
  if (!form) return;
  var key = form.getAttribute('data-event-draft-key');
  if (!key) return;
  var recovery = document.querySelector('[data-draft-recovery]');
  var recoveryMessage = recovery && recovery.querySelector('[data-draft-recovery-message]');
  var discardButton = recovery && recovery.querySelector('[data-draft-discard]');
  var abandonLink = form.querySelector('[data-draft-abandon]');
  var status = form.querySelector('[data-draft-recovery-status]');
  var poster = form.querySelector('[data-poster-input]');
  var timer;

  function save() {
    var values = valuesFromForm(form);
    try {
      if (!hasMeaningfulValue(values)) {
        sessionStorage.removeItem(storageKey(key));
        return;
      }
      sessionStorage.setItem(storageKey(key), JSON.stringify({
        savedAt: Date.now(),
        values: values,
        posterWasSelected: !!(poster && poster.files && poster.files[0]),
      }));
      if (status) status.textContent = 'Changes saved in this browser tab.';
    } catch (_error) {
      if (status) status.textContent = 'Browser recovery is unavailable. Save the draft before leaving this page.';
    }
  }

  function scheduleSave() {
    window.clearTimeout(timer);
    timer = window.setTimeout(save, 250);
  }

  var initialValues = valuesFromForm(form);
  var saved = readSaved(key);
  if (saved && saved.values && !sameValues(saved.values, initialValues) && recovery) {
    restoreValues(form, saved.values);
    recovery.hidden = false;
    if (recoveryMessage) recoveryMessage.textContent = saved.posterWasSelected
      ? 'Your event details were restored automatically. For security, please choose the poster file again.'
      : 'Your event details were restored automatically from this browser tab.';
    if (status) status.textContent = saved.posterWasSelected
      ? 'Details restored. Please choose the poster file again.'
      : 'Unsaved details restored automatically.';
  }

  if (discardButton) discardButton.addEventListener('click', function () {
    restoreValues(form, initialValues);
    window.clearTimeout(timer);
    try { sessionStorage.removeItem(storageKey(key)); } catch (_error) {}
    recovery.hidden = true;
    if (status) status.textContent = 'Recovered changes discarded. The last saved draft is shown.';
  });

  if (abandonLink) abandonLink.addEventListener('click', function () {
    try { sessionStorage.removeItem(storageKey(key)); } catch (_error) {}
  });

  form.addEventListener('input', scheduleSave);
  form.addEventListener('change', scheduleSave);
  form.addEventListener('submit', save);
  window.addEventListener('pagehide', save);
})();
