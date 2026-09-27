const app = document.getElementById("app");
const TOKEN_KEY = "ahyh-token";
let data = null;
let mode = "articles";
let currentId = "";
let hasApi = false;

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
      <p class="hint">登录后可修改文章、单页和站点信息。</p>
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

function articleForm() {
  const item = (data.articles || []).find((article) => article.id === currentId) || {
    id: "", title: "", date: "", source: "", summary: "", html: "", categories: ["news"]
  };
  const cats = (data.categories || []).map((cat) => `
    <label><input type="checkbox" name="cat" value="${esc(cat.id)}" ${(item.categories || []).includes(cat.id) ? "checked" : ""}> ${esc(cat.name)}</label>`).join(" ");
  return `
    <form id="editor">
      <label class="field">标题<input name="title" value="${esc(item.title)}" required></label>
      <div class="row">
        <label class="field">日期<input name="date" value="${esc(item.date)}" placeholder="2026-09-24"></label>
        <label class="field">来源<input name="source" value="${esc(item.source)}"></label>
      </div>
      <div class="field">栏目<div class="row">${cats}</div></div>
      <label class="field">摘要<input name="summary" value="${esc(item.summary)}"></label>
      <label class="field">正文 HTML<textarea name="html">${esc(item.html)}</textarea></label>
      <div class="row">
        <button class="primary" type="submit">保存文章</button>
        ${item.id ? `<button class="danger" type="button" id="remove">删除</button>` : ""}
      </div>
    </form>`;
}

function pageForm() {
  const item = (data.pages || []).find((page) => page.slug === currentId);
  if (!item) return `<div class="empty">请选择单页</div>`;
  return `
    <form id="editor">
      <label class="field">标题<input name="title" value="${esc(item.title)}" required></label>
      <label class="field">正文 HTML<textarea name="html">${esc(item.html)}</textarea></label>
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
        item.html = String(formData.get("html") || "");
      } else {
        const cats = formData.getAll("cat");
        const payload = {
          id: currentId || String(Date.now()),
          title: String(formData.get("title") || ""),
          date: String(formData.get("date") || ""),
          source: String(formData.get("source") || ""),
          summary: String(formData.get("summary") || ""),
          html: String(formData.get("html") || ""),
          views: "",
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
