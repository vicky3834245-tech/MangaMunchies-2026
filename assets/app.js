
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = "https://eaaqnmaouwqvtnbugkds.supabase.co";
const KEY = "sb_publishable_Hi9QQp6knAoRyC_vxWnxJA_8G8HZJ-T";
const BUCKET = "manga-pages";

const db = createClient(URL, KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const el = id => document.getElementById(id);

let session = null;
let isOwner = false;
let publicManga = [];

let activeMangaTitle = "";
let activeContentType = "manga";
let activeFolderRecords = [];
let activeVolumeName = "";
let activeChapters = [];
let activeChapterIndex = 0;
let activePages = [];
let activePageIndex = 0;

let readerMode = ["vertical", "single", "double"].includes(
  localStorage.getItem("mm_reader_mode")
) ? localStorage.getItem("mm_reader_mode") : "vertical";

const themes = [
  "anime", "midnight", "sakura", "ocean", "forest", "sunset",
  "mono", "cyberpunk", "dragon", "lavender", "crimson", "light",
  "retro", "ice", "coffee", "shonen", "ninja", "mecha",
  "spirit", "kawaii", "tokyo", "manga", "cosmic"
];

function showMessage(id, message) {
  const node = el(id);
  if (node) node.textContent = message;
}

function makePublicUrl(path) {
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function recordType(record) {
  return record.content_type === "ova" ? "ova" : "manga";
}

function recordVolume(record) {
  return (record.volume_name || "Volume 1").trim() || "Volume 1";
}

function recordChapter(record) {
  return (record.chapter_name || record.volume || "Chapter 1").trim() || "Chapter 1";
}

function sortOldest(records) {
  return [...records].sort((a, b) =>
    new Date(a.created_at) - new Date(b.created_at)
  );
}

function groupByName(records, getName) {
  const map = new Map();

  for (const record of sortOldest(records)) {
    const name = getName(record);
    const key = name.toLocaleLowerCase();

    if (!map.has(key)) map.set(key, { name, records: [] });
    map.get(key).records.push(record);
  }

  return [...map.values()];
}

// =====================================
// THEMES
// =====================================

function setTheme(theme) {
  const selected = themes.includes(theme) ? theme : "anime";
  document.body.dataset.theme = selected;

  if (el("themeSelect")) el("themeSelect").value = selected;
}

async function loadTheme() {
  try {
    const { data, error } = await db
      .from("site_settings")
      .select("setting_value")
      .eq("setting_key", "theme")
      .maybeSingle();

    setTheme(!error && data?.setting_value ? data.setting_value : "anime");
  } catch {
    setTheme("anime");
  }
}

el("themeForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!isOwner) {
    showMessage("themeMessage", "Owner access required.");
    return;
  }

  const button = el("saveTheme");
  button.disabled = true;
  showMessage("themeMessage", "Saving theme...");

  try {
    const { error } = await db.from("site_settings").upsert({
      setting_key: "theme",
      setting_value: el("themeSelect").value
    }, { onConflict: "setting_key" });

    if (error) throw error;

    setTheme(el("themeSelect").value);
    showMessage("themeMessage", "Theme saved successfully!");
  } catch (error) {
    showMessage("themeMessage", error.message);
  } finally {
    button.disabled = false;
  }
});

// =====================================
// LOAD LIBRARY
// =====================================

async function load() {
  el("grid").textContent = "Loading...";
  el("ovaGrid").textContent = "Loading...";

  const { data, error } = await db
    .from("public_manga")
    .select("id,title,volume,storage_path,created_at,content_type,volume_name,chapter_name")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    el("grid").textContent = "Gallery error: " + error.message;
    el("ovaGrid").textContent = "Could not load OVA library.";
    return;
  }

  publicManga = data || [];

  renderFolderCards(
    publicManga.filter(r => recordType(r) === "manga"),
    el("grid"),
    "manga"
  );

  renderFolderCards(
    publicManga.filter(r => recordType(r) === "ova"),
    el("ovaGrid"),
    "ova"
  );
}

function renderFolderCards(records, container, type) {
  container.replaceChildren();

  if (!records.length) {
    container.textContent = type === "ova"
      ? "No OVA uploaded yet."
      : "No manga yet. Upload the first chapter!";
    return;
  }

  const groups = groupByName(
    records,
    r => (r.title || "Untitled").trim()
  ).reverse();

  for (const group of groups) {
    const latest = [...group.records].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )[0];

    const card = document.createElement("article");
    card.className = "card folder-card";

    const img = document.createElement("img");
    img.src = makePublicUrl(latest.storage_path);
    img.alt = group.name;
    img.loading = "lazy";

    const info = document.createElement("div");
    info.className = "info";

    const heading = document.createElement("b");
    heading.textContent = group.name;

    const count = document.createElement("p");

    if (type === "manga") {
      count.textContent =
        `📚 ${groupByName(group.records, recordVolume).length} Volumes · ${groupByName(group.records, recordChapter).length} Chapters`;
    } else {
      count.textContent =
        `🎬 ${groupByName(group.records, recordChapter).length} OVA entries`;
    }

    const open = document.createElement("button");
    open.className = "open-folder";
    open.textContent = type === "ova" ? "🎬 Open OVA" : "📁 Open Manga Folder";
    open.addEventListener("click", () => openMangaFolder(group, type));

    info.append(heading, count, open);
    card.append(img, info);
    container.append(card);
  }
}

// =====================================
// FOLDERS AND VOLUMES
// =====================================

async function openMangaFolder(group, type) {
  activeMangaTitle = group.name;
  activeContentType = type;
  activeFolderRecords = group.records;
  activeVolumeName = "";

  el("reader").classList.remove("hidden");
  el("readerTitle").textContent = group.name;
  el("readerLabel").textContent = type === "ova" ? "OVA LIBRARY" : "MANGA FOLDER";

  el("chapterView").classList.add("hidden");
  el("chapterList").classList.remove("hidden");
  el("commentsPanel").classList.add("hidden");

  if (type === "ova") renderOvaChapters();
  else renderVolumes();

  el("reader").scrollIntoView({ behavior: "smooth", block: "start" });

  await loadComments();

  const seenKey = "mm_view_" + type + "_" + group.name.toLowerCase();

  if (!sessionStorage.getItem(seenKey)) {
    const { error } = await db.rpc("increment_manga_view", {
      manga_title_input: group.name
    });

    if (!error) sessionStorage.setItem(seenKey, "1");
  }
}

function renderVolumes() {
  const list = el("chapterList");
  list.replaceChildren();

  el("chapterView").classList.add("hidden");
  el("chapterList").classList.remove("hidden");
  el("commentsPanel").classList.add("hidden");

  el("readerLabel").textContent = "MANGA VOLUMES";
  el("readerTitle").textContent = activeMangaTitle;

  const volumes = groupByName(activeFolderRecords, recordVolume);

  if (!volumes.length) {
    list.textContent = "No volumes found.";
    return;
  }

  for (const volume of volumes) {
    const chapters = groupByName(volume.records, recordChapter);

    const button = document.createElement("button");
    button.className = "volume-item";

    const name = document.createElement("span");
    name.textContent = "📁 " + volume.name;

    const detail = document.createElement("small");
    detail.textContent = `${chapters.length} Chapters · Open →`;

    button.append(name, detail);
    button.addEventListener("click", () => renderVolumeChapters(volume.name));
    list.append(button);
  }
}

function renderVolumeChapters(volumeName) {
  activeVolumeName = volumeName;

  const records = activeFolderRecords.filter(
    r => recordVolume(r).toLowerCase() === volumeName.toLowerCase()
  );

  renderChapterList(groupByName(records, recordChapter), renderVolumes);

  el("readerLabel").textContent = "CHAPTERS";
  el("readerTitle").textContent = activeMangaTitle + " · " + volumeName;
}

function renderOvaChapters() {
  const chapters = groupByName(activeFolderRecords, recordChapter);

  renderChapterList(chapters, () => {
    el("reader").classList.add("hidden");
  });

  el("readerLabel").textContent = "OVA EPISODES";
  el("readerTitle").textContent = activeMangaTitle;
}

function renderChapterList(chapters, backAction) {
  const list = el("chapterList");
  list.replaceChildren();

  el("chapterView").classList.add("hidden");
  el("chapterList").classList.remove("hidden");
  el("commentsPanel").classList.add("hidden");

  const back = document.createElement("button");
  back.className = "secondary library-back";
  back.textContent = activeContentType === "ova" ? "← Back to OVA" : "← Back to Volumes";
  back.addEventListener("click", backAction);
  list.append(back);

  activeChapters = chapters;

  if (!chapters.length) {
    const empty = document.createElement("p");
    empty.textContent = "No chapters found.";
    list.append(empty);
    return;
  }

  chapters.forEach((chapter, index) => {
    const button = document.createElement("button");
    button.className = "chapter-item";

    const name = document.createElement("span");
    name.textContent = chapter.name;

    const detail = document.createElement("small");
    detail.textContent = `📖 ${chapter.records.length} pages · Read →`;

    button.append(name, detail);
    button.addEventListener("click", () => readChapter(chapter, index));
    list.append(button);
  });
}

// =====================================
// READER
// =====================================

function readChapter(chapter, index) {
  activeChapterIndex = index;
  activePages = sortOldest(chapter.records);
  activePageIndex = 0;

  el("chapterList").classList.add("hidden");
  el("commentsPanel").classList.remove("hidden");
  el("chapterView").classList.remove("hidden");

  el("readerLabel").textContent = "NOW READING";
  el("chapterNameDisplay").textContent = chapter.name;

  renderReaderPages();
  updateChapterNavigation();
}

function renderReaderPages() {
  const box = el("readerPages");
  box.replaceChildren();
  box.className = "reader-pages mode-" + readerMode;

  if (!activePages.length) {
    box.textContent = "No pages found.";
    return;
  }

  const start = readerMode === "vertical" ? 0 : activePageIndex;
  const count = readerMode === "vertical"
    ? activePages.length
    : readerMode === "double" ? 2 : 1;

  const end = Math.min(activePages.length, start + count);

  for (let i = start; i < end; i++) {
    const img = document.createElement("img");
    img.className = "reader-page";
    img.src = makePublicUrl(activePages[i].storage_path);
    img.alt = "Page " + (i + 1);
    img.loading = i === start ? "eager" : "lazy";
    box.append(img);
  }

  el("readerPageNumber").textContent = readerMode === "vertical"
    ? `${activePages.length} pages`
    : `Page ${start + 1}${end > start + 1 ? " - " + end : ""} / ${activePages.length}`;

  document.querySelectorAll("[data-reader-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.readerMode === readerMode);
  });

  const disabledPrevious = activePageIndex <= 0;
  const disabledNext = activePageIndex + count >= activePages.length;

  ["readerPrev", "readerPrevBottom"].forEach(id => {
    el(id).disabled = readerMode === "vertical" || disabledPrevious;
  });

  ["readerNext", "readerNextBottom"].forEach(id => {
    el(id).disabled = readerMode === "vertical" || disabledNext;
  });
}

function changeReaderPage(direction) {
  if (readerMode === "vertical" || !activePages.length) return;

  const step = readerMode === "double" ? 2 : 1;
  const maxIndex = readerMode === "double"
    ? Math.max(0, Math.ceil(activePages.length / 2) * 2 - 2)
    : activePages.length - 1;

  activePageIndex = Math.max(0, Math.min(maxIndex, activePageIndex + direction * step));
  renderReaderPages();
}

function updateChapterNavigation() {
  el("previousChapter").disabled = activeChapterIndex <= 0;
  el("nextChapter").disabled = activeChapterIndex >= activeChapters.length - 1;
}

function navigateChapter(direction) {
  const next = activeChapterIndex + direction;
  if (next < 0 || next >= activeChapters.length) return;

  readChapter(activeChapters[next], next);
  el("chapterView").scrollIntoView({ behavior: "smooth", block: "start" });
}

el("previousChapter").addEventListener("click", () => navigateChapter(-1));
el("nextChapter").addEventListener("click", () => navigateChapter(1));

document.querySelectorAll("[data-reader-mode]").forEach(button => {
  button.addEventListener("click", () => {
    const mode = button.dataset.readerMode;
    if (!["vertical", "single", "double"].includes(mode)) return;

    readerMode = mode;
    localStorage.setItem("mm_reader_mode", mode);
    activePageIndex = 0;
    renderReaderPages();
  });
});

["readerPrev", "readerPrevBottom"].forEach(id => {
  el(id).addEventListener("click", () => changeReaderPage(-1));
});

["readerNext", "readerNextBottom"].forEach(id => {
  el(id).addEventListener("click", () => changeReaderPage(1));
});

el("backToChapters").addEventListener("click", () => {
  el("chapterView").classList.add("hidden");
  el("chapterList").classList.remove("hidden");
  el("commentsPanel").classList.add("hidden");

  if (activeContentType === "ova") renderOvaChapters();
  else renderVolumeChapters(activeVolumeName);

  activePages = [];
  el("readerPages").replaceChildren();
});

el("readerClose").addEventListener("click", () => {
  el("reader").classList.add("hidden");
  activePages = [];
  activeFolderRecords = [];
  activeChapters = [];
  el("readerPages").replaceChildren();
});

// =====================================
// BULK UPLOAD ENTRY UI
// =====================================

const bulkEntries = el("bulkEntries");
let entryCounter = 1;

function updateEntryType(entry) {
  const type = entry.querySelector(".entry-type").value;
  const volumeField = entry.querySelector(".entry-volume-field");
  const volumeInput = entry.querySelector(".entry-volume");

  if (type === "ova") {
    volumeField.classList.add("hidden");
    volumeInput.value = "OVA";
    volumeInput.disabled = true;
  } else {
    volumeField.classList.remove("hidden");
    volumeInput.disabled = false;
    if (!volumeInput.value || volumeInput.value === "OVA") {
      volumeInput.value = "Volume 1";
    }
  }
}

function bindEntry(entry) {
  entry.querySelector(".entry-type").addEventListener("change", () => {
    updateEntryType(entry);
  });

  entry.querySelector(".remove-entry").addEventListener("click", () => {
    if (bulkEntries.children.length <= 1) {
      showMessage("message", "At least one entry is required.");
      return;
    }
    entry.remove();
    renumberEntries();
  });

  updateEntryType(entry);
}

function renumberEntries() {
  [...bulkEntries.querySelectorAll(".upload-entry")].forEach((entry, index) => {
    entry.querySelector(".entry-heading").textContent =
      "Manga / OVA " + (index + 1);
  });
}

function addEntry() {
  const entry = document.createElement("div");
  entry.className = "bulk-entry upload-entry";

  entry.innerHTML = `
    <h3 class="entry-heading"></h3>

    <label>Content type
      <select class="entry-type" required>
        <option value="manga">Manga</option>
        <option value="ova">OVA</option>
      </select>
    </label>

    <label>Manga / OVA title
      <input class="entry-title" maxlength="100" required placeholder="Example: One Piece">
    </label>

    <label class="entry-volume-field">Volume name
      <input class="entry-volume" maxlength="100" value="Volume 1" placeholder="Volume 1">
    </label>

    <label>Chapter name / Episode name
      <input class="entry-chapter" maxlength="100" required value="Chapter 1">
    </label>

    <label>Chapter page images (up to 50 files)
      <input class="entry-files" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple required>
    </label>

    <p class="upload-hint">JPG, PNG, WEBP and GIF. Maximum 8 MB per image.</p>
    <button type="button" class="secondary remove-entry">✕ Remove this entry</button>
  `;

  bulkEntries.append(entry);
  bindEntry(entry);
  renumberEntries();
}

const firstEntry = bulkEntries.querySelector(".upload-entry");

const removeFirst = document.createElement("button");
removeFirst.type = "button";
removeFirst.className = "secondary remove-entry";
removeFirst.textContent = "✕ Remove this entry";
firstEntry.append(removeFirst);

bindEntry(firstEntry);

el("addMangaEntry").addEventListener("click", () => {
  addEntry();
  showMessage("message", "New entry added.");
});

// =====================================
// UPLOAD ALL
// =====================================

el("uploadForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = el("uploadButton");
  const entries = [...bulkEntries.querySelectorAll(".upload-entry")];

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  const jobs = [];
  const errors = [];

  entries.forEach((entry, index) => {
    const type = entry.querySelector(".entry-type").value;
    const title = entry.querySelector(".entry-title").value.trim();
    const volume = type === "ova"
      ? "OVA"
      : entry.querySelector(".entry-volume").value.trim();
    const chapter = entry.querySelector(".entry-chapter").value.trim();
    const files = [...entry.querySelector(".entry-files").files];

    if (!title || !chapter || !files.length) {
      errors.push(`Entry ${index + 1}: Fill title, chapter and select images.`);
      return;
    }

    if (type === "manga" && !volume) {
      errors.push(`Entry ${index + 1}: Enter a volume name.`);
      return;
    }

    if (files.length > 50) {
      errors.push(`Entry ${index + 1}: Maximum 50 images allowed.`);
      return;
    }

    if (files.some(file =>
      !allowed.includes(file.type) || file.size > 8 * 1024 * 1024
    )) {
      errors.push(`Entry ${index + 1}: Images must be JPG, PNG, WEBP or GIF under 8 MB.`);
      return;
    }

    jobs.push({ type, title, volume, chapter, files, index: index + 1 });
  });

  if (errors.length) {
    showMessage("message", errors.join(" "));
    return;
  }

  if (!jobs.length) {
    showMessage("message", "Add at least one Manga or OVA entry.");
    return;
  }

  button.disabled = true;
  el("addMangaEntry").disabled = true;

  let total = 0;
  let success = 0;
  const failed = [];

  try {
    for (const job of jobs) {
      for (let i = 0; i < job.files.length; i++) {
        const file = job.files[i];
        total++;

        showMessage(
          "message",
          `Uploading entry ${job.index}/${jobs.length} · ${job.title} · page ${i + 1}/${job.files.length} · Completed ${success}`
        );

        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = crypto.randomUUID() + "." + ext;

        const upload = await db.storage.from(BUCKET).upload(
          path,
          file,
          { contentType: file.type }
        );

        if (upload.error) {
          failed.push(`${job.title} / ${file.name}: ${upload.error.message}`);
          continue;
        }

        const insert = await db.from("public_manga").insert({
          title: job.title,
          volume: job.type === "ova" ? "OVA" : job.chapter,
          content_type: job.type,
          volume_name: job.volume,
          chapter_name: job.chapter,
          storage_path: path
        });

        if (insert.error) {
          await db.storage.from(BUCKET).remove([path]);
          failed.push(`${job.title} / ${file.name}: ${insert.error.message}`);
          continue;
        }

        success++;
     
