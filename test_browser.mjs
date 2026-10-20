import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();

const consoleMessages = [];
page.on('console', (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
});

// Navigate to admin tracking page
console.log('Navigating to /admin/tracking...');
await page.goto('http://localhost/admin/tracking', {
    waitUntil: 'networkidle',
});

// Wait a bit for any delayed errors
await page.waitForTimeout(2000);

console.log('Current URL:', page.url());
console.log('Page title:', await page.title());

// Save screenshot
await page.screenshot({
    path: 'admin_tracking_screenshot.png',
    fullPage: true,
});
console.log('Screenshot saved: admin_tracking_screenshot.png');

// Check for page content
const bodyHTML = await page.content();
console.log('Has leaflet class:', bodyHTML.includes('leaflet-container'));
console.log('Has tracking heading:', bodyHTML.includes('Live Tracking'));
console.log('Has OSM tiles:', bodyHTML.includes('tile.openstreetmap.org'));

// Check console for errors
const errors = consoleMessages.filter((m) => m.type === 'error');
console.log('\nConsole errors (' + errors.length + '):');
errors.forEach((e) => console.log('  [' + e.type + ']', e.text));

// Check for specific elements
const h1 = await page.$('h1');
if (h1) {
    console.log('\nH1 text:', await h1.textContent());
}

const markers = await page.$$('.leaflet-marker-icon');
console.log('Markers found:', markers.length);

await browser.close();
console.log('\nDone.');
