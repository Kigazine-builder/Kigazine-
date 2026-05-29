document.addEventListener("DOMContentLoaded", () => {
  const nav = document.querySelector(".nav");
  if (!nav || document.getElementById("kigazineAiLink")) return;

  const aiLink = document.createElement("a");
  aiLink.id = "kigazineAiLink";
  aiLink.className = "nav-btn";
  aiLink.href = "https://kigazine-kn7i.vercel.app/ai.html";
  aiLink.target = "_blank";
  aiLink.rel = "noopener noreferrer";
  aiLink.textContent = "🤖 Go to the AI!";

  nav.appendChild(aiLink);
});
