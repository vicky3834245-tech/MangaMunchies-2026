
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

// =====================================
// COMMON HELPERS
// =====================================

function safeText(value) {
  return String(value ?? "");
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
  return (record.chapter_name || record.volume || "Chapter 1")
    .trim() || "Chapter 1";
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

    if (!map.has(key)) {
      map.set(key, { name, records: [] });
    }

    map.get(key).records.push(record);
  }

  return [...map.values()];
}

function showMessage(id, message) {
  const node = el(id);
  if (node) node.textContent = message;
}

// =====================================
// THEMES
// =====================================

function setTheme(theme) {
  const selected = themes.includes(theme) ? theme : "anime";
  document.body.dataset.theme = selected;

  if (el("themeSelect")) {
    el("themeSelect").value = selected;
  }
}

async function loadTheme() {
  try {
    const { data, error } = await db
      .from("site_settings")
      .select("setting_value")
      .eq("setting_key", "theme")
      .maybeSingle();

    if (!error && data?.setting_value) {
      setTheme(data.setting_value);
    } else {
      setTheme("anime");
    }
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

  const theme = el("themeSelect").value;
  const button = el("saveTheme");

  button.disabled = true;
  showMessage("themeMessage", "Saving theme...");

  try {
    const { error } = await db.from("site_settings").upsert({
      setting_key: "theme",
      setting_value: theme
    }, {
      onConflict: "setting_key"
    });

    if (error) throw error;

    setTheme(theme);
    showMessage("themeMessage", "Theme saved successfully!");
  } catch (error) {
    showMessage("themeMessage", error.message);
  } finally {
    button.disabled = false;
  }
});

// =====================================
// LOAD PUBLIC LIBRARY
// =====================================

async function load() {
  const grid = el("grid");
  const ovaGrid = el("ovaGrid");

  grid.textContent = "Loading...";
  ovaGrid.textContent = "Loading...";

  const { data, error } = await db
    .from("public_manga")
    .select("id,title,volume,storage_path,created_at,content_type,volume_name,chapter_name")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    grid.textContent = "Gallery error: " + error.message;
    ovaGrid.textContent = "Could not load OVA library.";
    return;
  }

  publicManga = data || [];

  const mangaRecords = publicManga.filter(
    record => recordType(record) === "manga"
  );

  const ovaRecords = publicManga.filter(
    record => recordType(record) === "ova"
  );

  renderFolderCards(mangaRecords, grid, "manga");
  renderFolderCards(ovaRecords, ovaGrid, "ova");
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
    record => (record.title || "Untitled").trim()
  ).reverse();

  for (const group of groups) {
    const latest = [...group.records].sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
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
      const volumes = groupByName(group.records, recordVolume);
      const chapters = groupByName(group.records, recordChapter);

      count.textContent =
        `📚 ${volumes.length} Volumes · ${chapters.length} Chapters`;
    } else {
      const chapters = groupByName(group.records, recordChapter);
      count.textContent = `🎬 ${chapters.length} OVA entries`;
    }

    const open = document.createElement("button");
    open.className = "open-folder";
    open.textContent = type === "ova"
      ? "🎬 Open OVA"
      : "📁 Open Manga Folder";

    open.addEventListener("click", () => openMangaFolder(group, type));

    info.append(heading, count, open);
    card.append(img, info);
    container.append(card);
  }
}

// =====================================
// OPEN FOLDER
// =====================================

async function openMangaFolder(group, type) {
  activeMangaTitle = group.name;
  activeContentType = type;
  activeFolderRecords = group.records;
  activeVolumeName = "";

  el("reader").classList.remove("hidden");
  el("readerTitle").textContent = group.name;
  el("readerLabel").textContent =
    type === "ova" ? "OVA LIBRARY" : "MANGA FOLDER";

  el("chapterView").classList.add("hidden");
  el("chapterList").classList.remove("hidden");
  el("commentsPanel").classList.add("hidden");

  if (type === "ova") {
    renderOvaChapters();
  } else {
    renderVolumes();
  }

  el("reader").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  await loadComments();

  const seenKey =
    "mm_view_" + type + "_" + group.name.toLowerCase();

  if (!sessionStorage.getItem(seenKey)) {
    const { error } = await db.rpc("increment_manga_view", {
      manga_title_input: group.name
    });

    if (!error) {
      sessionStorage.setItem(seenKey, "1");
    }
  }
}

// =====================================
// MANGA VOLUMES
// =====================================

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

    button.addEventListener("click", () => {
      renderVolumeChapters(volume.name);
    });

    list.append(button);
  }
}

// =====================================
// CHAPTERS INSIDE VOLUME
// =====================================

function renderVolumeChapters(volumeName) {
  activeVolumeName = volumeName;

  const records = activeFolderRecords.filter(
    record => recordVolume(record).toLowerCase() ===
      volumeName.toLowerCase()
  );

  const chapters = groupByName(records, recordChapter);

  renderChapterList(chapters, renderVolumes);

  el("readerLabel").textContent = "CHAPTERS";
  el("readerTitle").textContent =
    activeMangaTitle + " · " + volumeName;
}

// =====================================
// OVA LIBRARY
// =====================================

function renderOvaChapters() {
  const chapters = groupByName(activeFolderRecords, recordChapter);

  renderChapterList(chapters, () => {
    el("reader").classList.add("hidden");
  });

  el("readerLabel").textContent = "OVA EPISODES";
  el("readerTitle").textContent = activeMangaTitle;
}

// =====================================
// COMMON CHAPTER LIST
// =====================================

function renderChapterList(chapters, backAction) {
  const list = el("chapterList");

  list.replaceChildren();

  el("chapterView").classList.add("hidden");
  el("chapterList").classList.remove("hidden");
  el("commentsPanel").classList.add("hidden");

  const back = document.createElement("button");
  back.className = "secondary library-back";
  back.textContent = activeContentType === "ova"
    ? "← Back"
    : "← Back to Volumes";

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
    detail.textContent =
      `📖 ${chapter.records.length} pages · Read →`;

    button.append(name, detail);

    button.addEventListener("click", () => {
      readChapter(chapter, index);
    });

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
  if (!box) return;

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

  el("readerPageNumber").textContent =
    readerMode === "vertical"
      ? `${activePages.length} pages`
      : `Page ${start + 1}${end > start + 1 ? " - " + end : ""} / ${activePages.length}`;

  document.querySelectorAll("[data-reader-mode]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.readerMode === readerMode
    );
  });

  const previousDisabled = activePageIndex <= 0;
  const nextDisabled = activePageIndex + count >= activePages.length;

  ["readerPrev", "readerPrevBottom"].forEach(id => {
    el(id).disabled = readerMode === "vertical" || previousDisabled;
  });

  ["readerNext", "readerNextBottom"].forEach(id => {
    el(id).disabled = readerMode === "vertical" || nextDisabled;
  });
}

function changeReaderPage(direction) {
  if (readerMode === "vertical" || !activePages.length) return;

  const step = readerMode === "double" ? 2 : 1;

  const maxIndex = readerMode === "double"
    ? Math.max(0, Math.ceil(activePages.length / 2) * 2 - 2)
    : activePages.length - 1;

  activePageIndex = Math.max(
    0,
    Math.min(maxIndex, activePageIndex + direction * step)
  );

  renderReaderPages();
}

// =====================================
// PREVIOUS / NEXT CHAPTER
// =====================================

function updateChapterNavigation() {
  el("previousChapter").disabled = activeChapterIndex <= 0;

  el("nextChapter").disabled =
    activeChapterIndex >= activeChapters.length - 1;
}

function navigateChapter(direction) {
  const next = activeChapterIndex + direction;

  if (next < 0 || next >= activeChapters.length) return;

  readChapter(activeChapters[next], next);

  el("chapterView").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

el("previousChapter").addEventListener("click", () => {
  navigateChapter(-1);
});

el("nextChapter").addEventListener("click", () => {
  navigateChapter(1);
});

// =====================================
// READER MODE
// =====================================

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

// =====================================
// BACK TO CHAPTERS
// =====================================

el("backToChapters").addEventListener("click", () => {
  el("chapterView").classList.add("hidden");
  el("chapterList").classList.remove("hidden");
  el("commentsPanel").classList.add("hidden");

  if (activeContentType === "ova") {
    renderOvaChapters();
  } else {
    renderVolumeChapters(activeVolumeName);
  }

  activePages = [];
  el("readerPages").replaceChildren();
});

// =====================================
// CLOSE READER
// =====================================

el("readerClose").addEventListener("click", () => {
  el("reader").classList.add("hidden");

  activePages = [];
  activeFolderRecords = [];
  activeChapters = [];

  el("readerPages").replaceChildren();
});

// =====================================
// UPLOAD TYPE
// =====================================

function updateUploadType() {
  const type = el("contentType").value;
  const volumeField = el("volumeField");
  const volumeInput = el("volumeName");

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

el("contentType").addEventListener("change", updateUploadType);
updateUploadType();

// =====================================
// UPLOAD MANGA / OVA PAGES
// =====================================

el("uploadForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = el("uploadButton");
  const message = el("message");

  const chosen = [...el("file").files];
  const title = el("title").value.trim();
  const contentType = el("contentType").value;

  const volumeName = contentType === "ova"
    ? "OVA"
    : el("volumeName").value.trim();

  const chapterName = el("chapterName").value.trim();

  if (!chosen.length || !title || !chapterName) {
    message.textContent = "Please fill all required fields.";
    return;
  }

  if (contentType === "manga" && !volumeName) {
    message.textContent = "Please enter a volume name.";
    return;
  }

  if (chosen.length > 50) {
    message.textContent = "Please select no more than 50 files at once.";
    return;
  }

  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  if (chosen.some(file =>
    !allowed.includes(file.type) ||
    file.size > 8 * 1024 * 1024
  )) {
    message.textContent =
      "Every file must be JPG, PNG, WEBP or GIF under 8 MB.";
    return;
  }

  button.disabled = true;

  let uploaded = 0;
  const failed = [];

  try {
    for (let i = 0; i < chosen.length; i++) {
      const file = chosen[i];

      message.textContent =
        `Uploading page ${i + 1} of ${chosen.length}...`;

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = crypto.randomUUID() + "." + ext;

      let result = await db.storage.from(BUCKET).upload(
        path,
        file,
        { contentType: file.type }
      );

      if (result.error) {
        failed.push(file.name + ": " + result.error.message);
        continue;
      }

      result = await db.from("public_manga").insert({
        title,
        volume: contentType === "ova" ? "OVA" : chapterName,
        content_type: contentType,
        volume_name: volumeName,
        chapter_name: chapterName,
        storage_path: path
      });

      if (result.error) {
        await db.storage.from(BUCKET).remove([path]);
        failed.push(file.name + ": " + result.error.message);
        continue;
      }

      uploaded++;
    }

    if (failed.length) {
      message.textContent =
        `Uploaded ${uploaded}/${chosen.length}. Failed: ${failed.join(" | ")}`;
    } else {
      message.textContent =
        `Success! ${uploaded} pages uploaded to ${title} → ${volumeName} → ${chapterName}.`;

      el("uploadForm").reset();
      updateUploadType();
    }

    await load();
    if (isOwner) await loadOwnerList();

  } catch (error) {
    message.textContent = error.message || "Upload failed.";
  } finally {
    button.disabled = false;
  }
});

// =====================================
// OWNER LOGIN
// =====================================

async function verifyOwner() {
  if (!session?.user) return false;

  const { data, error } = await db
    .from("site_admins")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) throw error;

  return !!data;
}

function showOwner() {
  el("ownerPanel").classList.toggle("hidden", !isOwner);
  el("ownerLogout").classList.toggle("hidden", !session);

  el("ownerBadge").textContent = isOwner
    ? "Owner verified"
    : "Owner only";
}

async function ownerStatus() {
  if (!session) {
    isOwner = false;
    showOwner();

    el("ownerMessage").textContent =
      "Sign in with your owner email and password.";

    return;
  }

  try {
    isOwner = await verifyOwner();
    showOwner();

    el("ownerMessage").textContent = isOwner
      ? "Owner access verified."
      : "Owner access denied. This account is not registered in site_admins.";

    if (isOwne
