// Renders dist/mark.svg to a 512px PNG for profile pages.
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
const svg = readFileSync(new URL("../dist/mark.svg", import.meta.url), "utf8");
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 512, height: 512 });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", '<svg width="512" height="512" ')}</body></html>`);
await page.screenshot({ path: process.argv[2], omitBackground: true });
await browser.close();
