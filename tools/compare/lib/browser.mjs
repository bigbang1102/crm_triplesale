// Headless Chrome (puppeteer-core; no browser download — uses the Chrome / Edge that is already installed).
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function findBrowser() {
  const p = CANDIDATES.find((c) => existsSync(c));
  if (!p) throw new Error('no Chrome / Edge found — set CHROME_PATH');
  return p;
}

export function launch() {
  return puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: [
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--font-render-hinting=none', '--force-color-profile=srgb', '--lang=th-TH',
      // scrollbars off by default: the Java replica scrolls the document, the Angular shell scrolls inside its own box
      // (a known environment difference); CMP_SCROLLBARS=1 keeps them
      ...(process.env.CMP_SCROLLBARS ? [] : ['--hide-scrollbars']),
    ],
  });
}
