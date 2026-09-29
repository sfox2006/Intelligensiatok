const FEED_URL = "content/feed.json";
const SAVED_KEY = "intelligensiatok.saved";
const SNAP_KEY = "intelligensiatok.snapshots";
const THEME_KEY = "intelligensiatok.theme";
const LAST_KEY = "intelligensiatok.last";

const feedEl = document.querySelector("#feed");
const progressEl = document.querySelector("#progress-bar");
const themeBtn = document.querySelector("#theme-btn");
const subjectsBtn = document.querySelector("#subjects-btn");
const subjectsDialog = document.querySelector("#subjects-dialog");
const deeperDialog = document.querySelector("#deeper-dialog");
const aboutDialog = document.querySelector("#about-dialog");
const subjectList = document.querySelector("#subject-list");
const toastEl = document.querySelector("#toast");
const themeMeta = document.querySelector('meta[name="theme-color"]');
const colorScheme = document.querySelector('meta[name="color-scheme"]');

const state = {
  posts: [],
  fields: [],
  filter: "all",
  saved: loadList(SAVED_KEY),
  snapshots: loadObject(SNAP_KEY),
  activeId: null,
  reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
};

const ICONS = {
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/><circle cx="12" cy="12" r="3.2"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3.5A8.5 8.5 0 1 0 20.5 14 7 7 0 0 1 15 3.5z"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.2L6 20V5.5a1 1 0 0 1 1-1z"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2"/><circle cx="17" cy="7" r="2"/><circle cx="17" cy="17" r="2"/><path d="M8 11.2l7-3.2M8 12.8l7 3.2"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

function loadList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function loadObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function persist() {
  localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved));
  localStorage.setItem(SNAP_KEY, JSON.stringify(state.snapshots));
}

function fieldLabel(id) {
  return state.fields.find((field) => field.id === id)?.label || id;
}

function byId(id) {
  return state.posts.find((post) => post.id === id) || state.snapshots[id] || null;
}

function visiblePosts() {
  if (state.filter === "saved") {
    return state.saved.map((id) => byId(id)).filter(Boolean);
  }
  if (state.filter === "all") return state.posts;
  return state.posts.filter((post) => post.field === state.filter);
}

function paragraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children || []) node.append(child);
  return node;
}

function textParagraphs(text, className) {
  const wrap = el("div", { class: className });
  for (const paragraph of paragraphs(text)) wrap.append(el("p", {}, [paragraph]));
  return wrap;
}

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function permalink(id) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("p", id);
  return url.toString();
}

function confidence(post) {
  const value = post.review && typeof post.review.confidence === "number" ? post.review.confidence : null;
  return value;
}

function badge(post) {
  const value = confidence(post);
  const pct = value == null ? "—" : `${Math.round(value * 100)}%`;
  const cautious = value != null && value < 0.75;
  const label = cautious ? `Check notes ${pct}` : `Reviewed ${pct}`;
  return el("span", { class: cautious ? "badge warn" : "badge" }, [
    el("i"),
    label,
  ]);
}

function render() {
  const posts = visiblePosts();
  feedEl.replaceChildren();
  if (!posts.length) {
    const frame = el("div", { class: "card-frame" }, [
      el("p", { class: "field" }, [state.filter === "saved" ? "Saved" : "Feed"]),
      el("h2", { class: "title" }, [state.filter === "saved" ? "Nothing saved yet" : "Nothing in this subject"]),
      el("p", { class: "hook" }, [
        state.filter === "saved"
          ? "Save a card and it stays on this device, even after you close the app."
          : "Choose another subject, or come back to the full shelf.",
      ]),
    ]);
    feedEl.append(el("article", { class: "card" }, [frame]));
    progressEl.style.transform = "scaleX(0)";
    return;
  }
  posts.forEach((post, index) => {
    const saved = state.saved.includes(post.id);
    const hosts = (post.sources || []).map((source) => host(source.url)).filter(Boolean).slice(0, 3);
    const corrections = post.review && Array.isArray(post.review.corrections) ? post.review.corrections.length : 0;
    const frame = el("div", { class: "card-frame" }, [
      el("p", { class: "field" }, [fieldLabel(post.field)]),
      el("h2", { class: "title" }, [post.title]),
      el("p", { class: "hook" }, [post.hook]),
      textParagraphs(post.body, "body"),
      el("div", { class: "meta" }, [
        badge(post),
        corrections ? el("span", {}, [`${corrections} correction${corrections === 1 ? "" : "s"}`]) : "",
        el("span", { class: "sources-inline" }, [hosts.join(" · ")]),
      ].filter(Boolean)),
      el("div", { class: "actions" }, [
        el("button", { type: "button", "data-action": "save", "data-id": post.id, "aria-pressed": saved ? "true" : "false", "aria-label": saved ? "Remove saved post" : "Save post" }, [
          el("span", { html: ICONS.bookmark }),
          el("span", { class: "btn-label" }, [saved ? "Saved" : "Save"]),
        ]),
        el("button", { type: "button", "data-action": "share", "data-id": post.id }, [
          el("span", { html: ICONS.share }),
          el("span", { class: "btn-label" }, ["Share"]),
        ]),
        el("button", { type: "button", class: "primary", "data-action": "deeper", "data-id": post.id }, [
          el("span", { class: "btn-label" }, ["Go deeper"]),
        ]),
        el("span", { class: "count" }, [`${index + 1} of ${posts.length}`]),
      ]),
    ]);
    feedEl.append(el("article", { class: "card", "data-id": post.id, id: `post-${post.id}` }, [frame]));
  });
  observe();
}

let observer;
function observe() {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      const best = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!best) return;
      const id = best.target.dataset.id;
      if (!id || id === state.activeId) return;
      state.activeId = id;
      const posts = visiblePosts();
      const index = posts.findIndex((post) => post.id === id);
      progressEl.style.transform = `scaleX(${posts.length ? (index + 1) / posts.length : 0})`;
      const url = new URL(window.location.href);
      url.searchParams.set("p", id);
      history.replaceState({ id }, "", url);
      try { sessionStorage.setItem(LAST_KEY, id); } catch { /* ignore */ }
    },
    { root: feedEl, threshold: [0.6, 0.8] },
  );
  for (const card of feedEl.querySelectorAll(".card[data-id]")) observer.observe(card);
}

function scrollToId(id, behavior) {
  const card = feedEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!card) return false;
  card.scrollIntoView({ behavior: behavior || (state.reduced ? "auto" : "smooth"), block: "start" });
  return true;
}

function go(delta) {
  const posts = visiblePosts();
  if (!posts.length) return;
  const index = Math.max(0, posts.findIndex((post) => post.id === state.activeId));
  const next = posts[Math.min(posts.length - 1, Math.max(0, index + delta))];
  if (next) scrollToId(next.id);
}

function toggleSave(id) {
  const post = byId(id);
  if (!post) return;
  const index = state.saved.indexOf(id);
  if (index >= 0) {
    state.saved.splice(index, 1);
    delete state.snapshots[id];
    toast("Removed from this device");
  } else {
    state.saved.unshift(id);
    state.snapshots[id] = post;
    toast("Saved on this device");
  }
  persist();
  const button = feedEl.querySelector(`[data-action="save"][data-id="${CSS.escape(id)}"]`);
  if (button && state.filter !== "saved") {
    button.setAttribute("aria-pressed", state.saved.includes(id) ? "true" : "false");
    const label = button.querySelector(".btn-label");
    if (label) label.textContent = state.saved.includes(id) ? "Saved" : "Save";
  } else {
    render();
    if (state.filter === "saved") {
      const posts = visiblePosts();
      if (posts[0]) scrollToId(posts[0].id, "auto");
    }
  }
  renderSubjects();
}

async function share(id) {
  const post = byId(id);
  if (!post) return;
  const url = permalink(id);
  const data = { title: `${post.title} · Intelligensiatok`, text: post.hook, url };
  if (navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied");
  } catch {
    toastEl.classList.add("with-input");
    toastEl.replaceChildren("Copy this link");
    const input = document.createElement("input");
    input.value = url;
    input.readOnly = true;
    toastEl.append(input);
    toastEl.classList.add("show");
    input.focus();
    input.select();
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => {
      toastEl.classList.remove("show", "with-input");
    }, 6000);
  }
}

function openDeeper(id) {
  const post = byId(id);
  if (!post) return;
  const review = post.review || {};
  const corrections = Array.isArray(review.corrections) ? review.corrections : [];
  const sheet = el("div", { class: "sheet deeper-copy" }, [
    el("div", { class: "sheet-bar" }, [
      el("p", { class: "field" }, [fieldLabel(post.field)]),
      el("button", { type: "button", class: "icon-btn", "data-close": "true", "aria-label": "Close", html: ICONS.close }),
    ]),
    el("h2", { id: "deeper-title" }, [post.title]),
    badge(post),
    el("h3", {}, ["Longer note"]),
    textParagraphs(post.deeper, "deeper-body"),
    el("h3", {}, ["Example"]),
    textParagraphs(post.example, "deeper-body"),
    el("h3", {}, ["Sources"]),
    el("ul", { class: "source-list" }, (post.sources || []).map((source) => {
      const link = el("a", { href: source.url, target: "_blank", rel: "noopener noreferrer" }, [source.title]);
      return el("li", {}, [link]);
    })),
    el("div", { class: "review-box" }, [
      el("h3", {}, ["Verification"]),
      el("p", {}, [
        `Reviewer: ${review.reviewer || "unknown"}. Confidence ${confidence(post) == null ? "not recorded" : `${Math.round(confidence(post) * 100)}%`}. Reviewed ${review.reviewedAt || "on an unknown date"}.`,
      ]),
      el("p", {}, [review.notes || "No reviewer notes were recorded."]),
      corrections.length ? el("h3", {}, ["Corrections"]) : "",
      corrections.length ? el("ul", {}, corrections.map((item) => el("li", {}, [item]))) : "",
    ].filter(Boolean)),
  ]);
  deeperDialog.replaceChildren(sheet);
  if (!deeperDialog.open) deeperDialog.showModal();
}

function renderSubjects() {
  const counts = new Map();
  for (const post of state.posts) counts.set(post.field, (counts.get(post.field) || 0) + 1);
  const options = [
    ["all", "All subjects", state.posts.length],
    ["saved", "Saved", state.saved.length],
    ...state.fields.map((field) => [field.id, field.label, counts.get(field.id) || 0]),
  ];
  subjectList.replaceChildren();
  for (const [id, label, count] of options) {
    const button = el("button", { type: "button", "aria-pressed": state.filter === id ? "true" : "false" }, [`${label} · ${count}`]);
    button.addEventListener("click", () => {
      state.filter = id;
      subjectsBtn.textContent = id === "all" ? "Subjects" : label;
      render();
      const posts = visiblePosts();
      if (posts[0]) scrollToId(posts[0].id, "auto");
      subjectsDialog.close();
    });
    subjectList.append(button);
  }
}

function savedPosts() {
  return state.saved.map((id) => byId(id)).filter(Boolean);
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportJson() {
  const posts = savedPosts();
  if (!posts.length) {
    toast("Nothing saved to export");
    return;
  }
  const payload = {
    app: "intelligensiatok",
    exportedAt: new Date().toISOString(),
    posts,
  };
  download("intelligensiatok-saved.json", `${JSON.stringify(payload, null, 2)}\n`, "application/json");
}

function exportMarkdown() {
  const posts = savedPosts();
  if (!posts.length) {
    toast("Nothing saved to export");
    return;
  }
  const parts = ["# Saved from Intelligensiatok", ""];
  for (const post of posts) {
    parts.push(`## ${post.title}`, "", `*${fieldLabel(post.field)} · \`${post.id}\`*`, "", post.hook, "", post.body, "", "### Longer note", "", post.deeper, "", "### Example", "", post.example, "", "### Sources", "");
    for (const source of post.sources || []) parts.push(`- [${source.title}](${source.url})`);
    if (post.review) {
      parts.push("", "### Verification", "", post.review.notes || "", "");
      for (const correction of post.review.corrections || []) parts.push(`- Correction: ${correction}`);
    }
    parts.push("", "---", "");
  }
  download("intelligensiatok-saved.md", parts.join("\n"), "text/markdown");
}

function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = JSON.parse(String(reader.result));
      const posts = Array.isArray(raw) ? raw : raw.posts;
      if (!Array.isArray(posts)) throw new Error("no posts");
      let added = 0;
      for (const post of posts) {
        if (!post || typeof post.id !== "string") continue;
        state.snapshots[post.id] = post;
        if (!state.saved.includes(post.id)) {
          state.saved.push(post.id);
          added += 1;
        }
      }
      persist();
      renderSubjects();
      if (state.filter === "saved") render();
      toast(added ? `Imported ${added}` : "Those posts were already saved");
    } catch {
      toast("That file is not a saved-posts export");
    }
  };
  reader.readAsText(file);
}

let toastTimer;
function toast(message) {
  toastEl.classList.remove("with-input");
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  const dark = theme !== "light";
  themeMeta.content = dark ? "#0e0f12" : "#f4f0e7";
  colorScheme.content = dark ? "dark" : "light";
  themeBtn.innerHTML = dark ? ICONS.sun : ICONS.moon;
}

function openAbout() {
  if (subjectsDialog.open) subjectsDialog.close();
  if (!aboutDialog.open) aboutDialog.showModal();
}

function wantedId() {
  const param = new URLSearchParams(window.location.search).get("p");
  if (param) return param;
  try { return sessionStorage.getItem(LAST_KEY) || ""; } catch { return ""; }
}

async function init() {
  applyTheme(document.documentElement.dataset.theme || "dark");
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  feedEl.append(el("article", { class: "card" }, [
    el("div", { class: "card-frame" }, [
      el("p", { class: "field" }, ["Intelligensiatok"]),
      el("h2", { class: "title" }, ["Opening the shelf"]),
    ]),
  ]));
  let payload;
  try {
    const response = await fetch(FEED_URL);
    if (!response.ok) throw new Error(String(response.status));
    payload = await response.json();
  } catch {
    feedEl.replaceChildren(el("article", { class: "card" }, [
      el("div", { class: "card-frame" }, [
        el("p", { class: "field" }, ["Offline"]),
        el("h2", { class: "title" }, ["The feed did not load"]),
        el("p", { class: "hook" }, ["Start the app from a local server, or reconnect so the cached shelf can refresh."]),
      ]),
    ]));
    return;
  }
  state.posts = Array.isArray(payload.posts) ? payload.posts.filter((post) => post && post.status === "published") : [];
  let fieldFile = [];
  try {
    const response = await fetch("content/fields.json");
    if (response.ok) {
      const data = await response.json();
      fieldFile = Array.isArray(data.fields) ? data.fields : [];
    }
  } catch {
    fieldFile = [];
  }
  const present = new Set(state.posts.map((post) => post.field));
  state.fields = fieldFile.filter((field) => present.has(field.id));
  if (!state.fields.length) {
    const seen = new Set();
    for (const post of state.posts) {
      if (seen.has(post.field)) continue;
      seen.add(post.field);
      state.fields.push({ id: post.field, label: labelFromId(post.field) });
    }
  }
  renderSubjects();
  render();
  const id = wantedId();
  let posts = visiblePosts();
  if (id && !posts.some((post) => post.id === id) && state.posts.some((post) => post.id === id)) {
    state.filter = "all";
    subjectsBtn.textContent = "Subjects";
    render();
    posts = visiblePosts();
  }
  if (id && posts.some((post) => post.id === id)) {
    scrollToId(id, "auto");
    state.activeId = id;
  } else if (posts[0]) {
    state.activeId = posts[0].id;
  }
  const index = Math.max(0, posts.findIndex((post) => post.id === state.activeId));
  progressEl.style.transform = `scaleX(${posts.length ? (index + 1) / posts.length : 0})`;
}

function labelFromId(id) {
  return String(id || "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

feedEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === "save") toggleSave(id);
  if (button.dataset.action === "share") share(id);
  if (button.dataset.action === "deeper") openDeeper(id);
});

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-close]")) {
    event.target.closest("dialog")?.close();
  }
});

themeBtn.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
});
subjectsBtn.addEventListener("click", () => {
  renderSubjects();
  if (!subjectsDialog.open) subjectsDialog.showModal();
});
document.querySelector("#about-btn").addEventListener("click", openAbout);
document.querySelector("#export-json").addEventListener("click", exportJson);
document.querySelector("#export-md").addEventListener("click", exportMarkdown);
document.querySelector("#import-file").addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  if (file) importFile(file);
  event.target.value = "";
});
document.querySelector("#clear-saved").addEventListener("click", () => {
  if (!state.saved.length) {
    toast("Nothing saved");
    return;
  }
  if (!window.confirm("Remove every saved post from this device?")) return;
  state.saved = [];
  state.snapshots = {};
  persist();
  renderSubjects();
  if (state.filter === "saved") render();
  toast("Cleared on this device");
});

window.addEventListener("keydown", (event) => {
  const typing = event.target.closest("input, textarea");
  if (typing) return;
  if (event.target.closest("button, a") && (event.key === " " || event.key === "Enter")) return;
  const dialogOpen = document.querySelector("dialog[open]");
  if (event.key === "Escape") return;
  if (dialogOpen && event.key !== "?") return;
  const map = {
    ArrowDown: () => go(1),
    ArrowRight: () => go(1),
    PageDown: () => go(1),
    j: () => go(1),
    J: () => go(1),
    " ": () => go(1),
    ArrowUp: () => go(-1),
    ArrowLeft: () => go(-1),
    PageUp: () => go(-1),
    k: () => go(-1),
    K: () => go(-1),
  };
  if (map[event.key]) {
    event.preventDefault();
    map[event.key]();
    return;
  }
  if (!state.activeId && event.key !== "a" && event.key !== "A" && event.key !== "t" && event.key !== "?" ) return;
  if (event.key === "f" || event.key === "F") toggleSave(state.activeId);
  if (event.key === "d" || event.key === "D" || event.key === "Enter") openDeeper(state.activeId);
  if (event.key === "c" || event.key === "C") share(state.activeId);
  if (event.key === "a" || event.key === "A") {
    renderSubjects();
    if (!subjectsDialog.open) subjectsDialog.showModal();
  }
  if (event.key === "t" || event.key === "T") applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  if (event.key === "?") openAbout();
});

if ("scrollRestoration" in history) history.scrollRestoration = "manual";
init();
