(() => {
  const body = document.body;
  const path = window.location.pathname;
  const surface = path.startsWith("/admin")
    ? "management"
    : path.startsWith("/organizer")
      ? "organizer"
      : path.startsWith("/account")
        ? "account"
        : path === "/about"
          ? "about"
          : ["/login", "/register"].includes(path)
            ? "identity"
            : "discovery";

  body.dataset.surface = surface;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let frame = 0;
  const updatePosition = (x, y) => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      body.style.setProperty("--ambient-pointer-x", `${((x / window.innerWidth) - .5) * 34}px`);
      body.style.setProperty("--ambient-pointer-y", `${((y / window.innerHeight) - .5) * 24}px`);
    });
  };

  window.addEventListener("pointermove", (event) => updatePosition(event.clientX, event.clientY), { passive: true });
  window.addEventListener("scroll", () => {
    body.style.setProperty("--ambient-scroll", `${Math.min(window.scrollY * .035, 32)}px`);
  }, { passive: true });
  document.addEventListener("visibilitychange", () => body.classList.toggle("ambient-paused", document.hidden));
})();
