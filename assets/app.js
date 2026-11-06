
import {createClient} from "https://esm.sh/@supabase/supabase-js@2";

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
let activePages = [];
let activePageIndex = 0;
let readerMode = ["vertical","single","double"].includes(
  localStorage.getItem("mm_reader_mode")
) ? localStorage.getItem("mm_reader_mode") : "vertical";

const themes = [
  "anime","midnight","sakura","ocean","forest","sunset","mono",
  "cyberpunk","dragon","lavender","crimson","light","retro","ice",
  "coffee","shonen","ninja","mecha","spirit","kawaii","tokyo","manga","cosmic"
];

function setTheme(theme) {
  const t = themes.includes(theme) ? theme : "midnight";
  document.body.dataset.theme = t;
  if (el("themeSelect")) el("themeSelect").value = t;
}

async function loadTheme() {
  try {
    const {data,error} = await db.from("site_settings")
      .select("setting_value")
      .eq("setting_key","theme")
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

function makePublicUrl(path) {
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// GALLERY
async function load() {
  const grid = el("grid");
  grid.textContent = "Loading…";

  const {data,error} = await db.from("public_manga")
    .select("id,title,volume,storage_path,created_at")
    .order("created_at",{ascending:false})
    .limit(100);

  if (error) {
    grid.textContent = "Gallery setup missing. Run the SQL file in supabase/public_manga_setup.sql.";
    return;
  }

  publicManga = data || [];
  grid.replaceChildren();

  if (!publicManga.length) {
    grid.textContent = "No manga yet. Upload the first page!";
    return;
  }

  const groups = new Map();

  for (const m of publicManga) {
    const key = (m.title || "Untitled").trim().toLocaleLowerCase();

    if (!groups.has(key)) {
      groups.set(key,{
        title:(m.title || "Untitled").trim(),
        chapters:[]
      });
    }

    groups.get(key).chapters.push(m);
  }

  for (const group of groups.values()) {
    const chapters = group.chapters;
    const latest = chapters[0];

    const c = document.createElement("article");
    c.className = "card folder-card";

    const im = document.createElement("img");
    im.src = makePublicUrl(latest.storage_path);
    im.alt = group.title;
    im.loading = "lazy";

    const info = document.createElement("div");
    info.className = "info";

    const h = document.createElement("b");
    h.textContent = group.title;

    const p = document.createElement("p");
    p.textContent = `📚 ${chapters.length} page records`;

    const open = document.createElement("button");
    open.className = "open-folder";
    open.textContent = "📁 Open Folder";
    open.addEventListener("click",() => openMangaFolder(group));

    info.append(h,p,open);
    c.append(im,info);
    grid.append(c);
  }
}

// GROUP PAGES INTO CHAPTERS
function makeChapterGroups(records) {
  const map = new Map();

  const sorted = [...records].sort((a,b) =>
    new Date(a.created_at) - new Date(b.created_at)
  );

  for (const page of sorted) {
    const name = (page.volume || "Chapter 1").trim() || "Chapter 1";
    const key = name.toLocaleLowerCase();

    if (!map.has(key)) {
      map.set(key,{
        volume:name,
        title:page.title,
        pages:[]
      });
    }

    map.get(key).pages.push(page);
  }

  return [...map.values()];
}

async function openMangaFolder(group) {
  activeMangaTitle = group.title;

  el("reader").classList.remove("hidden");
  el("readerLabel").textContent = "MANGA FOLDER";
  el("readerTitle").textContent = group.title;
  el("chapterView").classList.add("hidden");
  el("chapterList").classList.remove("hidden");
  el("commentsPanel").classList.add("hidden");

  const list = el("chapterList");
  list.replaceChildren();

  const chapters = makeChapterGroups(group.chapters);

  if (!chapters.length) {
    list.textContent = "No chapters found.";
    return;
  }

  chapters.forEach((chapter,index) => {
    const row = document.createElement("button");
    row.className = "chapter-item";

    const name = document.createElement("span");
    name.textContent = chapter.volume;

    const action = document.createElement("small");
    action.textContent = `📖 ${chapter.pages.length} pages · Read →`;

    row.append(name,action);
    row.addEventListener("click",() => readChapter(chapter,index));
    list.append(row);
  });

  el("reader").scrollIntoView({
    behavior:"smooth",
    block:"start"
  });

  await loadComments();

  const seenKey = "mm_view_" + group.title.toLowerCase();

  if (!sessionStorage.getItem(seenKey)) {
    const {error:viewError} = await db.rpc("increment_manga_view",{
      manga_title_input:group.title
    });

    if (!viewError) sessionStorage.setItem(seenKey,"1");
  }
}

// READER
function renderReaderPages() {
  const box = el("readerPages");

  if (!box || !activePages.length) return;

  box.replaceChildren();
  box.className = "reader-pages mode-" + readerMode;

  const start = readerMode === "vertical" ? 0 : activePageIndex;

  const count = readerMode === "vertical"
    ? activePages.length
    : readerMode === "double" ? 2 : 1;

  const end = Math.min(activePages.length,start + count);

  for (let i = start; i < end; i++) {
    const img = document.createElement("img");
    img.className = "reader-page";
    img.src = makePublicUrl(activePages[i].storage_path);
    img.alt = "Page " + (i + 1);
    img.loading = i === start ? "eager" : "lazy";
    box.append(img);
  }

  const number = el("readerPageNumber");

  if (number) {
    number.textContent = readerMode === "vertical"
      ? `${activePages.length} pages`
      : `Page ${start + 1}${end > start + 1 ? " - " + end : ""} / ${activePages.length}`;
  }

  document.querySelectorAll("[data-reader-mode]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.readerMode === readerMode
    );
  });

  const previousDisabled = activePageIndex <= 0;
  const nextDisabled = activePageIndex + count >= activePages.length;

  ["readerPrev","readerPrevBottom"].forEach(id => {
    if (el(id)) {
      el(id).disabled = readerMode === "vertical" || previousDisabled;
    }
  });

  ["readerNext","readerNextBottom"].forEach(id => {
    if (el(id)) {
      el(id).disabled = readerMode === "vertical" || nextDisabled;
    }
  });
}

function readChapter(chapter,index) {
  activePages = chapter.pages || [chapter];
  activePageIndex = 0;

  el("chapterList").classList.add("hidden");
  el("commentsPanel").classList.remove("hidden");
  el("chapterView").classList.remove("hidden");

  el("readerLabel").textContent = "NOW READING";
  el("chapterName").textContent =
    chapter.volume || `Chapter ${index + 1}`;

  renderReaderPages();
}

function changeReaderPage(direction) {
  if (readerMode === "vertical" || !activePages.length) return;

  const step = readerMode === "double" ? 2 : 1;

  const maxIndex = readerMode === "double"
    ? Math.max(0,activePages.length - 2)
    : activePages.length - 1;

  activePageIndex = Math.max(
    0,
    Math.min(maxIndex,activePageIndex + direction * step)
  );

  renderReaderPages();
}

// READER MODE BUTTONS
document.querySelectorAll("[data-reader-mode]").forEach(button => {
  button.addEventListener("click",() => {
    const mode = button.dataset.readerMode;

    if (!["vertical","single","double"].includes(mode)) return;

    readerMode = mode;
    localStorage.setItem("mm_reader_mode",mode);
    activePageIndex = 0;
    renderReaderPages();
  });
});

// PREVIOUS BUTTONS
["readerPrev","readerPrevBottom"].forEach(id => {
  if (el(id)) {
    el(id).addEventListener("click",() => {
      changeReaderPage(-1);
    });
  }
});

// NEXT BUTTONS
["readerNext","readerNextBottom"].forEach(id => {
  if (el(id)) {
    el(id).addEventListener("click",() => {
      changeReaderPage(1);
    });
  }
});

// CLOSE READER
el("readerClose").addEventListener("click",() => {
  el("reader").classList.add("hidden");
  activePages = [];

  if (el("readerPages")) el("readerPages").replaceChildren();
  if (el("readerImage")) el("readerImage").removeAttribute("src");
});

// BACK TO CHAPTERS
el("backToChapters").addEventListener("click",() => {
  el("chapterView").classList.add("hidden");
  el("chapterList").classList.remove("hidden");
  el("commentsPanel").classList.add("hidden");
  el("readerLabel").textContent = "MANGA FOLDER";
  activePages = [];

  if (el("readerPages")) el("readerPages").replaceChildren();
});

// MULTI-PAGE UPLOAD
el("uploadForm").addEventListener("submit",async e => {
  e.preventDefault();

  const b = el("uploadButton");
  const msg = el("message");
  const chosen = [...el("file").files];
  const title = el("title").value.trim();

  const chapterInput = el("volume");
  const chapterName = chapterInput?.value.trim() || "Chapter 1";

  if (!chosen.length || !title) return;

  if (chosen.length > 50) {
    msg.textContent = "Please select no more than 50 files at once.";
    return;
  }

  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  if (chosen.some(f =>
    !allowed.includes(f.type) || f.size > 8 * 1024 * 1024
  )) {
    msg.textContent = "Every file must be JPG, PNG, WEBP or GIF under 8 MB.";
    return;
  }

  b.disabled = true;

  let uploaded = 0;
  const failed = [];

  try {
    for (let i = 0; i < chosen.length; i++) {
      const f = chosen[i];

      msg.textContent = `Uploading page ${i + 1} of ${chosen.length}…`;

      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const path = crypto.randomUUID() + "." + ext;

      let r = await db.storage.from(BUCKET).upload(path,f,{
        contentType:f.type
      });

      if (r.error) {
        failed.push(f.name + ": " + r.error.message);
        continue;
      }

      r = await db.from("public_manga").insert({
        title,
        volume:chapterName,
        storage_path:path
      });

      if (r.error) {
        await db.storage.from(BUCKET).remove([path]);
        failed.push(f.name + ": " + r.error.message);
        continue;
      }

      uploaded++;
    }

    el("uploadForm").reset();

    msg.textContent = failed.length
      ? `Uploaded ${uploaded}/${chosen.length} pages. Failed: ${failed.join(" | ")}`
      : `Success! ${uploaded} pages uploaded to ${chapterName}.`;

    await load();

  } catch(err) {
    msg.textContent = err.message || "Upload failed";
  } finally {
    b.disabled = false;
  }
});

// OWNER LOGIN
async function verifyOwner() {
  if (!session?.user) return false;

  const {data,error} = await db.from("site_admins")
    .select("user_id")
    .eq("user_id",session.user.id)
    .maybeSingle();

  if (error) throw error;

  return !!data;
}

function showOwner() {
  el("ownerPanel").classList.toggle("hidden",!isOwner);
  el("ownerLogout").classList.toggle("hidden",!session);
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

    if (isOwner) {
      await loadOwnerList();
      await loadOwnerStats();
      await loadTheme();
    }
  } catch(e) {
    isOwner = false;
    showOwner();
    el("ownerMessage").textContent =
      "Could not verify owner: " + (e.message || e);
  }
}

el("ownerLoginForm").addEventListener("submit",async e => {
  e.preventDefault();

  const b = el("ownerLoginButton");
  b.disabled = true;
  el("ownerMessage").textContent = "Signing in…";

  try {
    const {data,error} = await db.auth.signInWithPassword({
      email:el("ownerEmail").value.trim(),
      password:el("ownerPassword").value
    });

    if (error) throw error;

    session = data.session;
    await ownerStatus();

  } catch(err) {
    el("ownerMessage").textContent = err.message || "Login failed";
  } finally {
    b.disabled = false;
  }
});

el("ownerLogout").addEventListener("click",async() => {
  const {error} = await db.auth.signOut();

  if (error) {
    el("ownerMessage").textContent = error.message;
    return;
  }

  session = null;
  isOwner = false;
  showOwner();
  el("ownerMessage").textContent = "Signed out.";
});

// OWNER UPLOAD LIST
async function loadOwnerList() {
  if (!isOwner) return;

  const box = el("ownerMangaList");
  box.textContent = "Loading uploads…";

  const {data,error} = await db.from("public_manga")
    .select("id,title,volume,storage_path,created_at")
    .order("created_at",{ascending:false})
    .limit(200);

  if (error) {
    box.textContent = "Could not load uploads: " + error.message;
    return;
  }

  box.replaceChildren();

  if (!data.length) {
    box.textContent = "No manga uploads yet.";
    return;
  }

  for (const m of data) {
    const row = document.createElement("div");
    row.className = "manage-row";

    const info = document.createElement("div");
    const title = document.createElement("b");
    title.textContent = m.title;

    const sub = document.createElement("div");
    const small = document.createElement("small");
    small.textContent = (m.volume || "Manga page") + " · ID " + m.id;

    sub.append(small);
    info.append(title,sub);

    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "Delete";
    del.addEventListener("click",() => deleteManga(m));

    row.append(info,del);
    box.append(row);
  }
}

async function deleteManga(m) {
  if (!isOwner) return;

  if (!confirm(`Delete “${m.title}” from the public library? This cannot be undone.`)) {
    return;
  }

  const {error:storageError} = await db.storage.from(BUCKET)
    .remove([m.storage_path]);

  if (storageError) {
    el("ownerMessage").textContent =
      "File delete failed: " + storageError.message;
    return;
  }

  const {error} = await db.from("public_manga")
    .delete()
    .eq("id",m.id);

  if (error) {
    el("ownerMessage").textContent =
      "Record delete failed: " + error.message;
    return;
  }

  el("ownerMessage").textContent = "Manga deleted.";

  await loadOwnerList();
  await load();
}

// COMMENTS
async function loadComments() {
  const box = el("commentList");
  box.textContent = "Loading comments…";

  const {data,error} = await db.from("manga_comments")
    .select("id,display_name,comment,created_at")
    .eq("manga_title",activeMangaTitle)
    .order("created_at",{ascending:false})
    .limit(100);

  if (error) {
    box.textContent =
      "Comments setup missing. Run supabase/community_features.sql.";
    return;
  }

  box.replaceChildren();

  if (!data.length) {
    box.textContent = "No comments yet. Be the first!";
    return;
  }

  for (const c of data) {
    const item = document.createElement("article");
    item.className = "comment-item";

    const head = document.createElement("b");
    head.textContent = c.display_name;

    const body = document.createElement("p");
    body.textContent = c.comment;

    const date = document.createElement("small");
    date.textContent = new Date(c.created_at).toLocaleString();

    item.append(head,body,date);
    box.append(item);
  }
}

el("commentForm").addEventListener("submit",async e => {
  e.preventDefault();

  const name = el("commentName").value.trim();
  const comment = el("commentText").value.trim();
  const msg = el("commentMessage");

  if (!name || !comment || !activeMangaTitle) return;

  el("commentSubmit").disabled = true;

  const {error} = await db.from("manga_comments").insert({
    manga_title:activeMangaTitle,
    display_name:name,
    comment
  });

  el("commentSubmit").disabled = false;

  if (error) {
    msg.textContent = "Could not post comment: " + error.message;
    return;
  }

  el("commentText").value = "";
  msg.textContent = "Comment posted.";

  await loadComments();
});

// OWNER STATS
async function loadOwnerStats() {
  if (!isOwner) return;

  const stats = el("ownerStats");
  const recent = el("recentComments");

  const [
    {data:views,error:ve},
    {data:comments,error:ce},
    {count:commentCount,error:cc},
    {count:mangaCount,error:me}
  ] = await Promise.all([
    db.from("manga_view_counts").select("views"),
    db.from("manga_comments")
      .select("id,manga_title,display_name,comment,created_at")
      .order("created_at",{ascending:false})
      .limit(8),
    db.from("manga_comments").select("id",{count:"exact",head:true}),
    db.from("public_manga").select("id",{count:"exact",head:true})
  ]);

  if (ve || ce || cc || me) {
    stats.textContent =
      "Community feature setup required. Run supabase/community_features.sql.";
    return;
  }

  const totalViews = (views || []).reduce(
    (s,x) => s + Number(x.views || 0),0
  );

  stats.textContent =
    `Total views: ${totalViews} · Comments: ${commentCount || 0} · Uploaded pages: ${mangaCount || 0}`;

  recent.replaceChildren();

  for (const c of comments || []) {
    const row = document.createElement("div");
    row.className = "recent-comment";

    const t = document.createElement("p");
    t.textContent =
      `${c.display_name} on ${c.manga_title}: ${c.comment}`;

    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "Delete";

    del.addEventListener("click",async() => {
      if (!confirm("Delete this comment?")) return;

      const {error} = await db.from("manga_comments")
        .delete()
        .eq("id",c.id);

      if (error) {
        stats.textContent = "Delete failed: " + error.message;
        return;
      }

      await loadOwnerStats();
    });

    row.append(t,del);
    recent.append(row);
  }
}

// THEME SETTINGS
el("themeForm").addEventListener("submit",async e => {
  e.preventDefault();

  if (!isOwner) return;

  const theme = el("themeSelect").value;
  if (!themes.includes(theme)) return;

  el("themeMessage").textContent = "Saving theme…";

  const {error} = await db.from("site_settings").upsert({
    setting_key:"theme",
    setting_value:theme
  },{onConflict:"setting_key"});

  if (error) {
    el("themeMessage").textContent =
      "Theme save failed: " + error.message;
    return;
  }

  setTheme(theme);
  el("themeMessage").textContent =
    "Website theme updated for everyone.";
});

// REFRESH AND AUTH
el("refresh").addEventListener("click",load);

db.auth.getSession().then(async({data}) => {
  session = data.session;
  await ownerStatus();
});

db.auth.onAuthStateChange((_event,newSession) => {
  session = newSession;
  ownerStatus();
});

loadTheme();
load();
  
