import { uploadPresigned } from "@vercel/blob/client";

const MAX_POSTER_BYTES = 4 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

document.querySelectorAll<HTMLFormElement>("form[data-event-draft-form]").forEach((form) => {
  const container = form.querySelector<HTMLElement>("[data-poster-upload]");
  const input = form.querySelector<HTMLInputElement>("[data-poster-input]");
  const posterUrl = form.querySelector<HTMLInputElement>("[data-poster-url]");
  const posterBlobPath = form.querySelector<HTMLInputElement>("[data-poster-blob-path]");
  const csrf = form.querySelector<HTMLInputElement>('input[name="_csrf"]');
  const status = form.querySelector<HTMLElement>("[data-poster-upload-status]");
  if (!container || container.dataset.directUpload !== "true" || !input || !posterUrl || !posterBlobPath || !csrf) return;

  let uploaded = false;
  let uploading = false;
  form.addEventListener("submit", async (event) => {
    const file = input.files?.[0];
    if (!file || uploaded) return;
    event.preventDefault();
    if (uploading) return;
    const extension = EXTENSIONS[file.type];
    if (!extension || file.size < 1 || file.size > MAX_POSTER_BYTES) {
      if (status) status.textContent = "Choose a JPEG, PNG, or WebP poster no larger than 4 MB.";
      return;
    }

    uploading = true;
    const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
    if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) submitter.disabled = true;
    if (status) status.textContent = "Uploading poster securely…";
    try {
      const pathname = `ycep/posters/${crypto.randomUUID()}.${extension}`;
      const blob = await uploadPresigned(pathname, file, {
        access: "public",
        contentType: file.type,
        handleUploadUrl: "/organizer/posters/upload",
        clientPayload: JSON.stringify({ csrfToken: csrf.value }),
      });
      posterUrl.value = blob.url;
      posterBlobPath.value = blob.pathname;
      input.value = "";
      uploaded = true;
      if (status) status.textContent = "Poster uploaded. Saving your draft…";
      posterUrl.dispatchEvent(new Event("change", { bubbles: true }));
      form.requestSubmit(submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : undefined);
    } catch (_error) {
      if (status) status.textContent = "The poster could not be uploaded. Your event details remain in this browser tab; try again or save without a poster.";
      if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) submitter.disabled = false;
      uploading = false;
    }
  });
});
