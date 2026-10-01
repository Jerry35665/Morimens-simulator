/* =========================================================
 * 忘却前夜模拟器 · 本地服务（静态 + AI 对话代理）
 * ---------------------------------------------------------
 * 用法：双击 start.bat（或 node server.js）→ 自动打开浏览器
 * 配置：复制 config.example.json 为 config.json，填入你的
 *       OpenAI 兼容 API（智谱 GLM / 任意兼容端点）。
 *       Key 只留在本机，绝不下发给页面。
 * 安全：仅监听 127.0.0.1，不暴露局域网。
 * ========================================================= */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname);
const PORT = 8768;
const CONFIG_PATH = path.join(ROOT, "config.json");

/* ---------- 配置 ---------- */
function loadConfig() {
  const example = {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",   // 智谱开放平台（OpenAI 兼容）；可换任意兼容端点
    apiKey: "",                                        // 你的 API Key（留空则前端走"复制快照"降级模式）
    model: "glm-4.7"                                   // 可改成端点支持的任意模型
  };
  try {
    const user = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return Object.assign(example, user);
  } catch (e) {
    return example;   // 无 config.json：用示例（Key 为空 → 前端降级为复制快照模式）
  }
}

/* ---------- 静态文件（白名单校验，防路径穿越） ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webm": "video/webm"
};

function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.resolve(ROOT, "." + path.posix.normalize("/" + p));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
  if (!MIME[path.extname(file)]) { res.writeHead(403); res.end("forbidden type"); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)], "Cache-Control": "no-store" });
    res.end(data);
  });
}

/* ---------- /api/chat：OpenAI 兼容转发（SSE 透传） ---------- */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleChat(req, res) {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "no-key", message: "未配置 API Key：请复制 config.example.json 为 config.json 并填入 apiKey（或继续使用复制快照模式）" }));
    return;
  }
  let payload;
  try { payload = JSON.parse(await readBody(req)); }
  catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: "bad-json" })); return; }

  const upstreamBody = JSON.stringify({
    model: cfg.model,
    messages: payload.messages,
    stream: true,
    temperature: payload.temperature != null ? payload.temperature : 0.6
  });

  try {
    const upstream = await fetch(cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.apiKey },
      body: upstreamBody
    });
    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => "");
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "upstream-" + upstream.status, message: errText.slice(0, 400) }));
      return;
    }
    /* SSE 透传：边收边发 */
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "Connection": "keep-alive"
    });
    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(dec.decode(value, { stream: true }));
      }
    } catch (e) { /* 客户端断开 */ }
    res.end();
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "network", message: String(e && e.message || e) }));
  }
}

/* ---------- 入口 ---------- */
http.createServer((req, res) => {
  if (req.method === "POST" && req.url.split("?")[0] === "/api/chat") return handleChat(req, res);
  return serveStatic(req, res);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`忘却前夜模拟器已启动: http://127.0.0.1:${PORT}`);
});
