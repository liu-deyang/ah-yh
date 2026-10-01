const app = document.getElementById("app");
const TOKEN_KEY = "ahyh-token";
let data = null;
let mode = "articles";
let currentId = "";
let hasApi = false;
let pendingHtml = "";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

async function detectApi() {
  try {
    const res = await fetch("/api/health");
    hasApi = res.ok;
  } catch (err) {
    hasApi = false;
  }
}

async function loadPublished() {
  const res = await fetch(hasApi ? "/api/site" : "data/site.json");
  if (!res.ok) throw new Error("读取站点数据失败");
  const published = await res.json();
  if (hasApi) return published;
  try {
    const local = localStorage.getItem("ahyh-cms");
    if (local) return JSON.parse(local);
  } catch (err) {
    /* 忽略损坏的本地缓存 */
  }
  return published;
}

function loginView(message) {
  app.innerHTML = `
    <form class="login-card" id="login">
      <h1>管理后台</h1>
      <p class="hint">登录后可修改文章、单页和站点信息。正文用按钮排版，不用写代码。</p>
      <label class="field">账号<input name="username" autocomplete="username" required></label>
      <label class="field">密码<input name="password" type="password" autocomplete="current-password" required></label>
      <div class="error">${esc(message || "")}</div>
      <button class="primary" type="submit">登录</button>
      <p class="hint" style="margin-top:14px"><a href="index.html">返回网站首页</a></p>
    </form>`;
  app.querySelector("#login").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const username = String(form.get("username") || "");
    const password = String(form.get("password") || "");
    if (hasApi) {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        loginView(body.error || "登录失败");
        return;
      }
      sessionStorage.setItem(TOKEN_KEY, body.token);
    } else if (!(username === "admin" && password === "ahyh2026")) {
      loginView("账号或密码错误");
      return;
    } else {
      sessionStorage.setItem(TOKEN_KEY, "local");
    }
    data = await loadPublished();
    currentId = mode === "articles" ? (data.articles?.[0]?.id || "") : (data.pages?.[0]?.slug || "");
    render();
  });
}

function articleList() {
  return (data.articles || []).map((item) => `
    <button type="button" class="${item.id === currentId ? "on" : ""}" data-id="${esc(item.id)}">
      ${esc(item.title)}<br><span class="hint">${esc(item.date)}</span>
    </button>`).join("");
}

function pageList() {
  return (data.pages || []).map((item) => `
    <button type="button" class="${item.slug === currentId ? "on" : ""}" data-id="${esc(item.slug)}">${esc(item.title)}</button>`).join("");
}

function bodyField() {
  return `
    <div class="field">
      <span>正文</span>
      <p class="hint">选中文字后点按钮排版。可以直接输入或粘贴，不用写代码。</p>
      <div class="rte">
        <div class="rte-bar">
          <button type="button" data-cmd="bold">加粗</button>
          <button type="button" data-cmd="heading">章节标题</button>
          <button type="button" data-cmd="center">居中</button>
          <button type="button" data-cmd="indent">首行缩进</button>
          <button type="button" data-cmd="plain">顶格</button>
          <button type="button" data-cmd="right">右对齐</button>
          <button type="button" data-cmd="image">插入图片</button>
        </div>
        <div class="rte-body prose" id="body" contenteditable="true"></div>
      </div>
      <input id="pic" type="file" accept="image/*" hidden>
    </div>`;
}

function articleForm() {
  const item = (data.articles || []).find((article) => article.id === currentId) || {
    id: "", title: "", date: "", source: "", views: "", summary: "", html: "", categories: ["news"]
  };
  pendingHtml = item.html || "";
  const cats = (data.categories || []).map((cat) => `
    <label><input type="checkbox" name="cat" value="${esc(cat.id)}" ${(item.categories || []).includes(cat.id) ? "checked" : ""}> ${esc(cat.name)}</label>`).join(" ");
  return `
    <form id="editor">
      <label class="field">标题<input name="title" value="${esc(item.title)}" required></label>
      <div class="row">
        <label class="field">发布日期<input name="date" value="${esc(item.date)}" placeholder="2026-09-24"></label>
        <label class="field">信息来源<input name="source" value="${esc(item.source)}"></label>
        <label class="field">浏览量<input name="views" value="${esc(item.views)}"></label>
      </div>
      <div class="field">栏目<div class="row">${cats}</div></div>
      <label class="field">摘要<input name="summary" value="${esc(item.summary)}"></label>
      ${bodyField()}
      <div class="row">
        <button class="primary" type="submit">保存文章</button>
        ${item.id ? `<button class="danger" type="button" id="remove">删除</button>` : ""}
      </div>
    </form>`;
}

function pageForm() {
  const item = (data.pages || []).find((page) => page.slug === currentId);
  if (!item) return `<div class="empty">请选择单页</div>`;
  pendingHtml = item.html || "";
  return `
    <form id="editor">
      <label class="field">标题<input name="title" value="${esc(item.title)}" required></label>
      <div class="row">
        <label class="field">发布日期<input name="date" value="${esc(item.date)}" placeholder="2013-10-25"></label>
        <label class="field">信息来源<input name="source" value="${esc(item.source)}"></label>
        <label class="field">浏览量<input name="views" value="${esc(item.views)}"></label>
      </div>
      ${bodyField()}
      <button class="primary" type="submit">保存单页</button>
    </form>`;
}

function metaForm() {
  const meta = data.meta || {};
  return `
    <form id="editor">
      <label class="field">站点名称<input name="name" value="${esc(meta.name)}"></label>
      <label class="field">英文名<input name="nameEn" value="${esc(meta.nameEn)}"></label>
      <label class="field">电话<input name="phone" value="${esc(meta.phone)}"></label>
      <label class="field">邮箱<input name="email" value="${esc(meta.email)}"></label>
      <label class="field">地址<input name="address" value="${esc(meta.address)}"></label>
      <label class="field">首页简介<textarea name="summary">${esc(meta.summary)}</textarea></label>
      <button class="primary" type="submit">保存站点信息</button>
    </form>`;
}

const KEEP_TAG = new Set(["p", "br", "strong", "b", "em", "u", "span", "a", "img", "table", "thead", "tbody", "tr", "td", "th", "ul", "ol", "li", "h2", "h3", "div"]);
const KEEP_CLASS = new Set(["indent", "center-line", "mid", "sign-line", "plain"]);

function sanitize(html) {
  const box = document.createElement("div");
  box.innerHTML = String(html || "");
  box.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((el) => el.remove());
  [...box.querySelectorAll("*")].forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (!KEEP_TAG.has(tag)) {
      el.replaceWith(...el.childNodes);
      return;
    }
    const align = (el.getAttribute("style") || "").match(/text-align\s*:\s*(left|center|right|justify)/i);
    const kept = [...el.classList].filter((name) => KEEP_CLASS.has(name));
    const href = el.getAttribute("href") || "";
    const src = el.getAttribute("src") || "";
    const alt = el.getAttribute("alt") || "";
    const colspan = el.getAttribute("colspan") || "";
    const rowspan = el.getAttribute("rowspan") || "";
    [...el.attributes].forEach((attr) => el.removeAttribute(attr.name));
    if (kept.length) el.className = kept.join(" ");
    if (align && !kept.length && (tag === "p" || tag === "div" || tag === "h2" || tag === "h3")) {
      const value = align[1].toLowerCase();
      if (value === "center") el.classList.add("mid");
      else if (value === "right") el.classList.add("sign-line");
      else if (value === "justify") el.classList.add("indent");
      else el.classList.add("plain");
    }
    if (tag === "a" && (/^https?:/i.test(href) || /^(index|list|article|page)\.html/.test(href) || href.startsWith("/") || href.startsWith("#"))) {
      el.setAttribute("href", href);
    }
    if (tag === "td" || tag === "th") {
      if (colspan) el.setAttribute("colspan", colspan);
      if (rowspan) el.setAttribute("rowspan", rowspan);
    }
    if (tag === "img") {
      if (!/^(https?:|assets\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(src)) el.remove();
      else {
        el.setAttribute("src", src);
        if (alt) el.setAttribute("alt", alt);
      }
    }
  });
  box.querySelectorAll("div").forEach((div) => {
    if (div.querySelector("div, p, table, ul, ol")) return;
    const p = document.createElement("p");
    p.className = div.className;
    p.innerHTML = div.innerHTML;
    div.replaceWith(p);
  });
  return box.innerHTML.trim();
}

function prepareBody(html) {
  const box = document.createElement("div");
  box.innerHTML = sanitize(html) || "<p><br></p>";
  box.querySelectorAll("p").forEach((p) => {
    if (p.closest("table")) return;
    if ([...p.classList].some((name) => KEEP_CLASS.has(name))) return;
    const raw = (p.textContent || "").replace(/\u00a0/g, " ");
    const text = raw.trim();
    if (!text) {
      p.remove();
      return;
    }
    const plain = text.replace(/\s+/g, "");
    const bold = [...p.querySelectorAll("strong, b")].map((node) => node.textContent.replace(/\s+/g, "")).join("");
    if (bold && plain.length <= 40 && bold.length / plain.length >= 0.75) {
      p.classList.add("center-line");
      return;
    }
    if (/^\s{8,}/.test(raw)) {
      p.classList.add("sign-line");
      return;
    }
    if (!/^第[0-9一二三四五六七八九十百零]+条/.test(plain) && !/^[（(][0-9一二三四五六七八九十]+[）)]/.test(plain)) {
      p.classList.add("indent");
    }
  });
  if (!box.textContent.trim() && !box.querySelector("img")) box.innerHTML = "<p><br></p>";
  return box.innerHTML;
}

function blockOf(editor) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  let node = sel.anchorNode;
  if (!node || !editor.contains(node)) return null;
  if (node.nodeType === 3) node = node.parentElement;
  return node && node.closest ? node.closest("p, li, h2, h3") : null;
}

function markBlock(editor, cls) {
  editor.focus();
  document.execCommand("formatBlock", false, "p");
  const block = blockOf(editor);
  if (!block) return;
  block.classList.remove("indent", "center-line", "mid", "sign-line", "plain");
  if (cls) block.classList.add(cls);
}

function bindRte() {
  const editor = app.querySelector("#body");
  const bar = app.querySelector(".rte-bar");
  if (!editor || !bar) return;
  editor.innerHTML = prepareBody(pendingHtml);
  bar.addEventListener("mousedown", (event) => {
    if (event.target.closest("button")) event.preventDefault();
  });
  bar.addEventListener("click", (event) => {
    const btn = event.target.closest("button");
    if (!btn) return;
    const cmd = btn.dataset.cmd;
    if (cmd === "image") {
      app.querySelector("#pic").click();
      return;
    }
    editor.focus();
    if (cmd === "bold") {
      document.execCommand("bold");
      return;
    }
    if (cmd === "heading") {
      markBlock(editor, "center-line");
      const block = blockOf(editor);
      if (block && !block.querySelector("strong, b")) block.innerHTML = `<strong>${block.innerHTML}</strong>`;
      return;
    }
    const cls = { center: "mid", indent: "indent", plain: "plain", right: "sign-line" }[cmd];
    if (cls) markBlock(editor, cls);
  });
  app.querySelector("#pic").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 1500000) {
      alert("图片请小于 1.5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      editor.focus();
      document.execCommand("insertHTML", false, `<p class="plain"><img src="${reader.result}" alt=""></p>`);
    };
    reader.readAsDataURL(file);
  });
  editor.addEventListener("paste", (event) => {
    const clip = event.clipboardData;
    if (!clip) return;
    const html = clip.getData("text/html");
    const text = clip.getData("text/plain");
    if (!html && !text) return;
    event.preventDefault();
    editor.focus();
    if (html) document.execCommand("insertHTML", false, sanitize(html));
    else document.execCommand("insertText", false, text);
  });
}

function readBody() {
  const editor = app.querySelector("#body");
  return editor ? sanitize(editor.innerHTML) : "";
}

async function persist() {
  if (hasApi) {
    const res = await fetch("/api/site", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + sessionStorage.getItem(TOKEN_KEY)
      },
      body: JSON.stringify(data)
    });
    if (res.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      loginView("登录已失效，请重新登录");
      return false;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "保存失败");
    }
    return true;
  }
  localStorage.setItem("ahyh-cms", JSON.stringify(data));
  return true;
}

function render(message) {
  const list = mode === "articles" ? articleList() : mode === "pages" ? pageList() : "";
  const form = mode === "articles" ? articleForm() : mode === "pages" ? pageForm() : metaForm();
  const storageHint = hasApi
    ? "保存后会写回站点数据，刷新首页即可看到。"
    : "当前是静态访问，修改只保存在这台浏览器。";
  app.innerHTML = `
    <div class="admin-shell">
      <div class="editor">
        <div class="row" style="justify-content:space-between">
          <h1>管理后台</h1>
          <div class="row">
            <a href="index.html">查看网站</a>
            <button class="ghost" type="button" id="logout">退出</button>
          </div>
        </div>
        <p class="hint">${storageHint}</p>
        <div class="tabs">
          <button type="button" class="${mode === "articles" ? "on" : ""}" data-mode="articles">文章</button>
          <button type="button" class="${mode === "pages" ? "on" : ""}" data-mode="pages">单页</button>
          <button type="button" class="${mode === "meta" ? "on" : ""}" data-mode="meta">站点信息</button>
          ${mode === "articles" ? `<button type="button" id="add">新建文章</button>` : ""}
        </div>
        <p class="ok">${esc(message || "")}</p>
        <div class="${mode === "meta" ? "" : "split"}">
          ${mode === "meta" ? "" : `<div class="pick">${list || "<div class='empty'>暂无</div>"}</div>`}
          <div>${form}</div>
        </div>
      </div>
    </div>`;

  app.querySelectorAll("[data-mode]").forEach((btn) => btn.addEventListener("click", () => {
    mode = btn.dataset.mode;
    currentId = mode === "articles" ? (data.articles[0]?.id || "") : mode === "pages" ? (data.pages[0]?.slug || "") : "";
    render();
  }));
  app.querySelectorAll(".pick button").forEach((btn) => btn.addEventListener("click", () => {
    currentId = btn.dataset.id;
    render();
  }));
  const add = app.querySelector("#add");
  if (add) add.addEventListener("click", () => {
    currentId = "";
    render();
  });
  app.querySelector("#logout").addEventListener("click", () => {
    sessionStorage.removeItem(TOKEN_KEY);
    loginView();
  });
  const editor = app.querySelector("#editor");
  if (!editor) return;
  editor.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(editor);
    try {
      if (mode === "meta") {
        data.meta = data.meta || {};
        ["name", "nameEn", "phone", "email", "address", "summary"].forEach((key) => {
          data.meta[key] = String(formData.get(key) || "");
        });
      } else if (mode === "pages") {
        const item = data.pages.find((page) => page.slug === currentId);
        if (!item) return;
        item.title = String(formData.get("title") || "");
        item.date = String(formData.get("date") || "");
        item.source = String(formData.get("source") || "");
        item.views = String(formData.get("views") || "");
        item.html = readBody();
      } else {
        const cats = formData.getAll("cat");
        const payload = {
          id: currentId || String(Date.now()),
          title: String(formData.get("title") || ""),
          date: String(formData.get("date") || ""),
          source: String(formData.get("source") || ""),
          summary: String(formData.get("summary") || ""),
          html: readBody(),
          views: String(formData.get("views") || ""),
          categories: cats.length ? cats : ["news"]
        };
        const index = (data.articles || []).findIndex((item) => item.id === payload.id);
        if (index >= 0) data.articles[index] = { ...data.articles[index], ...payload };
        else data.articles.unshift(payload);
        currentId = payload.id;
      }
      await persist();
      render("已保存");
    } catch (err) {
      render(err.message || "保存失败");
    }
  });
  bindRte();
  const remove = app.querySelector("#remove");
  if (remove) remove.addEventListener("click", async () => {
    if (!currentId || !confirm("删除这篇文章？")) return;
    data.articles = data.articles.filter((item) => item.id !== currentId);
    currentId = data.articles[0]?.id || "";
    try {
      await persist();
      render("已删除");
    } catch (err) {
      render(err.message || "删除失败");
    }
  });
}

detectApi().then(async () => {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    loginView();
    return;
  }
  data = await loadPublished();
  currentId = data.articles?.[0]?.id || "";
  render();
}).catch((err) => {
  app.textContent = err.message || "后台加载失败";
});
