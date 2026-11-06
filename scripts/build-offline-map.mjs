// Start npm run dev first. Requires Playwright with Chromium and the cwebp CLI.
// Optional OFFLINE_MAP_PLAYWRIGHT points to a separately installed Playwright module.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const { chromium } = await import(process.env.OFFLINE_MAP_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader"] });
const temporary = await mkdtemp(join(tmpdir(), 'vortexa-map-'));
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => console.error(error.message));
  console.log("Loading shared map renderer…");
  await page.goto(`${process.env.OFFLINE_MAP_BASE_URL || 'http://localhost:3000'}/map3d/offline-reference`);
  console.log("Waiting for rendered frames…");
  const scene = page.locator('#offline-map-render[data-ready="true"]');
  await scene.waitFor({ timeout: 90000 });
  console.log("Map ready; preparing image…");
  await page.evaluate(() => document.fonts.ready);
  // Allow lazy post-processing and the app's opening logo to settle before capture.
  await page.waitForTimeout(5000);
  const screenshot = join(temporary, 'campus.png');
  await scene.screenshot({ path: screenshot, timeout: 30000 });
  execFileSync('cwebp', ['-quiet', '-q', '88', screenshot, '-o', fileURLToPath(new URL('../public/campus-reference.webp', import.meta.url))]);
  console.log('Saved public/campus-reference.webp from the shared online map camera and scene.');
} finally {
  await browser.close();
  await rm(temporary, { recursive: true, force: true });
}
