const app = document.getElementById("app");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function qs(name) {
  return new URLSearchParams(location.search).get(name) || "";
}

function sanitize(html) {
  return String(html || "").replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
}

function catName(data, id) {
  const cat = (data.categories || []).find((item) => item.id === id);
  return cat ? cat.name : "";
}

function articlesIn(data, catId) {
  return (data.articles || [])
    .filter((item) => (item.categories || []).includes(catId))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function newsItem(item) {
  return `<li><a href="article.html?id=${esc(item.id)}">${esc(item.title)}</a><time>${esc(item.date)}</time></li>`;
}

function panel(title, href, items) {
  const more = href ? `<a href="${href}">更多</a>` : "";
  const list = items.length
    ? `<ul class="news-list">${items.map(newsItem).join("")}</ul>`
    : `<div class="empty">暂无内容</div>`;
  return `<section class="block"><h2><span>${esc(title)}</span>${more}</h2>${list}</section>`;
}

async function loadData() {
  let fromServer = false;
  try {
    const health = await fetch("/api/health");
    fromServer = health.ok;
  } catch (err) {
    fromServer = false;
  }
  const res = await fetch(fromServer ? "/api/site" : "data/site.json");
  if (!res.ok) throw new Error("站点数据加载失败");
  const published = await res.json();
  if (fromServer) return published;
  // 纯静态托管时，本机管理后台的修改写在 localStorage，只影响当前浏览器
  try {
    const local = localStorage.getItem("ahyh-cms");
    if (local) return JSON.parse(local);
  } catch (err) {
    /* 本地缓存损坏就用已发布数据 */
  }
  return published;
}

function chrome(data, active) {
  const meta = data.meta || {};
  const pages = data.pages || [];
  const aboutKids = pages.filter((item) => item.group === "协会概况");
  const brand = meta.logo
    ? `<a class="brand-logo" href="index.html"><img src="${esc(meta.logo)}" alt="${esc(meta.name || "安徽省烟花爆竹协会")}"></a>`
    : `<div class="brand"><div class="seal">皖<br>协</div><div><h1>${esc(meta.name || "安徽省烟花爆竹协会")}</h1><p>${esc(meta.nameEn || "")}</p></div></div>`;
  const dropdown = (items) => items.length
    ? `<div class="dropdown">${items.map((item) => `<a href="${item.href}">${esc(item.label)}</a>`).join("")}</div>`
    : "";
  const aboutMenu = dropdown(aboutKids.map((item) => ({ href: `page.html?slug=${item.slug}`, label: item.title })));
  const newsMenu = dropdown([
    { href: "list.html?cat=news", label: "要闻速递" },
    { href: "list.html?cat=industry", label: "行业信息" }
  ]);
  const mark = (key) => active === key ? "active" : "";
  const links = (data.friendLinks || []).map((item) => `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.name)}</a>`).join("");
  return `
    <div class="topbar"><div class="wrap"><span>欢迎访问${esc(meta.name || "安徽省烟花爆竹协会")}</span><span>电话 ${esc(meta.phone || "")}</span></div></div>
    <header class="header">
      <div class="sky-fire" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="wrap">${brand}</div>
    </header>
    <nav class="nav"><div class="wrap">
      <button class="nav-toggle" type="button" aria-label="打开菜单">菜单</button>
      <ul class="menu">
        <li class="${mark("home")}"><a href="index.html">网站首页</a></li>
        <li class="${mark("about")}"><a href="page.html?slug=about">协会概况</a>${aboutMenu}</li>
        <li class="${mark("news")}"><a href="list.html?cat=news">新闻中心</a>${newsMenu}</li>
        <li class="${mark("notice")}"><a href="list.html?cat=notice">通知公告</a></li>
        <li class="${mark("foundation")}"><a href="list.html?cat=foundation">基金会</a></li>
        <li class="${mark("president")}"><a href="list.html?cat=president">会长单位</a></li>
        <li class="${mark("contact")}"><a href="page.html?slug=contact">联系我们</a></li>
      </ul>
      <form class="search" action="list.html" method="get">
        <input name="q" type="search" placeholder="搜索标题" value="${esc(qs("q"))}" aria-label="搜索">
        <button type="submit">搜索</button>
      </form>
    </div></nav>
    <main id="main"></main>
    <footer class="footer"><div class="wrap">
      <h3>友情链接</h3>
      <div class="links">${links || "<span>暂无</span>"}</div>
      <div class="legal">
        <div>Copyright © 2003 ${esc(meta.name || "安徽省烟花爆竹协会")} All rights reserved.</div>
        <div>本网站的图片、文字之类如果涉及侵权，请及时通知我们（${esc(meta.phone || "0551-65735810")}），本网站将在第一时间删除。</div>
        <div style="margin-top:8px"><a href="admin.html">管理后台</a></div>
      </div>
    </div></footer>`;
}

function bindNav() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => nav.classList.toggle("open"));
  }
}

function sideNav(data, current) {
  const pages = (data.pages || []).filter((item) => item.group === "协会概况" || item.slug === "contact");
  const cats = data.categories || [];
  const pageLinks = pages.map((item) => `<a class="${current === "page:" + item.slug ? "on" : ""}" href="page.html?slug=${esc(item.slug)}">${esc(item.title)}</a>`).join("");
  const catLinks = cats.map((item) => `<a class="${current === "cat:" + item.id ? "on" : ""}" href="list.html?cat=${esc(item.id)}">${esc(item.name)}</a>`).join("");
  return `<aside class="side"><h2>栏目</h2>${pageLinks}${catLinks}</aside>`;
}

function renderHome(data) {
  const banners = data.banners || [];
  const slides = banners.map((item, index) => `
    <a class="slide${index === 0 ? " on" : ""}" href="list.html?cat=news">
      <img src="${esc(item.image)}" alt="${esc(item.title)}">
      <span>${esc(item.title)}</span>
    </a>`).join("");
  const dots = banners.map((_, index) => `<button type="button" class="${index === 0 ? "on" : ""}" data-i="${index}" aria-label="第${index + 1}张"></button>`).join("");
  const slider = banners.length
    ? `<div class="slider">${slides}<div class="dots">${dots}</div></div>`
    : `<div class="slider"><div class="slide on"><span>安徽省烟花爆竹协会</span></div></div>`;
  const meta = data.meta || {};
  const cover = banners[1] || banners[0];
  app.querySelector("#main").innerHTML = `
    <div class="wrap">
      <section class="hero">
        ${slider}
        ${panel("要闻速递", "list.html?cat=news", articlesIn(data, "news").slice(0, 8))}
      </section>
      <section class="grid3">
        ${panel("行业信息", "list.html?cat=industry", articlesIn(data, "industry").slice(0, 6))}
        ${panel("通知公告", "list.html?cat=notice", articlesIn(data, "notice").slice(0, 6))}
        ${panel("会长单位", "list.html?cat=president", articlesIn(data, "president").slice(0, 6))}
      </section>
      <section class="about">
        ${cover ? `<img class="about-photo" src="${esc(cover.image)}" alt="${esc(cover.title)}">` : ""}
        <div>
          <h2>协会简介</h2>
          <p>${esc(meta.summary || "安徽省烟花爆竹协会成立于2002年4月，是全省性社会团体。")}</p>
          <a class="btn" href="page.html?slug=about">查看全文</a>
        </div>
        <div class="about-side">
          <span>成立时间</span><strong>${esc(meta.founded || "2002年4月")}</strong>
          <span>联系电话</span><strong>${esc(meta.phone || "")}</strong>
        </div>
      </section>
    </div>`;
  const slideEls = [...app.querySelectorAll(".slide")];
  const dotEls = [...app.querySelectorAll(".dots button")];
  if (slideEls.length > 1) {
    let current = 0;
    const show = (index) => {
      current = index;
      slideEls.forEach((el, i) => el.classList.toggle("on", i === index));
      dotEls.forEach((el, i) => el.classList.toggle("on", i === index));
    };
    dotEls.forEach((el) => el.addEventListener("click", () => show(Number(el.dataset.i))));
    setInterval(() => show((current + 1) % slideEls.length), 5000);
  }
}

function renderList(data) {
  const q = qs("q").trim();
  const cat = qs("cat");
  let title = "搜索结果";
  let items = data.articles || [];
  if (q) {
    items = items.filter((item) => (item.title || "").includes(q));
    title = `搜索：${q}`;
  } else if (cat) {
    items = articlesIn(data, cat);
    title = catName(data, cat) || "栏目";
  } else {
    items = [...items].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }
  const note = !q && cat
    ? `<p class="hint">以下为从原站同步的最近内容。</p>`
    : "";
  app.querySelector("#main").innerHTML = `
    <div class="wrap page">
      <div class="crumb"><a href="index.html">首页</a> / ${esc(title)}</div>
      <div class="layout">
        ${sideNav(data, "cat:" + cat)}
        <section class="doc">
          <h1 class="list-title">${esc(title)}</h1>
          ${note}
          ${items.length ? `<ul class="news-list">${items.map(newsItem).join("")}</ul>` : `<div class="empty">没有找到相关内容</div>`}
        </section>
      </div>
    </div>`;
  document.title = `${title} - 安徽省烟花爆竹协会`;
}

function docMeta(item) {
  return `<div class="meta">发布日期：${esc(item.date || "")}&nbsp;&nbsp;信息来源：${esc(item.source || "")}&nbsp;&nbsp;浏览量：${esc(item.views || "")}</div>`;
}

// 原站用 align=center 标章节标题，抓取时被去掉了。整段加粗的短句按标题居中，其余正文首行缩进。
function dressProse(root) {
  root.querySelectorAll("p").forEach((p) => {
    if (p.closest("table")) return;
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
}

function renderArticle(data) {
  const item = (data.articles || []).find((article) => article.id === qs("id"));
  const main = app.querySelector("#main");
  if (!item) {
    main.innerHTML = `<div class="wrap page"><div class="empty">文章不存在或已删除。</div></div>`;
    return;
  }
  const cat = (item.categories || [])[0] || "";
  const catLabel = catName(data, cat) || "新闻";
  main.innerHTML = `
    <div class="wrap page">
      <div class="layout">
        ${sideNav(data, "cat:" + cat)}
        <div>
          <div class="crumb-bar">当前位置：<a href="index.html">首页</a> &gt;&gt; <a href="list.html?cat=${esc(cat)}">${esc(catLabel)}</a></div>
          <article class="article read">
            <h1>${esc(item.title)}</h1>
            ${docMeta(item)}
            <div class="prose">${sanitize(item.html) || "<p>暂无正文</p>"}</div>
          </article>
        </div>
      </div>
    </div>`;
  dressProse(main.querySelector(".prose"));
  document.title = `${item.title} - 安徽省烟花爆竹协会`;
}

function renderPage(data) {
  const item = (data.pages || []).find((page) => page.slug === qs("slug")) || data.pages?.[0];
  const main = app.querySelector("#main");
  if (!item) {
    main.innerHTML = `<div class="wrap page"><div class="empty">页面不存在。</div></div>`;
    return;
  }
  main.innerHTML = `
    <div class="wrap page">
      <div class="layout">
        ${sideNav(data, "page:" + item.slug)}
        <div>
          <div class="crumb-bar">当前位置：<a href="index.html">首页</a> &gt;&gt; ${esc(item.title)}</div>
          <article class="doc read">
            <h1>${esc(item.title)}</h1>
            ${docMeta(item)}
            <div class="prose">${sanitize(item.html) || "<p>暂无内容</p>"}</div>
          </article>
        </div>
      </div>
    </div>`;
  dressProse(main.querySelector(".prose"));
  document.title = `${item.title} - 安徽省烟花爆竹协会`;
}

loadData().then((data) => {
  const page = document.body.dataset.page;
  const active = { home: "home", list: qs("cat") || "news", article: "news", page: qs("slug") === "contact" ? "contact" : "about" }[page] || "home";
  app.innerHTML = chrome(data, active);
  bindNav();
  if (page === "home") renderHome(data);
  else if (page === "list") renderList(data);
  else if (page === "article") renderArticle(data);
  else renderPage(data);
}).catch((err) => {
  app.textContent = err.message || "页面加载失败";
});
