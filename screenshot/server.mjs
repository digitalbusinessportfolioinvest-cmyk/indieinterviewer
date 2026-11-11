// Internal screenshot service: POST /shot {url} with header x-token -> PNG of the page's first screen.
import http from "node:http";
import { chromium } from "playwright";

const TOKEN = process.env.SCREENSHOT_TOKEN || "";
const PORT = Number(process.env.PORT || 8080);
let browserPromise = null;
const getBrowser = () => (browserPromise ??= chromium.launch({ args: ["--no-sandbox"] }));

async function shot(url) {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);
    return await page.screenshot({ type: "png" });
  } finally {
    await ctx.close();
  }
}

http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") { res.end("ok"); return; }
  if (req.method !== "POST" || req.url !== "/shot") { res.writeHead(404).end(); return; }
  if (!TOKEN || req.headers["x-token"] !== TOKEN) { res.writeHead(401).end(); return; }
  let body = "";
  for await (const chunk of req) body += chunk;
  let url;
  try {
    url = new URL(JSON.parse(body).url);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("bad protocol");
  } catch { res.writeHead(400).end("bad url"); return; }
  try {
    const png = await shot(url.toString());
    res.writeHead(200, { "content-type": "image/png" }).end(png);
  } catch (err) {
    console.error("[shot] failed", url.toString(), err?.message);
    browserPromise = null;
    res.writeHead(502).end(String(err?.message || err));
  }
}).listen(PORT, process.env.HOST || "::", () => console.log(`screenshot service on ${PORT}`));
