#!/usr/bin/env node

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoMobile = path.resolve(__dirname, '..');
const apkPath = process.env.APEX_SMOKE_APK
  || path.join(repoMobile, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const adb = process.env.ADB
  || (process.env.ANDROID_HOME
    ? path.join(process.env.ANDROID_HOME, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
    : 'adb');
const pkg = process.env.APEX_SMOKE_PACKAGE || 'com.cbros.apexpos';
const activity = process.env.APEX_SMOKE_ACTIVITY || `${pkg}/.MainActivity`;
const skipInstall = process.env.APEX_SMOKE_SKIP_INSTALL === '1';
const outputDir = process.env.APEX_SMOKE_SCREENSHOT_DIR
  || path.join(os.tmpdir(), 'apex-mobile-ui-smoke');
const enableSizePass = process.env.APEX_SMOKE_UI_SIZES === '1';

const VIEWPORTS = [
  { name: 'tablet-landscape', size: '1280x800' },
  { name: 'tablet-portrait', size: '800x1280' },
  { name: 'compact-width', size: '430x932' },
];

function runAdb(args, options = {}) {
  return execFileSync(adb, args, {
    encoding: options.encoding || 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });
}

function adbOk(args, options = {}) {
  const result = spawnSync(adb, args, {
    encoding: options.encoding === null ? null : 'utf8',
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function parseBounds(bounds) {
  const match = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return null;
  const [, x1, y1, x2, y2] = match.map(Number);
  return {
    x: Math.round((x1 + x2) / 2),
    y: Math.round((y1 + y2) / 2),
  };
}

function xmlEscapeForRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dumpUi() {
  adbOk(['shell', 'uiautomator', 'dump', '/sdcard/apex-ui-smoke.xml']);
  const result = adbOk(['exec-out', 'cat', '/sdcard/apex-ui-smoke.xml']);
  return result.stdout || '';
}

function findNodeCenterContains(xml, text) {
  const needle = xmlEscapeForRegex(text);
  const regex = new RegExp(`<node[^>]*(?:text|content-desc|resource-id)="[^"]*${needle}[^"]*"[^>]*bounds="([^"]+)"`, 'i');
  const match = xml.match(regex);
  return match ? parseBounds(match[1]) : null;
}

function tap(center) {
  if (!center) return false;
  runAdb(['shell', 'input', 'tap', String(center.x), String(center.y)]);
  sleep(600);
  return true;
}

function back() {
  runAdb(['shell', 'input', 'keyevent', '4']);
  sleep(700);
}

function screenshot(name) {
  fs.mkdirSync(outputDir, { recursive: true });
  const result = adbOk(['exec-out', 'screencap', '-p'], { encoding: null });
  if (!result.ok) throw new Error(`Screenshot failed: ${result.stderr}`);
  const target = path.join(outputDir, `${name}.png`);
  fs.writeFileSync(target, result.stdout);
  console.log(`[apex-ui-smoke] screenshot ${target}`);
}

function fatalLogCount() {
  const logs = adbOk([
    'logcat',
    '-d',
    '-t',
    '400',
    'AndroidRuntime:E',
    'ReactNativeJS:E',
    'DEBUG:E',
    '*:S',
  ]);
  const text = `${logs.stdout}\n${logs.stderr}`;
  return text
    .split(/\r?\n/)
    .filter(line => (
      /FATAL EXCEPTION/i.test(line)
      || /Process:\s+com\.cbros\.apexpos/i.test(line)
      || /ReactNativeJS.*(TypeError|ReferenceError|Invariant Violation)/i.test(line)
    ))
    .length;
}

function tapFirst(xml, labels) {
  for (const label of labels) {
    const center = findNodeCenterContains(xml, label);
    if (center && tap(center)) return true;
  }
  return false;
}

function captureIfReachable(prefix, xml, labels, screenshotName) {
  if (!tapFirst(xml, labels)) {
    console.log(`[apex-ui-smoke] skip ${screenshotName}: target not visible`);
    return false;
  }
  sleep(900);
  screenshot(`${prefix}-${screenshotName}`);
  back();
  return true;
}

function navigateAndCapture(prefix) {
  let xml = dumpUi();
  screenshot(`${prefix}-pos`);

  captureIfReachable(prefix, xml, ['Cart'], 'cart');
  xml = dumpUi();
  captureIfReachable(prefix, xml, ['Payment', 'Pay'], 'payment');
  xml = dumpUi();

  const more = findNodeCenterContains(xml, 'More') || findNodeCenterContains(xml, 'tab-more');
  if (more && tap(more)) {
    xml = dumpUi();
    screenshot(`${prefix}-more`);

    const moreScreens = [
      { name: 'recovery', labels: ['Sync', 'Recovery & Diagnostics', 'SyncManagement'] },
      { name: 'manager-audit', labels: ['Manager Audit'] },
      { name: 'returns', labels: ['Returns'] },
      { name: 'barcode-print', labels: ['Barcode Print'] },
      { name: 'z-reading', labels: ['Shift History', 'Z-reading'] },
      { name: 'settings', labels: ['Settings'] },
    ];

    for (const screen of moreScreens) {
      xml = dumpUi();
      captureIfReachable(prefix, xml, screen.labels, screen.name);
      xml = dumpUi();
      if (!findNodeCenterContains(xml, 'More')) {
        const moreAgain = findNodeCenterContains(xml, 'More') || findNodeCenterContains(xml, 'tab-more');
        if (moreAgain) tap(moreAgain);
      }
    }
  }
}

function main() {
  console.log('[apex-ui-smoke] Checking device');
  runAdb(['devices']);

  if (!skipInstall) {
    if (!fs.existsSync(apkPath)) {
      throw new Error(`APK not found: ${apkPath}. Run assembleDebug first or set APEX_SMOKE_APK.`);
    }
    console.log(`[apex-ui-smoke] Installing ${apkPath}`);
    runAdb(['install', '-r', apkPath], { stdio: 'inherit' });
  }

  adbOk(['logcat', '-c']);
  runAdb(['shell', 'am', 'force-stop', pkg]);
  runAdb(['shell', 'am', 'start', '-n', activity]);
  sleep(2500);

  if (!enableSizePass) {
    navigateAndCapture('current-size');
  } else {
    try {
      for (const viewport of VIEWPORTS) {
        runAdb(['shell', 'wm', 'size', viewport.size]);
        runAdb(['shell', 'wm', 'density', viewport.name === 'compact-width' ? '420' : '240']);
        runAdb(['shell', 'am', 'force-stop', pkg]);
        runAdb(['shell', 'am', 'start', '-n', activity]);
        sleep(2200);
        navigateAndCapture(viewport.name);
      }
    } finally {
      adbOk(['shell', 'wm', 'size', 'reset']);
      adbOk(['shell', 'wm', 'density', 'reset']);
    }
  }

  const fatalCount = fatalLogCount();
  if (fatalCount > 0) {
    throw new Error(`Recent logcat contains ${fatalCount} fatal/crash markers.`);
  }

  console.log('[apex-ui-smoke] PASS: screenshots captured without recent fatal logs');
}

try {
  main();
} catch (err) {
  console.error(`[apex-ui-smoke] FAIL: ${err.message}`);
  process.exit(1);
}
