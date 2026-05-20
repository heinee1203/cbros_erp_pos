#!/usr/bin/env node

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
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
const email = process.env.APEX_SMOKE_EMAIL;
const password = process.env.APEX_SMOKE_PASSWORD;
const storeCode = process.env.APEX_SMOKE_STORE_CODE;
const requireAuth = process.env.APEX_SMOKE_REQUIRE_AUTH === '1';
const skipInstall = process.env.APEX_SMOKE_SKIP_INSTALL === '1';

function runAdb(args, options = {}) {
  return execFileSync(adb, args, {
    encoding: options.encoding || 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });
}

function adbOk(args) {
  const result = spawnSync(adb, args, { encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function xmlEscapeForRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function dumpUi() {
  adbOk(['shell', 'uiautomator', 'dump', '/sdcard/apex-smoke.xml']);
  const result = adbOk(['exec-out', 'cat', '/sdcard/apex-smoke.xml']);
  return result.stdout || '';
}

function findNodeCenter(xml, text) {
  const needle = xmlEscapeForRegex(text);
  const regex = new RegExp(`<node[^>]*(?:text|content-desc|resource-id)="${needle}"[^>]*bounds="([^"]+)"`, 'i');
  const match = xml.match(regex);
  return match ? parseBounds(match[1]) : null;
}

function findNodeCenterContains(xml, text) {
  const needle = xmlEscapeForRegex(text);
  const regex = new RegExp(`<node[^>]*(?:text|content-desc|resource-id)="[^"]*${needle}[^"]*"[^>]*bounds="([^"]+)"`, 'i');
  const match = xml.match(regex);
  return match ? parseBounds(match[1]) : null;
}

function waitForUi(pattern, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let xml = dumpUi();
  while (Date.now() < deadline) {
    if (pattern.test(xml)) return xml;
    sleep(500);
    xml = dumpUi();
  }
  return xml;
}

function findEditTextCenters(xml) {
  const centers = [];
  const regex = /<node[^>]*class="android\.widget\.EditText"[^>]*bounds="([^"]+)"/gi;
  let match;
  while ((match = regex.exec(xml))) {
    const center = parseBounds(match[1]);
    if (center) centers.push(center);
  }
  return centers;
}

function tap(center) {
  if (!center) return false;
  runAdb(['shell', 'input', 'tap', String(center.x), String(center.y)]);
  sleep(300);
  return true;
}

function inputText(value) {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/ /g, '%s')
    .replace(/&/g, '\\&')
    .replace(/</g, '\\<')
    .replace(/>/g, '\\>')
    .replace(/;/g, '\\;')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
  runAdb(['shell', 'input', 'text', escaped]);
  sleep(250);
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

function main() {
  console.log('[apex-smoke] Checking device');
  runAdb(['devices']);

  if (!skipInstall) {
    if (!fs.existsSync(apkPath)) {
      throw new Error(`APK not found: ${apkPath}. Run assembleDebug first or set APEX_SMOKE_APK.`);
    }
    console.log(`[apex-smoke] Installing ${apkPath}`);
    runAdb(['install', '-r', apkPath], { stdio: 'inherit' });
  }

  adbOk(['logcat', '-c']);
  runAdb(['shell', 'am', 'force-stop', pkg]);
  console.log(`[apex-smoke] Launching ${activity}`);
  runAdb(['shell', 'am', 'start', '-n', activity]);
  sleep(2500);

  let xml = dumpUi();
  const hasCredentials = Boolean(email && password);
  if (!hasCredentials) {
    if (requireAuth) {
      throw new Error('APEX_SMOKE_REQUIRE_AUTH=1 requires APEX_SMOKE_EMAIL and APEX_SMOKE_PASSWORD.');
    }
    console.log('[apex-smoke] APEX_SMOKE_EMAIL/APEX_SMOKE_PASSWORD not set; authenticated steps skipped.');
    console.log('[apex-smoke] Manual checklist: sign in, confirm locked-store POS, open More > Recovery & Diagnostics.');
  } else if (/Sign In|Email|Password/i.test(xml)) {
    const fields = findEditTextCenters(xml);
    if (fields.length < 2) {
      throw new Error('Login screen found, but email/password fields were not discoverable.');
    }
    console.log('[apex-smoke] Entering credentials from environment');
    tap(fields[0]);
    inputText(email);
    tap(fields[1]);
    inputText(password);
    xml = dumpUi();
    const signIn = findNodeCenter(xml, 'Sign In') || findNodeCenterContains(xml, 'login-submit');
    if (!tap(signIn)) {
      runAdb(['shell', 'input', 'keyevent', '66']);
    }
    xml = waitForUi(/Register This Device|Store registration|POS|Catalog|Cart|More|Device Locked To Store/i, 9000);
  } else {
    console.log('[apex-smoke] Login screen not visible; assuming an existing authenticated session.');
  }

  xml = dumpUi();
  if (/Register This Device|Store registration/i.test(xml)) {
    if (!storeCode) {
      if (requireAuth) {
        throw new Error('Unbound device reached store registration. Set APEX_SMOKE_STORE_CODE so smoke can bind the expected store.');
      }
      console.log('[apex-smoke] Store registration visible; no APEX_SMOKE_STORE_CODE set, leaving manual binding to operator.');
    } else {
      const store = findNodeCenterContains(xml, storeCode);
      if (!tap(store)) {
        throw new Error(`Store registration visible, but store code ${storeCode} was not found.`);
      }
      console.log(`[apex-smoke] Bound smoke device to configured store ${storeCode}`);
      xml = waitForUi(/POS|Catalog|Cart|More|Syncing|Device Locked To Store/i, 15000);
    }
  }

  if (/Device Locked To Store/i.test(xml)) {
    throw new Error('Device locked support screen is visible. ERP/admin registration must be fixed before authenticated smoke can continue.');
  }

  if (requireAuth && !/POS|Catalog|Cart|More|pos-catalog-screen/i.test(xml)) {
    throw new Error('Authenticated smoke did not reach the locked-store POS screen.');
  }

  const more = findNodeCenter(xml, 'More')
    || findNodeCenter(xml, 'More tab')
    || findNodeCenterContains(xml, 'tab-more')
    || findNodeCenterContains(xml, 'More');
  if (more) {
    console.log('[apex-smoke] Opening More');
    tap(more);
    sleep(1000);
    xml = dumpUi();
    const sync = findNodeCenter(xml, 'Sync')
      || findNodeCenterContains(xml, 'more-menu-SyncManagement')
      || findNodeCenterContains(xml, 'Recovery');
    if (sync) {
      console.log('[apex-smoke] Opening Recovery & Diagnostics');
      tap(sync);
      xml = waitForUi(/Recovery & Diagnostics|Hardware Readiness|Hardware Test/i, 5000);
    }
  }

  if (/Recovery & Diagnostics|Hardware Readiness/i.test(xml)) {
    console.log('[apex-smoke] Recovery & Diagnostics visible');
  } else if (requireAuth) {
    throw new Error('Authenticated smoke could not confirm Recovery & Diagnostics.');
  } else {
    console.log('[apex-smoke] Diagnostics screen not confirmed by UI dump; review emulator manually.');
  }

  const fatalCount = fatalLogCount();
  if (fatalCount > 0) {
    throw new Error(`Recent logcat contains ${fatalCount} fatal/crash markers.`);
  }

  console.log('[apex-smoke] PASS: launch completed without recent fatal logs');
}

try {
  main();
} catch (err) {
  console.error(`[apex-smoke] FAIL: ${err.message}`);
  process.exit(1);
}
