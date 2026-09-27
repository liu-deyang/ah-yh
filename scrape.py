# 从原站抓取栏目、单页和最近一页文章，图片落到本地，避免升级站点用 https 时被浏览器拦截 http 图片。
import hashlib
import html
import json
import os
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "http://www.ah-yh.com"
ROOT = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(ROOT, "assets", "img")
UA = {"User-Agent": "Mozilla/5.0"}

CATEGORIES = [
    ("news", "882", "要闻速递", "新闻中心"),
    ("industry", "883", "行业信息", "新闻中心"),
    ("notice", "896", "通知公告", "通知公告"),
    ("foundation", "907", "基金会", "基金会"),
    ("president", "889", "会长单位", "会长单位"),
]

PAGES = [
    ("about", "1716", "协会简介", "协会概况"),
    ("charter", "1715", "协会章程", "协会概况"),
    ("org", "1717", "组织机构", "协会概况"),
    ("council", "3380", "理事会", "协会概况"),
    ("supervisors", "3381", "监事会", "协会概况"),
    ("honor", "1714", "协会荣誉", "协会概况"),
    ("contact", "1743", "联系我们", "联系我们"),
]


def get(url):
    req = urllib.request.Request(url, headers=UA)
    last = None
    for _ in range(2):
        try:
            with urllib.request.urlopen(req, timeout=18) as resp:
                return resp.read(2_000_000)
        except Exception as exc:
            last = exc
    print("FAIL", url, type(last).__name__, flush=True)
    return b""


def get_text(url):
    raw = get(url)
    if not raw:
        return ""
    return raw.decode("gbk", "replace")


def extract_div(page, class_name):
    match = re.search(rf'<div class="{class_name}"[^>]*>', page)
    if not match:
        return ""
    i = match.end()
    depth = 1
    j = i
    while j < len(page) and depth:
        nxt_open = page.find("<div", j)
        nxt_close = page.find("</div>", j)
        if nxt_close < 0:
            break
        if 0 <= nxt_open < nxt_close:
            depth += 1
            j = nxt_open + 4
        else:
            depth -= 1
            if depth == 0:
                return page[i:nxt_close]
            j = nxt_close + 6
    return ""


def plain(fragment):
    text = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text).replace("\xa0", " ")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return re.sub(r"[ \t]{2,}", " ", text).strip()


def clean_html(fragment):
    fragment = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", fragment, flags=re.I | re.S)
    fragment = re.sub(r"</?o:p[^>]*>", "", fragment, flags=re.I)
    fragment = re.sub(r'\s(?:style|class|align|lang|valign|width|height)="[^"]*"', "", fragment, flags=re.I)
    fragment = re.sub(r"\s(?:style|class|align|lang|valign|width|height)='[^']*'", "", fragment, flags=re.I)
    fragment = re.sub(r"<p>(?:\s|&nbsp;|<br\s*/?>)*</p>", "", fragment, flags=re.I)
    return fragment.strip()


def abs_url(src):
    src = src.strip()
    if src.startswith("http://") or src.startswith("https://"):
        return src
    if src.startswith("//"):
        return "http:" + src
    if src.startswith("/"):
        return BASE + src
    return BASE + "/" + src


def list_items(page_html):
    match = re.search(r'<div class="list">\s*<ul>(.*?)</ul>', page_html, re.S)
    if not match:
        return []
    items = []
    for aid, title, date in re.findall(
        r'href="/Content/(\d+)\.html"[^>]*>\s*(.*?)</a>\s*<span>\s*([\d-]+)\s*</span>',
        match.group(1),
        re.S,
    ):
        title = plain(title).lstrip("·").strip()
        if title:
            items.append((aid, title, date.strip()))
    return items


def parse_article(page, aid, title, date):
    body = clean_html(extract_div(page, "c_cc"))
    meta = plain(extract_div(page, "c_ctitle"))
    heading = plain(extract_div(page, "c_title")) or title
    found_date = re.search(r"(\d{4}-\d{2}-\d{2})", meta)
    source = re.search(r"信息来源[:：]\s*([^\s浏]+)", meta)
    views = re.search(r"浏览量[:：]\s*(\d+)", meta)
    summary = plain(body).replace("\n", "")
    if len(summary) > 90:
        summary = summary[:90] + "…"
    return {
        "id": aid,
        "title": heading,
        "date": found_date.group(1) if found_date else date,
        "source": source.group(1).strip() if source else "",
        "views": views.group(1) if views else "",
        "summary": summary,
        "html": body,
        "categories": [],
    }


def main():
    os.makedirs(IMG_DIR, exist_ok=True)
    home = get_text(BASE + "/")
    banners = []
    for src, alt in re.findall(r'<li class="swiper-slide">.*?<img src="([^"]+)" alt="([^"]*)"', home, re.S):
        banners.append({"image": abs_url(src), "title": html.unescape(alt).strip()})

    friend_links = []
    idx = home.find("友情链接")
    if idx >= 0:
        for href, name in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>([^<]+)</a>', home[idx:idx + 3000]):
            name = plain(name)
            if name and href.startswith("http"):
                friend_links.append({"name": name, "url": href})

    logo = ""
    css = get_text(BASE + "/css/main.css")
    logo_match = re.search(r"\.logo[^{]*\{[^}]*url\(([^)]+)\)", css, re.S)
    if logo_match:
        raw = logo_match.group(1).strip("'\" ")
        if raw.startswith("../"):
            logo = BASE + "/" + raw[3:]
        elif raw.startswith("/"):
            logo = BASE + raw
        elif raw.startswith("http"):
            logo = raw
        else:
            logo = BASE + "/css/" + raw

    # 每个栏目只取原站列表第 1 页（最近一批），并记下原站总页数
    by_id = {}
    order = []
    cat_meta = []
    for cid, tid, name, group in CATEGORIES:
        page = get_text(f"{BASE}/NewList/{tid}-1.html")
        last = re.search(rf"/NewList/{tid}-(\d+)\.html", page)
        items = list_items(page)
        cat_meta.append({
            "id": cid,
            "name": name,
            "group": group,
            "sourcePages": int(last.group(1)) if last else 1,
            "imported": len(items),
        })
        for aid, title, date in items:
            if aid not in by_id:
                by_id[aid] = {"title": title, "date": date, "categories": []}
                order.append(aid)
            if cid not in by_id[aid]["categories"]:
                by_id[aid]["categories"].append(cid)
        print(f"list {cid} {len(items)} total {len(order)}", flush=True)

    articles = []

    def fetch_one(aid):
        info = by_id[aid]
        page = get_text(f"{BASE}/Content/{aid}.html")
        if not page:
            item = {
                "id": aid,
                "title": info["title"],
                "date": info["date"],
                "source": "",
                "views": "",
                "summary": "",
                "html": "",
                "categories": info["categories"],
            }
            return item
        item = parse_article(page, aid, info["title"], info["date"])
        item["categories"] = info["categories"]
        return item

    done = 0
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(fetch_one, aid) for aid in order]
        for fut in as_completed(futures):
            articles.append(fut.result())
            done += 1
            if done % 10 == 0 or done == len(order):
                print(f"articles {done}/{len(order)}", flush=True)
    articles.sort(key=lambda item: item["date"], reverse=True)

    pages = []
    for slug, pid, title, group in PAGES:
        page = get_text(f"{BASE}/Content/{pid}.html")
        body = clean_html(extract_div(page, "c_cc")) if page else ""
        heading = plain(extract_div(page, "c_title")) if page else title
        pages.append({"slug": slug, "title": heading or title, "group": group, "html": body})
        print("page", slug, len(body), flush=True)

    about = next((p for p in pages if p["slug"] == "about"), None)
    contact = next((p for p in pages if p["slug"] == "contact"), None)
    about_text = plain(about["html"]) if about else ""
    contact_text = plain(contact["html"]) if contact else ""
    phone = "0551-65735810"
    phone_match = re.search(r"(0\d{2,3}-\d{7,8})", contact_text + about_text)
    if phone_match:
        phone = phone_match.group(1)
    address_match = re.search(r"(?:地址|通讯地址)[:：]\s*([^\n]+)", contact_text)
    email_match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", contact_text)

    image_urls = []
    if logo:
        image_urls.append(logo)
    for banner in banners:
        image_urls.append(banner["image"])
    img_re = re.compile(r'<img[^>]+src=["\']([^"\']+)["\']', re.I)
    for item in articles:
        image_urls.extend(abs_url(src) for src in img_re.findall(item["html"]))
    for page in pages:
        image_urls.extend(abs_url(src) for src in img_re.findall(page["html"]))

    unique_urls = []
    seen_url = set()
    for url in image_urls:
        if url and url not in seen_url:
            seen_url.add(url)
            unique_urls.append(url)

    local_map = {}

    def download(url):
        ext = os.path.splitext(url.split("?")[0])[1].lower()
        if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}:
            ext = ".jpg"
        name = hashlib.md5(url.encode()).hexdigest()[:16] + ext
        dest = os.path.join(IMG_DIR, name)
        if not os.path.exists(dest) or os.path.getsize(dest) < 64:
            raw = get(url)
            if not raw or len(raw) < 64:
                return url, ""
            with open(dest, "wb") as fh:
                fh.write(raw)
        return url, "assets/img/" + name

    with ThreadPoolExecutor(max_workers=4) as pool:
        for url, rel in pool.map(download, unique_urls):
            if rel:
                local_map[url] = rel
    print("images", len(local_map), "/", len(unique_urls), flush=True)

    def swap(fragment):
        def repl(match):
            src = abs_url(match.group(2))
            return match.group(1) + local_map.get(src, src) + match.group(3)

        return re.sub(r'(<img[^>]+src=["\'])([^"\']+)(["\'])', repl, fragment, flags=re.I)

    for item in articles:
        item["html"] = swap(item["html"])
    for page in pages:
        page["html"] = swap(page["html"])
    for banner in banners:
        banner["image"] = local_map.get(banner["image"], "")
    banners = [b for b in banners if b["image"]]

    data = {
        "meta": {
            "name": "安徽省烟花爆竹协会",
            "nameEn": "Anhui Fireworks Association",
            "phone": phone,
            "email": email_match.group(0) if email_match else "",
            "address": address_match.group(1).strip() if address_match else "",
            "founded": "2002年4月",
            "summary": about_text[:180] + ("…" if len(about_text) > 180 else ""),
            "logo": local_map.get(logo, ""),
        },
        "banners": banners,
        "friendLinks": friend_links,
        "categories": cat_meta,
        "pages": pages,
        "articles": articles,
    }
    out = os.path.join(ROOT, "data", "site.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    print("wrote", out, "bytes", os.path.getsize(out), flush=True)


if __name__ == "__main__":
    main()
