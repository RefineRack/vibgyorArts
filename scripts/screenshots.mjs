import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const PORT = 4177;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = process.env.SCREENSHOT_DIR || "/workspace/vibgyorarts/screenshots";

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Dev server did not start")), 120000);
    const onData = (chunk) => {
      const text = String(chunk);
      if (text.includes("Ready") || text.includes("started server") || text.includes(`localhost:${PORT}`)) {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
        resolve();
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Dev server exited with ${code}`));
    });
  });
}

async function shot(page, name, width, height, url) {
  await page.setViewportSize({ width, height });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  // Wait for either cards, the studio dock, or an empty state.
  await page.waitForTimeout(800);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`wrote ${file}`);
}

const server = spawn("npx", ["next", "dev", "--port", String(PORT), "--hostname", "127.0.0.1"], {
  cwd: path.resolve(import.meta.dirname, ".."),
  env: {
    ...process.env,
    NEXT_PUBLIC_DEMO_BOXES: "1",
    NEXT_PUBLIC_FIREBASE_API_KEY: "dummy",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "dummy.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "dummy",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:1:web:1",
    NEXT_TELEMETRY_DISABLED: "1",
    DISABLE_DEV_INDICATOR: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout?.on("data", (chunk) => process.stdout.write(chunk));
server.stderr?.on("data", (chunk) => process.stderr.write(chunk));

let browser;
try {
  await waitForServer(server);
  await mkdir(OUT, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.addInitScript(() => {
    const hide = () => document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
    new MutationObserver(hide).observe(document.documentElement, { childList: true, subtree: true });
  });

  await shot(page, "boxes-desktop-1280.png", 1280, 800, `${BASE}/boxes`);
  await shot(page, "boxes-mobile-390.png", 390, 844, `${BASE}/boxes`);
  await shot(page, "home-desktop-1280.png", 1280, 800, `${BASE}/`);
  await shot(page, "home-mobile-390.png", 390, 844, `${BASE}/`);
  await shot(page, "studio-desktop-1280.png", 1280, 800, `${BASE}/studio?saved=demo-box1`);
  await shot(page, "studio-mobile-390.png", 390, 844, `${BASE}/studio?saved=demo-box1`);
  await shot(page, "studio-gable-desktop-1280.png", 1280, 800, `${BASE}/studio?saved=demo-gable-1`);
  await shot(page, "studio-gable-mobile-390.png", 390, 844, `${BASE}/studio?saved=demo-gable-1`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  setTimeout(() => process.exit(0), 300);
}
