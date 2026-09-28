// Run by Electron (see live-poster.mjs): electron live-poster-capture.cjs <url> <out.png>
// Opens a slide in the real player and captures its live web element once the
// page behind it has loaded and settled.
const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');

const [url, out] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const flag of ['disable-background-timer-throttling', 'disable-renderer-backgrounding']) {
  app.commandLine.appendSwitch(flag);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1920, height: 1080, show: false, useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  win.webContents.setFrameRate(30);
  await win.loadURL(url);

  // Live once the frame has a src and the "Waiting for" note is gone.
  const liveRect = `(() => {
    const frame = [...document.querySelectorAll('iframe.web-frame')].find((f) => /^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(f.src));
    if (!frame || document.querySelector('.live-web-waiting')) return null;
    const r = frame.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  })()`;
  let rect = null;
  for (const end = Date.now() + 30000; !rect && Date.now() < end; await wait(500)) {
    rect = await win.webContents.executeJavaScript(liveRect);
  }
  if (!rect) {
    console.error('no live web element connected on this slide within 30 s (is its server running?)');
    app.exit(1);
    return;
  }
  await wait(4000); // let the scene stream in and draw
  writeFileSync(out, (await win.webContents.capturePage(rect)).toPNG());
  app.exit(0);
});
