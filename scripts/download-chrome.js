'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const extract = require('extract-zip');

const CHROME_VERSION = '146.0.7680.31';
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'chromium');
const VERSION_FILE = path.join(OUTPUT_DIR, 'version.txt');

function getPlatform() {
  if (process.platform === 'win32') return 'win64';
  if (process.platform === 'linux') return 'linux64';
  throw new Error(`Unsupported platform: ${process.platform}`);
}

function getDownloadUrl(platform) {
  const dir = platform === 'win64' ? 'chrome-win64' : 'chrome-linux64';
  return `https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/${platform}/${dir}.zip`;
}

function getChromeDir(platform) {
  return platform === 'win64' ? 'chrome-win64' : 'chrome-linux64';
}

function getChromeExeName(platform) {
  return platform === 'win64' ? 'chrome.exe' : 'chrome';
}

function alreadyDownloaded(platform) {
  try {
    const expected = path.join(OUTPUT_DIR, getChromeDir(platform), getChromeExeName(platform));
    if (!fs.existsSync(expected)) return false;
    if (fs.existsSync(VERSION_FILE) && fs.readFileSync(VERSION_FILE, 'utf-8').trim() === CHROME_VERSION) return true;
    return false;
  } catch {
    return false;
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, response => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve());
      });
    }).on('error', err => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function extractZip(zipPath, outputDir) {
  console.log(`Extracting to ${outputDir}...`);
  try {
    await extract(zipPath, { dir: outputDir });
  } catch (err) {
    throw new Error(`Extraction failed: ${err.message}`);
  }
}

async function main() {
  const platform = getPlatform();
  const chromeDir = getChromeDir(platform);
  const chromeExeName = getChromeExeName(platform);
  const chromePath = path.join(OUTPUT_DIR, chromeDir, chromeExeName);

  if (alreadyDownloaded(platform)) {
    console.log(`Chrome for Testing ${CHROME_VERSION} already downloaded. Skipping.`);
    console.log(`  ${chromePath}`);
    return;
  }

  const downloadUrl = getDownloadUrl(platform);
  const zipPath = path.join(require('os').tmpdir(), `chrome-${platform}-${CHROME_VERSION}.zip`);

  console.log(`Platform: ${platform}`);
  console.log(`Downloading Chrome for Testing ${CHROME_VERSION}...`);
  console.log(`  URL: ${downloadUrl}`);

  // Clean old output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Download
  try {
    await downloadFile(downloadUrl, zipPath);
    console.log('Downloaded successfully.');
  } catch (err) {
    console.error(`ERROR: Failed to download: ${err.message}`);
    process.exit(1);
  }

  // Extract
  try {
    await extractZip(zipPath, OUTPUT_DIR);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }

  // Clean up zip
  try { fs.unlinkSync(zipPath); } catch {}

  // Write version file
  fs.writeFileSync(VERSION_FILE, CHROME_VERSION, 'utf-8');

  // Verify
  if (fs.existsSync(chromePath)) {
    console.log(`SUCCESS: Chrome ready at ${chromePath}`);
  } else {
    console.error(`ERROR: chrome not found at ${chromePath}`);
    process.exit(1);
  }
}

main();