const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const embedded =
  new URLSearchParams(location.search).get("embed") === "1" &&
  window.parent !== window;
const KEY = "kigazine-comic-studio-v1";
const clone = (value) => JSON.parse(JSON.stringify(value));
const uid = () => crypto.randomUUID();
const blank = () => ({
  version: 1,
  title: "My little adventure",
  panels: [[], [], []],
});
const person = (x = 125, y = 190) => ({
  id: uid(),
  type: "stick",
  x,
  y,
  color: "#252b39",
  weight: 3,
  scale: 1,
});
const bubble = (text, x = 140, y = 85) => ({
  id: uid(),
  type: "bubble",
  x,
  y,
  text,
  color: "#252b39",
  weight: 2.5,
  scale: 1,
});
let scene = blank();
scene.panels = [
  [person(130, 195), bubble("I have an idea!")],
  [person(100, 195), bubble("What if…")],
  [person(145, 195), bubble("Let’s make a comic!")],
];
let tool = "select",
  active = 0,
  selected = null,
  ink = "#252b39",
  weight = 3,
  gesture = null,
  undo = [],
  redo = [];
let initialized = !embedded,
  saveTimer;
if (embedded) {
  document.body.classList.add("embedded");
  $("apply").hidden = false;
  $("privacy-note").textContent =
    "Add your comic to the issue to save it with your draft.";
}
function validScene(data) {
  if (
    !data ||
    data.version !== 1 ||
    typeof data.title !== "string" ||
    data.title.length > 60 ||
    !Array.isArray(data.panels) ||
    data.panels.length < 1 ||
    data.panels.length > 6
  )
    return false;
  return data.panels.every(
    (p) =>
      Array.isArray(p) &&
      p.length <= 300 &&
      p.every(
        (o) =>
          o &&
          typeof o.id === "string" &&
          ["stick", "bubble", "line", "pen", "text"].includes(o.type) &&
          ["x", "y", "scale", "weight"].every((k) => Number.isFinite(o[k])) &&
          Math.abs(o.x) < 5000 &&
          Math.abs(o.y) < 5000 &&
          o.scale >= 0.4 &&
          o.scale <= 2 &&
          o.weight >= 1 &&
          o.weight <= 10 &&
          /^#[0-9a-f]{6}$/i.test(o.color) &&
          (o.text === undefined ||
            (typeof o.text === "string" && o.text.length <= 100)) &&
          (o.type !== "pen" ||
            (Array.isArray(o.points) &&
              o.points.length <= 4000 &&
              o.points.every(
                (p) =>
                  Array.isArray(p) &&
                  p.length === 2 &&
                  p.every((v) => Number.isFinite(v) && Math.abs(v) < 5000),
              ))) &&
          (o.type !== "line" ||
            (Number.isFinite(o.dx) &&
              Number.isFinite(o.dy) &&
              Math.abs(o.dx) < 5000 &&
              Math.abs(o.dy) < 5000)),
      ),
  );
}
if (!embedded) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (validScene(saved)) scene = saved;
  } catch {
    /* A fresh scene remains usable when browser storage is disabled. */
  }
}
function announce(text) {
  $("tool-hint").textContent = text;
}
function checkpoint() {
  undo.push(clone(scene));
  if (undo.length > 50) undo.shift();
  redo = [];
}
function changed() {
  render();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (embedded) {
      $("save-status").textContent = "Click Add to issue to save changes.";
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(scene));
      $("save-status").textContent = "✓ Saved in this browser";
    } catch {
      $("save-status").textContent =
        "Storage full — export to keep this comic.";
    }
  }, 400);
}
function node(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}
function lines(text, max = 19) {
  const result = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const token of paragraph.split(/\s+/)) {
      const chunks = token.match(new RegExp(`.{1,${max}}`, "g")) || [""];
      for (const word of chunks) {
        if ((line + " " + word).trim().length > max && line) {
          result.push(line);
          line = "";
        }
        line += (line ? " " : "") + word;
      }
    }
    result.push(line);
  }
  return result;
}
function words(group, o) {
  const rows = lines(o.text || "", o.type === "bubble" ? 18 : 22);
  const gap = Math.min(21, 70 / Math.max(1, rows.length));
  const fontSize = Math.min(o.type === "bubble" ? 17 : 19, gap * 0.85);
  const text = node("text", {
    x: 0,
    y: (-(rows.length - 1) * gap) / 2 + fontSize / 3,
    "text-anchor": "middle",
    "font-family": "Trebuchet MS, sans-serif",
    "font-size": fontSize,
    "font-weight": 600,
    fill: o.color,
    stroke: "none",
  });
  rows.forEach((row, i) =>
    text.append(node("tspan", { x: 0, dy: i ? gap : 0 }, row)),
  );
  group.append(text);
}
function drawObject(o, withSelection = false) {
  const g = node("g", {
    "data-id": o.id,
    transform: `translate(${o.x} ${o.y}) scale(${o.scale})`,
    stroke: o.color,
    "stroke-width": o.weight,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    fill: "none",
  });
  if (o.type === "stick") {
    g.append(
      node("circle", { cx: 0, cy: -27, r: 22 }),
      node("path", {
        d: "M0 -5 L0 69 M0 18 L-36 43 M0 18 L37 -3 M0 69 L-31 123 M0 69 L33 123",
      }),
      node("circle", {
        cx: -7,
        cy: -30,
        r: 1.5,
        fill: o.color,
        stroke: "none",
      }),
      node("circle", { cx: 7, cy: -30, r: 1.5, fill: o.color, stroke: "none" }),
      node("path", { d: "M-7 -20 Q0 -15 7 -20", "stroke-width": 2 }),
    );
  }
  if (o.type === "bubble") {
    g.append(
      node("path", {
        d: "M-91 -44 Q-100 -44 -100 -30 L-100 31 Q-100 44 -85 44 L-22 44 L-35 66 L3 44 L84 44 Q100 44 100 29 L100 -28 Q100 -44 84 -44 Z",
        fill: "white",
      }),
    );
    words(g, o);
  }
  if (o.type === "text") words(g, o);
  if (o.type === "line") g.append(node("path", { d: `M0 0 L${o.dx} ${o.dy}` }));
  if (o.type === "pen")
    g.append(
      node("path", {
        d: o.points.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" "),
      }),
    );
  if (withSelection) g.dataset.selected = "true";
  return g;
}
function svgFor(panel, editing = false, index = 0) {
  const svg = node("svg", {
    viewBox: "0 0 280 360",
    xmlns: NS,
    role: "img",
    "aria-label": `Panel ${index + 1}${editing ? " comic canvas" : ""}`,
  });
  svg.append(
    node("rect", { x: 0, y: 0, width: 280, height: 360, fill: "#fff" }),
  );
  for (const o of panel)
    svg.append(drawObject(o, editing && o.id === selected));
  return svg;
}
function selectionBox(svg) {
  const g = svg.querySelector("[data-selected]");
  if (!g) return;
  try {
    const b = g.getBBox();
    g.append(
      node("rect", {
        x: b.x - 8,
        y: b.y - 8,
        width: Math.max(16, b.width + 16),
        height: Math.max(16, b.height + 16),
        rx: 3,
        fill: "none",
        stroke: "#9290df",
        "stroke-width": 1.2,
        "stroke-dasharray": "5 4",
        "pointer-events": "none",
      }),
    );
  } catch {}
}
function selectedObject() {
  return scene.panels[active]?.find((o) => o.id === selected);
}
function syncOptions() {
  const o = selectedObject();
  $("duplicate").disabled = $("delete").disabled = $("size").disabled = !o;
  if (o) {
    $("size").value = o.scale;
    if (o.type === "text" || o.type === "bubble")
      $("words").value = o.text || "";
  }
}
function render() {
  $("comic-title").value = scene.title;
  $("paper-title").textContent = scene.title || "Your untitled adventure";
  $("panel-count").textContent = `${scene.panels.length} PANELS`;
  $("undo").disabled = !undo.length;
  $("redo").disabled = !redo.length;
  $("add-panel").disabled = scene.panels.length >= 6;
  $("panels").replaceChildren();
  $("panel-list").replaceChildren();
  scene.panels.forEach((panel, i) => {
    const wrap = document.createElement("div");
    wrap.className = `comic-panel${i === active ? " selected" : ""}`;
    const num = document.createElement("span");
    num.className = "panel-number";
    num.textContent = String(i + 1).padStart(2, "0");
    const svg = svgFor(panel, true, i);
    svg.tabIndex = 0;
    svg.setAttribute(
      "aria-label",
      `Panel ${i + 1} drawing area. Use toolbar buttons to add objects, then drag to move.`,
    );
    wrap.append(svg, num);
    $("panels").append(wrap);
    selectionBox(svg);
    svg.addEventListener("pointerdown", (e) => start(e, i, svg));
    svg.addEventListener("pointermove", (e) => move(e, svg));
    svg.addEventListener("pointerup", () => end());
    svg.addEventListener("pointercancel", () => end(true));
    svg.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        active = i;
        selected = null;
        render();
        announce(`Panel ${i + 1} selected.`);
      }
    });
    const btn = document.createElement("button");
    btn.className = `panel-item${i === active ? " active" : ""}`;
    btn.setAttribute("aria-label", `Select panel ${i + 1}`);
    btn.setAttribute("aria-pressed", String(i === active));
    const thumb = svgFor(panel, false, i);
    thumb.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = `Panel ${String(i + 1).padStart(2, "0")}`;
    const count = document.createElement("small");
    count.textContent = panel.length
      ? `${panel.length} marks`
      : "Your next idea";
    label.append(count);
    btn.append(thumb, label);
    btn.onclick = () => {
      active = i;
      selected = null;
      render();
    };
    $("panel-list").append(btn);
  });
  syncOptions();
}
function setTool(value) {
  tool = value;
  document.querySelectorAll("[data-tool]").forEach((b) => {
    const on = b.dataset.tool === tool;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  const hints = {
    select: "Select a character or bubble and drag to move it.",
    stick:
      "Tap a panel to add a stick person. Or click Stick person again to add one.",
    bubble:
      "Tap a panel to place a speech bubble. Change its words on the left.",
    line: "Drag across a panel to draw a straight line.",
    pen: "Draw right in a panel with your mouse, finger, or pen.",
    text: "Tap a panel to place your words.",
  };
  announce(hints[tool]);
}
function add(type, x = 140, y = type === "stick" ? 170 : 90) {
  if (!initialized) return;
  if (scene.panels[active].length >= 300) {
    announce("This panel is full. Add another panel.");
    return;
  }
  checkpoint();
  const o = { id: uid(), type, x, y, color: ink, weight, scale: 1 };
  if (type === "bubble" || type === "text")
    o.text = $("words").value.slice(0, 100);
  scene.panels[active].push(o);
  selected = o.id;
  setTool("select");
  changed();
}
const point = (e, svg) => {
  const r = svg.getBoundingClientRect();
  return {
    x: Math.max(1, Math.min(279, ((e.clientX - r.left) / r.width) * 280)),
    y: Math.max(1, Math.min(359, ((e.clientY - r.top) / r.height) * 360)),
  };
};
function start(e, i, svg) {
  if (e.button !== 0 || !initialized) return;
  e.preventDefault();
  active = i;
  const p = point(e, svg);
  if (["stick", "bubble", "text"].includes(tool)) {
    add(tool, p.x, p.y);
    return;
  }
  const id = e.target.closest("[data-id]")?.getAttribute("data-id");
  if (tool === "select") {
    selected = id || null;
    if (!id) {
      render();
      return;
    }
    checkpoint();
    const o = selectedObject();
    gesture = { mode: "move", id, start: p, origin: { x: o.x, y: o.y }, svg };
    syncOptions();
  } else {
    if (scene.panels[i].length >= 300) {
      announce("This panel is full. Add another panel.");
      return;
    }
    checkpoint();
    const o = {
      id: uid(),
      type: tool,
      x: p.x,
      y: p.y,
      color: ink,
      weight,
      scale: 1,
      ...(tool === "pen"
        ? {
            points: [
              [0, 0],
              [0.1, 0.1],
            ],
          }
        : { dx: 0, dy: 0 }),
    };
    scene.panels[i].push(o);
    selected = o.id;
    gesture = { mode: tool, id: o.id, start: p, svg };
    svg.append(drawObject(o));
  }
  svg.setPointerCapture(e.pointerId);
}
function move(e, svg) {
  if (!gesture || gesture.svg !== svg) return;
  const o = selectedObject();
  if (!o) return;
  const p = point(e, svg);
  if (gesture.mode === "move") {
    o.x = gesture.origin.x + p.x - gesture.start.x;
    o.y = gesture.origin.y + p.y - gesture.start.y;
  } else if (gesture.mode === "line") {
    o.dx = p.x - o.x;
    o.dy = p.y - o.y;
  } else if (o.points.length < 4000)
    o.points.push([+(p.x - o.x).toFixed(2), +(p.y - o.y).toFixed(2)]);
  const old = [...svg.querySelectorAll("[data-id]")].find(
    (g) => g.dataset.id === o.id,
  );
  old?.replaceWith(drawObject(o));
}
function end(cancel = false) {
  if (!gesture) return;
  if (cancel) {
    scene = undo.pop() || scene;
  }
  gesture = null;
  changed();
}
for (const btn of document.querySelectorAll("[data-tool]"))
  btn.onclick = () => {
    const next = btn.dataset.tool;
    if (["stick", "bubble", "text"].includes(next)) add(next);
    else setTool(next);
  };
for (const btn of document.querySelectorAll("[data-color]"))
  btn.onclick = () => {
    $("ink").value = btn.dataset.color;
    changeInk(btn.dataset.color);
  };
function changeInk(color) {
  ink = color;
  document
    .querySelectorAll("[data-color]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.color === color)),
    );
  const o = selectedObject();
  if (o) {
    checkpoint();
    o.color = color;
    changed();
  }
}
$("ink").oninput = (e) => changeInk(e.target.value);
$("weight").oninput = (e) => {
  weight = Number(e.target.value);
  $("weight-value").textContent = String(weight);
  const o = selectedObject();
  if (o) {
    checkpoint();
    o.weight = weight;
    changed();
  }
};
$("words").oninput = (e) => {
  const o = selectedObject();
  if (o && ["bubble", "text"].includes(o.type)) {
    checkpoint();
    o.text = e.target.value;
    changed();
  }
};
$("size").oninput = (e) => {
  const o = selectedObject();
  if (o) {
    checkpoint();
    o.scale = Number(e.target.value);
    changed();
  }
};
$("comic-title").oninput = (e) => {
  checkpoint();
  scene.title = e.target.value;
  changed();
};
$("undo").onclick = () => {
  if (!undo.length) return;
  redo.push(clone(scene));
  scene = undo.pop();
  active = Math.min(active, scene.panels.length - 1);
  selected = null;
  changed();
};
$("redo").onclick = () => {
  if (!redo.length) return;
  undo.push(clone(scene));
  scene = redo.pop();
  active = Math.min(active, scene.panels.length - 1);
  selected = null;
  changed();
};
$("delete").onclick = () => {
  if (!selectedObject()) return;
  checkpoint();
  scene.panels[active] = scene.panels[active].filter((o) => o.id !== selected);
  selected = null;
  changed();
};
$("duplicate").onclick = () => {
  const o = selectedObject();
  if (!o || scene.panels[active].length >= 300) return;
  checkpoint();
  const copy = {
    ...clone(o),
    id: uid(),
    x: Math.min(260, o.x + 15),
    y: Math.min(340, o.y + 15),
  };
  scene.panels[active].push(copy);
  selected = copy.id;
  changed();
};
$("add-panel").onclick = () => {
  if (scene.panels.length >= 6) return;
  checkpoint();
  scene.panels.push([]);
  active = scene.panels.length - 1;
  selected = null;
  changed();
};
$("clear-panel").onclick = () => {
  if (
    !scene.panels[active].length ||
    !confirm(`Clear panel ${active + 1}? You can undo this.`)
  )
    return;
  checkpoint();
  scene.panels[active] = [];
  selected = null;
  changed();
};
$("new").onclick = () => {
  if (!confirm("Start a blank comic? You can undo this.")) return;
  checkpoint();
  scene = blank();
  active = 0;
  selected = null;
  changed();
};
window.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName))
    return;
  if (e.ctrlKey || e.metaKey) {
    if (e.key.toLowerCase() === "z") {
      e.preventDefault();
      $(e.shiftKey ? "redo" : "undo").click();
    }
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    $("delete").click();
  }
  const keys = {
    v: "select",
    s: "stick",
    b: "bubble",
    l: "line",
    d: "pen",
    t: "text",
  };
  if (keys[e.key.toLowerCase()]) {
    e.preventDefault();
    const t = keys[e.key.toLowerCase()];
    if (["stick", "bubble", "text"].includes(t)) add(t);
    else setTool(t);
  }
  if (e.key.startsWith("Arrow") && selectedObject()) {
    e.preventDefault();
    checkpoint();
    const o = selectedObject();
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") o.x -= step;
    if (e.key === "ArrowRight") o.x += step;
    if (e.key === "ArrowUp") o.y -= step;
    if (e.key === "ArrowDown") o.y += step;
    changed();
  }
});
async function imageCanvas() {
  const cols = Math.min(3, scene.panels.length),
    rows = Math.ceil(scene.panels.length / 3),
    w = cols * 300 + 60,
    h = rows * 380 + 175;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fffefa";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#6261cf";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText("KIGAZINE / THE COMIC EDITION", 32, 32);
  ctx.fillStyle = "#252b39";
  ctx.font = "bold 30px sans-serif";
  const title = scene.title || "Your untitled adventure";
  ctx.fillText(title, 32, 80, w - 64);
  for (let i = 0; i < scene.panels.length; i++) {
    const svg = svgFor(scene.panels[i]);
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml",
    });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const x = 30 + (i % 3) * 300,
        y = 110 + Math.floor(i / 3) * 380;
      ctx.drawImage(img, x, y, 280, 360);
      ctx.strokeStyle = "#252b39";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, 280, 360);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  ctx.fillStyle = "#8e8995";
  ctx.font = "10px sans-serif";
  ctx.fillText("MADE WITH IMAGINATION · KIGAZINE COMIC STUDIO", 32, h - 20);
  return c;
}
async function exporting(button, fn) {
  button.disabled = true;
  try {
    await fn();
  } catch {
    announce("Could not export this comic. Try again.");
  } finally {
    button.disabled = false;
  }
}
$("export").onclick = () =>
  exporting($("export"), async () => {
    const c = await imageCanvas();
    const blob = await new Promise((resolve) => c.toBlob(resolve, "image/png"));
    if (!blob) throw Error("export");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      (scene.title.replace(/[^a-z0-9 -]/gi, "").trim() || "my-comic") + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce("Comic exported. Keep telling your story!");
  });
$("apply").onclick = () =>
  exporting($("apply"), async () => {
    const c = await imageCanvas();
    let image = "";
    for (const q of [0.92, 0.8, 0.65, 0.5, 0.35]) {
      image = c.toDataURL("image/jpeg", q);
      if (image.length <= 110000) break;
    }
    if (image.length > 110000) {
      announce(
        "This comic is too detailed for one issue page. Try fewer marks or panels, or export the PNG.",
      );
      return;
    }
    const transcript = scene.panels
      .map((p, i) => {
        const text = p
          .filter((o) => o.type === "bubble" || o.type === "text")
          .map((o) => o.text)
          .join(" ");
        return `Panel ${i + 1}: ${text || "An illustrated scene."}`;
      })
      .join("\n");
    window.parent.postMessage(
      {
        type: "kigazine-comic-result",
        scene: clone(scene),
        image,
        text: transcript,
      },
      location.origin,
    );
  });
if (embedded) {
  $("apply").disabled = true;
  window.addEventListener("message", (e) => {
    if (
      e.origin !== location.origin ||
      e.source !== window.parent ||
      e.data?.type !== "kigazine-comic-init"
    )
      return;
    scene = validScene(e.data.scene) ? clone(e.data.scene) : blank();
    undo = [];
    redo = [];
    active = 0;
    selected = null;
    initialized = true;
    $("apply").disabled = false;
    render();
    $("save-status").textContent = "Save your changes with Add to issue.";
  });
  window.parent.postMessage({ type: "kigazine-comic-ready" }, location.origin);
}
render();
setTool("select");
