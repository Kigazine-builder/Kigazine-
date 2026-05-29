document.addEventListener("DOMContentLoaded", () => {
  const existing = document.querySelector('script[src="mute-tools.js"]');
  if (existing) return;

  const script = document.createElement("script");
  script.src = "mute-tools.js";
  script.defer = true;
  document.body.appendChild(script);
});
