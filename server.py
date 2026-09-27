# 本地站点服务：静态页面 + 管理后台保存接口。GitHub Pages 没有这个接口时，后台改动只留在浏览器里。
import json
import os
import secrets
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data", "site.json")
USER = "admin"
PASSWORD = "ahyh2026"
TOKENS = set()
BLOCKED = {"config.txt", "server.py", "scrape.py"}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        name = os.path.basename(path)
        if name.lower() in BLOCKED or path.startswith("/."):
            self.send_error(404)
            return
        if path == "/api/health":
            self._json(200, {"ok": True})
            return
        if path == "/api/site":
            self._send_site()
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._json(400, {"error": "数据格式不正确"})
            return
        if path == "/api/login":
            if body.get("username") == USER and body.get("password") == PASSWORD:
                token = secrets.token_hex(16)
                TOKENS.add(token)
                self._json(200, {"token": token})
            else:
                self._json(401, {"error": "账号或密码错误"})
            return
        if path == "/api/site":
            token = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
            if token not in TOKENS:
                self._json(401, {"error": "请先登录"})
                return
            if not isinstance(body, dict) or "articles" not in body or "pages" not in body:
                self._json(400, {"error": "缺少文章或单页数据"})
                return
            with open(DATA, "w", encoding="utf-8") as fh:
                json.dump(body, fh, ensure_ascii=False, indent=2)
            self._json(200, {"ok": True})
            return
        self._json(404, {"error": "not found"})

    def _send_site(self):
        if not os.path.exists(DATA):
            self._json(404, {"error": "还没有站点数据"})
            return
        with open(DATA, "r", encoding="utf-8") as fh:
            raw = fh.read()
        payload = raw.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _json(self, code, obj):
        payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"serving http://127.0.0.1:{port}")
    server.serve_forever()
