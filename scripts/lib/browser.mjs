import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

/**
 * Launch headless Chromium with software WebGL (SwiftShader) so it works on GitHub-hosted runners
 * that have no GPU. Set CHROME_PATH to use a specific Chrome/Chromium binary instead of the bundled one.
 */
export async function launchBrowser() {
  let executablePath = process.env.CHROME_PATH;
  let baseArgs = [];
  if (!executablePath || !fs.existsSync(executablePath)) {
    const { default: chromium } = await import('@sparticuz/chromium');
    executablePath = await chromium.executablePath();
    baseArgs = chromium.args.filter((a) => !a.includes('single-process') && !a.includes('no-zygote'));
  }
  return puppeteer.launch({
    executablePath,
    headless: 'shell',
    protocolTimeout: 600000,
    args: [
      ...baseArgs,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
    ],
  });
}
