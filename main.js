const {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  shell,
  Tray,
  Menu,
  globalShortcut,
  dialog,
  nativeImage,
  clipboard,
  desktopCapturer
} = require('electron');
const { exec, execFile } = require('child_process');
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function psSingleQuote(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

let mainWindow;
let tray = null;
let isAlwaysOnTop = true;
let isOverlayVisible = true;

// Optimasi Ringan untuk Laptop (Hemat RAM & GPU V8)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

// Kunci Single-Instance agar tidak bertumpuk jika ikon .exe diklik 2x
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock && !process.argv.includes('--force-admin')) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      isOverlayVisible = true;
      mainWindow.show();
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.focus();
      mainWindow.webContents.send('shortcut-trigger', 'toggle-start');
    }
  });
}

// =========================================================
// 1. STATISTIK CPU & RAM REAL-TIME (CACHED & HEMAT BATERAI)
// =========================================================
let prevCpuInfo = os.cpus();
const staticCpuModel = prevCpuInfo[0]?.model || 'x64 Processor';
const staticCpuCores = prevCpuInfo.length;
const staticCpuGhz = ((prevCpuInfo[0]?.speed || 3200) / 1000).toFixed(2);
const staticHostname = os.userInfo().username || 'User';
const staticPlatform = `${os.type()} ${os.release()}`;
const totalMemBytes = os.totalmem();
const totalMemGb = (totalMemBytes / 1024 ** 3).toFixed(0);
const hasDriveD = fs.existsSync('D:\\');

let cachedDiskC = null;
let cachedDiskD = null;
let lastDiskCheck = 0;

function getCpuUsagePercent() {
  const currentCpus = os.cpus();
  let idleDiff = 0;
  let totalDiff = 0;

  for (let i = 0; i < currentCpus.length; i++) {
    const prev = prevCpuInfo[i].times;
    const curr = currentCpus[i].times;
    const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
    const currTotal = curr.user + curr.nice + curr.sys + curr.idle + curr.irq;

    idleDiff += curr.idle - prev.idle;
    totalDiff += currTotal - prevTotal;
  }

  prevCpuInfo = currentCpus;
  if (totalDiff === 0) return 0;
  return Math.max(2, Math.min(100, Math.round(100 - (idleDiff / totalDiff) * 100)));
}

function getDiskStats(driveLetter = 'C:\\') {
  try {
    if (typeof fs.statfsSync === 'function') {
      const st = fs.statfsSync(driveLetter);
      const total = st.blocks * st.bsize;
      const free = st.bfree * st.bsize;
      const used = total - free;
      const pct = total > 0 ? Math.round((used / total) * 100) : 0;
      return {
        usedGb: (used / 1024 ** 3).toFixed(0),
        totalGb: (total / 1024 ** 3).toFixed(0),
        freeGb: (free / 1024 ** 3).toFixed(0),
        percent: pct
      };
    }
  } catch (e) {
    // Fallback
  }
  return { usedGb: '128', totalGb: '256', freeGb: '128', percent: 50 };
}

function getSystemStats() {
  const freeMem = os.freemem();
  const usedMem = totalMemBytes - freeMem;
  const ramPercent = Math.round((usedMem / totalMemBytes) * 100);
  const cpuPercent = getCpuUsagePercent();
  const uptimeSeconds = os.uptime();
  const hours = Math.floor(uptimeSeconds / 3600);
  const mins = Math.floor((uptimeSeconds % 3600) / 60);

  // Cache pembacaan Disk selama 30 detik agar bebas I/O di laptop
  const now = Date.now();
  if (!cachedDiskC || now - lastDiskCheck > 30000) {
    cachedDiskC = getDiskStats('C:\\');
    cachedDiskD = hasDriveD ? getDiskStats('D:\\') : null;
    lastDiskCheck = now;
  }

  return {
    cpu: cpuPercent,
    ram: ramPercent,
    usedGb: (usedMem / 1024 ** 3).toFixed(1),
    totalGb: totalMemGb,
    uptime: `${hours}j ${mins}m`,
    hostname: staticHostname,
    platform: staticPlatform,
    cpuModel: staticCpuModel,
    cores: staticCpuCores,
    cpuGhz: staticCpuGhz,
    diskC: cachedDiskC,
    diskD: cachedDiskD,
    workspacePath: __dirname
  };
}

// =========================================================
// 2. WINDOW UTAMA & SYSTEM TRAY ICON
// =========================================================
function createTrayIcon() {
  const icoPath = path.join(__dirname, 'winmac.ico');
  let image = fs.existsSync(icoPath) ? nativeImage.createFromPath(icoPath) : null;

  if (!image || image.isEmpty()) {
    // Fallback ikon 16x16 PNG DataURL jika file .ico tidak tersedia
    const iconDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGklEQVR4nGOw2PvjPyWYYdSAUQNGDRguBgAAdQLsH+JiNZYAAAAASUVORK5CYII=';
    image = nativeImage.createFromDataURL(iconDataUrl);
  }

  tray = new Tray(image);
  tray.setToolTip('WinMac Desktop OS (Alt+Space: Start Menu | Alt+E: Explorer)');

  updateTrayMenu();

  tray.on('click', () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('shortcut-trigger', 'toggle-start');
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isOverlayVisible ? '👁️ Sembunyikan Overlay' : '👁️ Tampilkan Overlay',
      click: () => {
        if (!mainWindow) return;
        isOverlayVisible = !isOverlayVisible;
        if (isOverlayVisible) {
          mainWindow.show();
        } else {
          mainWindow.hide();
        }
        updateTrayMenu();
      }
    },
    {
      label: '🚀 Buka Start Menu (Alt+Space)',
      click: () => mainWindow?.webContents.send('shortcut-trigger', 'toggle-start')
    },
    {
      label: '🪟 Aplikasi Sedang Terbuka / Switcher (Alt+W)',
      click: () => mainWindow?.webContents.send('shortcut-trigger', 'toggle-task-switcher')
    },
    {
      label: '🖥️ Tampilkan Desktop / Mode Layar Aplikasi (Alt+D)',
      click: () => mainWindow?.webContents.send('shortcut-trigger', 'toggle-desktop-mode')
    },
    {
      label: '📁 Buka Custom Explorer (Alt+E)',
      click: () => mainWindow?.webContents.send('shortcut-trigger', 'toggle-explorer')
    },
    {
      label: '📝 Buka Sticky Notes & To-Do',
      click: () => mainWindow?.webContents.send('shortcut-trigger', 'toggle-notes')
    },
    { type: 'separator' },
    {
      label: '🎨 Tampilkan / Sembunyikan Rainmeter Skins',
      click: () => mainWindow?.webContents.send('shortcut-trigger', 'toggle-rainmeter-all')
    },
    {
      label: '🔒 Kunci / Buka Kunci Posisi Skin (Click-Through)',
      click: () => mainWindow?.webContents.send('shortcut-trigger', 'toggle-rainmeter-lock')
    },
    { type: 'separator' },
    {
      label: '📌 Always On Top (Tutup Taskbar Bawah)',
      type: 'checkbox',
      checked: isAlwaysOnTop,
      click: (menuItem) => {
        isAlwaysOnTop = menuItem.checked;
        if (isAlwaysOnTop) {
          mainWindow?.setAlwaysOnTop(true, 'screen-saver');
          ensureFullScreenBounds();
        } else {
          mainWindow?.setAlwaysOnTop(false);
        }
        mainWindow?.webContents.send('sync-always-on-top', isAlwaysOnTop);
      }
    },
    {
      label: '🔄 Reset Posisi Semua Bar & Jendela',
      click: () => mainWindow?.webContents.send('shortcut-trigger', 'reset-positions')
    },
    { type: 'separator' },
    {
      label: '📌 Pasang Shortcut Desktop & Auto-Start PC',
      click: () => configureDesktopAppAndStartup(true)
    },
    {
      label: '🛡️ Jalankan Ulang sebagai Administrator (Run as Admin)',
      click: () => restartAsAdministrator()
    },
    { type: 'separator' },
    {
      label: '❌ Keluar (Quit WinMac OS)',
      click: () => app.quit()
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function ensureFullScreenBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.bounds;

  if (isAlwaysOnTop) {
    // Level 'screen-saver' memastikan overlay menutup 100% layar penuh termasuk Taskbar bawah Windows
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }
  mainWindow.setResizable(true);
  mainWindow.setMinimumSize(width, height);
  mainWindow.setBounds({ x, y, width, height });
  mainWindow.setResizable(false);
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.bounds;

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    enableLargerThanScreen: true,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  ensureFullScreenBounds();

  mainWindow.loadFile('index.html');
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.webContents.on('did-finish-load', () => {
    ensureFullScreenBounds();
  });

  screen.on('display-metrics-changed', () => {
    ensureFullScreenBounds();
  });
}

// =========================================================
// 3. IPC HANDLERS: WINDOW, AUDIO, BRIGHTNESS, AUTOSTART & DIALOG
// =========================================================
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setIgnoreMouseEvents(ignore, options || {});
});

ipcMain.on('focus-overlay-window', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.focus();
  if (isAlwaysOnTop) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }
});

ipcMain.on('set-always-on-top', (event, flag) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isAlwaysOnTop = Boolean(flag);
  if (isAlwaysOnTop) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    ensureFullScreenBounds();
  } else {
    mainWindow.setAlwaysOnTop(false);
  }
  updateTrayMenu();
});

function configureDesktopAppAndStartup(enableStartup = true) {
  const launcherExe = path.join(__dirname, 'WinMac Desktop OS.exe');
  const icoPath = path.join(__dirname, 'winmac.ico');
  const targetExe = fs.existsSync(launcherExe) ? launcherExe : process.execPath;

  const psLauncherExe = psSingleQuote(launcherExe);
  const psWorkDir = psSingleQuote(__dirname);
  const psIcoPath = psSingleQuote(icoPath);
  const psTargetExe = psSingleQuote(targetExe);

  const psSetup = `
$wsh = New-Object -ComObject WScript.Shell
$desktopDir = [Environment]::GetFolderPath('Desktop')
$startupDir = [Environment]::GetFolderPath('Startup')
$launcherExe = ${psLauncherExe}
$workDir = ${psWorkDir}
$icoPath = ${psIcoPath}
$targetExe = ${psTargetExe}

# Bersihkan shortcut duplikat lama jika ada
Remove-Item (Join-Path $desktopDir "WinMac Desktop OS (Admin).lnk") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $desktopDir "WinMac Desktop OS (Run as Admin).lnk") -Force -ErrorAction SilentlyContinue

# 1. Buat 1 Shortcut Utama di Desktop
if (Test-Path $launcherExe) {
  $s1 = $wsh.CreateShortcut((Join-Path $desktopDir "WinMac Desktop OS.lnk"))
  $s1.TargetPath = $launcherExe
  $s1.WorkingDirectory = $workDir
  $s1.Description = "WinMac Desktop OS Suite Pro"
  if (Test-Path $icoPath) { $s1.IconLocation = $icoPath }
  $s1.Save()
}

# 2. Atur Auto-Start Saat PC Restart / Login Windows (Registry Run & Startup Folder)
$regPath = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
$startupLnk = Join-Path $startupDir "WinMac Desktop OS.lnk"

if ($${enableStartup ? 'true' : 'false'}) {
  Set-ItemProperty -Path $regPath -Name "WinMacDesktopOS" -Value ('"' + $targetExe + '"') -ErrorAction SilentlyContinue
  if (Test-Path $launcherExe) {
    $s3 = $wsh.CreateShortcut($startupLnk)
    $s3.TargetPath = $launcherExe
    $s3.WorkingDirectory = $workDir
    if (Test-Path $icoPath) { $s3.IconLocation = $icoPath }
    $s3.Save()
  }
} else {
  Remove-ItemProperty -Path $regPath -Name "WinMacDesktopOS" -ErrorAction SilentlyContinue
  if (Test-Path $startupLnk) { Remove-Item $startupLnk -Force -ErrorAction SilentlyContinue }
}
`;

  execFile(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psSetup],
    { windowsHide: true },
    () => {}
  );
}

function restartAsAdministrator() {
  const launcherExe = path.join(__dirname, 'WinMac Desktop OS.exe');
  const target = fs.existsSync(launcherExe) ? launcherExe : process.execPath;

  const psAdmin = `Start-Process -FilePath ${psSingleQuote(target)} -WorkingDirectory ${psSingleQuote(__dirname)} -Verb RunAs`;
  execFile(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psAdmin],
    { windowsHide: true },
    (err) => {
      if (!err) {
        setTimeout(() => app.quit(), 300);
      }
    }
  );
}

ipcMain.on('set-autostart', (event, flag) => {
  configureDesktopAppAndStartup(Boolean(flag));
});

ipcMain.handle('install-desktop-shortcuts', () => {
  configureDesktopAppAndStartup(true);
  return true;
});

ipcMain.on('restart-as-admin', () => {
  restartAsAdministrator();
});

ipcMain.on('quit-to-windows', (event, disableStartup) => {
  if (disableStartup) {
    configureDesktopAppAndStartup(false);
    setTimeout(() => app.quit(), 400);
  } else {
    app.quit();
  }
});

ipcMain.handle('get-sys-stats', () => {
  return getSystemStats();
});

let cachedPingInfo = { ms: null, ok: false, checkedAt: 0 };
ipcMain.handle('get-ping-latency', () => {
  const now = Date.now();
  if (now - cachedPingInfo.checkedAt < 12000 && cachedPingInfo.checkedAt > 0) {
    return Promise.resolve({ ms: cachedPingInfo.ms, ok: cachedPingInfo.ok });
  }
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.createConnection({ host: '1.1.1.1', port: 443 });
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      const ms = ok ? Math.max(1, Date.now() - start) : null;
      cachedPingInfo = { ms, ok, checkedAt: Date.now() };
      socket.destroy();
      resolve({ ms, ok });
    };
    socket.setTimeout(1500);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
});

// Kontrol Volume Sistem Windows Nyata via PowerShell WScript.Shell Audio Keys
let volumeTimeout = null;
let lastKnownVolume = 68;
ipcMain.on('set-system-volume', (event, level) => {
  clearTimeout(volumeTimeout);
  volumeTimeout = setTimeout(() => {
    const vol = Math.max(0, Math.min(100, Number(level)));
    const diff = vol - lastKnownVolume;
    lastKnownVolume = vol;

    if (vol === 0) {
      exec(
        'powershell -NoProfile -WindowStyle Hidden -Command "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]173)"',
        { windowsHide: true }
      );
      return;
    }

    const steps = Math.min(15, Math.max(1, Math.round(Math.abs(diff) / 4)));
    const keyChar = diff > 0 ? 175 : 174; // 175 = VolUp, 174 = VolDown
    if (Math.abs(diff) >= 2) {
      exec(
        `powershell -NoProfile -WindowStyle Hidden -Command "$wsh = New-Object -ComObject WScript.Shell; 1..${steps} | ForEach-Object { $wsh.SendKeys([char]${keyChar}) }"`,
        { windowsHide: true }
      );
    }
  }, 160);
});

// Kontrol Kecerahan Layar Laptop (CIM/WMI) + Fallback Layar Desktop
let brightTimeout = null;
ipcMain.on('set-system-brightness', (event, level) => {
  clearTimeout(brightTimeout);
  brightTimeout = setTimeout(() => {
    const br = Math.max(20, Math.min(100, Number(level)));
    const psBright = `Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = ${br} } -ErrorAction SilentlyContinue | Out-Null`;
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psBright],
      { windowsHide: true },
      () => {}
    );
  }, 200);
});

// Kontrol Media Sistem Windows Asli (Spotify, YouTube Browser, VLC, dll.) via VK_MEDIA Keys
ipcMain.on('media-key-control', (event, action) => {
  const keyMap = {
    'play-pause': 179, // VK_MEDIA_PLAY_PAUSE
    next: 176,         // VK_MEDIA_NEXT_TRACK
    prev: 177,         // VK_MEDIA_PREV_TRACK
    stop: 178,         // VK_MEDIA_STOP
    mute: 173          // VK_VOLUME_MUTE
  };
  const code = keyMap[action];
  if (!code) return;
  execFile(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      `$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]${code})`
    ],
    { windowsHide: true },
    () => {}
  );
});

// Pencarian Cepat File Lokal di Laptop untuk Spotlight (Desktop, Downloads, Documents, Workspace)
ipcMain.handle('search-local-files', async (event, rawQuery) => {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q || q.length < 2) return [];

  const home = os.homedir();
  const roots = [
    { label: 'Workspace', dir: __dirname },
    { label: 'Desktop', dir: path.join(home, 'Desktop') },
    { label: 'Downloads', dir: path.join(home, 'Downloads') },
    { label: 'Documents', dir: path.join(home, 'Documents') },
    { label: 'Pictures', dir: path.join(home, 'Pictures') }
  ];

  const results = [];
  const maxResults = 16;

  async function scanDir(dirPath, rootLabel, depth = 0) {
    if (results.length >= maxResults || depth > 1) return;
    let entries = [];
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) break;
      const name = entry.name;
      if (name.startsWith('.') || name.startsWith('$') || name === 'node_modules') continue;

      const fullPath = path.join(dirPath, name);
      if (name.toLowerCase().includes(q)) {
        results.push({
          name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          location: rootLabel
        });
      }
      if (entry.isDirectory() && depth < 1 && results.length < maxResults) {
        await scanDir(fullPath, rootLabel, depth + 1);
      }
    }
  }

  for (const r of roots) {
    if (fs.existsSync(r.dir)) {
      await scanDir(r.dir, r.label, 0);
    }
  }
  return results;
});

// Built-in HD Screenshot Capture & Annotation Studio Saver
ipcMain.handle('capture-screen-hd', async () => {
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setOpacity(0);
    }
    await new Promise((r) => setTimeout(r, 140));

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.min(1920, Math.round(width * (primaryDisplay.scaleFactor || 1))),
        height: Math.min(1080, Math.round(height * (primaryDisplay.scaleFactor || 1)))
      }
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setOpacity(1);
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.focus();
    }

    if (!sources || sources.length === 0) return null;
    return sources[0].thumbnail.toDataURL();
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setOpacity(1);
    }
    return null;
  }
});

ipcMain.handle('save-annotated-screenshot', async (event, payload = {}) => {
  try {
    const { dataUrl, mode } = payload;
    if (!dataUrl) return { ok: false };
    const img = nativeImage.createFromDataURL(dataUrl);

    if (mode === 'clipboard' || mode === 'both') {
      clipboard.writeImage(img);
    }

    let savedPath = '';
    if (mode === 'save' || mode === 'both') {
      const picDir = path.join(os.homedir(), 'Pictures', 'WinMac-Screenshots');
      await fs.promises.mkdir(picDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      savedPath = path.join(picDir, `WinMac-Shot-${stamp}.png`);
      await fs.promises.writeFile(savedPath, img.toPNG());
    }

    return { ok: true, savedPath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Dialog Pilih Aplikasi (.exe) untuk Ditambahkan ke Dock
ipcMain.handle('pick-app-shortcut', async () => {
  if (!mainWindow) return null;
  mainWindow.setIgnoreMouseEvents(false);
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Pilih Aplikasi atau File untuk Ditambahkan ke Dock',
    filters: [
      { name: 'Aplikasi & Shortcut', extensions: ['exe', 'lnk', 'bat', 'cmd'] },
      { name: 'Semua File', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  const fullPath = result.filePaths[0];
  const baseName = path.basename(fullPath, path.extname(fullPath));
  const iconDataUrl = await extractNativeAppIcon(fullPath);
  return {
    name: baseName.charAt(0).toUpperCase() + baseName.slice(1),
    path: fullPath,
    iconDataUrl
  };
});

ipcMain.handle('get-app-icon', async (event, targetPath) => {
  if (!targetPath || typeof targetPath !== 'string') return '';
  return extractNativeAppIcon(targetPath);
});

// =========================================================
// 4. IPC HANDLERS: CUSTOM FILE EXPLORER + QUICK LOOK + CRUD
// =========================================================
ipcMain.handle('get-user-Bookmarks', () => {
  const home = os.homedir();
  const bookmarks = [
    { name: 'Desktop', icon: 'desktop', path: path.join(home, 'Desktop') },
    { name: 'Downloads', icon: 'downloads', path: path.join(home, 'Downloads') },
    { name: 'Documents', icon: 'documents', path: path.join(home, 'Documents') },
    { name: 'Pictures', icon: 'pictures', path: path.join(home, 'Pictures') },
    { name: 'Videos', icon: 'videos', path: path.join(home, 'Videos') },
    { name: 'Music', icon: 'music', path: path.join(home, 'Music') },
    { name: 'Workspace', icon: 'code', path: process.cwd() },
    { name: 'Local Disk (C:)', icon: 'drive', path: 'C:\\' },
    { name: 'Data Disk (D:)', icon: 'drive', path: 'D:\\' },
    { name: 'Data Disk (E:)', icon: 'drive', path: 'E:\\' }
  ];
  return bookmarks.filter((b) => fs.existsSync(b.path));
});

ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const targetPath = path.resolve(dirPath || os.homedir());
    const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
    const items = [];

    const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico']);

    for (const entry of entries) {
      if (entry.name.startsWith('$') || entry.name.toLowerCase() === 'desktop.ini') continue;

      const fullPath = path.join(targetPath, entry.name);
      let size = 0;
      let mtime = null;
      let mtimeMs = 0;
      try {
        const stat = await fs.promises.stat(fullPath);
        size = stat.size;
        mtime = stat.mtime ? stat.mtime.toISOString() : null;
        mtimeMs = stat.mtimeMs || 0;
      } catch (_) {}

      const ext = entry.isDirectory() ? 'folder' : path.extname(entry.name).toLowerCase();
      const isImage = !entry.isDirectory() && imageExts.has(ext);

      items.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        ext,
        isImage,
        imageUrl: isImage ? pathToFileURL(fullPath).href : '',
        size,
        mtime,
        mtimeMs
      });
    }

    items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    return {
      ok: true,
      currentPath: targetPath,
      parentPath: path.dirname(targetPath),
      items: items.slice(0, 300)
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      currentPath: dirPath,
      items: []
    };
  }
});

// Quick Look File Preview (Gambar & Teks/Kode)
ipcMain.handle('preview-file', async (event, filePath) => {
  try {
    const stat = await fs.promises.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico'];
    const textExts = [
      '.txt', '.md', '.js', '.ts', '.json', '.html', '.css', '.php',
      '.py', '.sql', '.xml', '.yml', '.yaml', '.ini', '.log', '.bat', '.ps1'
    ];

    if (imageExts.includes(ext)) {
      let previewUrl = pathToFileURL(filePath).href;
      // Gunakan DataURL untuk gambar <= 8MB agar 100% langsung tampil meskipun path mengandung karakter khusus
      if (stat.size <= 8 * 1024 * 1024) {
        try {
          const mimeMap = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
            '.ico': 'image/x-icon'
          };
          const buf = await fs.promises.readFile(filePath);
          previewUrl = `data:${mimeMap[ext] || 'image/png'};base64,${buf.toString('base64')}`;
        } catch (_) {}
      }
      return {
        ok: true,
        type: 'image',
        url: previewUrl,
        fileUrl: pathToFileURL(filePath).href,
        size: stat.size,
        mtime: stat.mtime.toLocaleString('id-ID')
      };
    }

    if (textExts.includes(ext) && stat.size <= 250 * 1024) {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return {
        ok: true,
        type: 'text',
        content: content.slice(0, 8000),
        size: stat.size,
        mtime: stat.mtime.toLocaleString('id-ID')
      };
    }

    return {
      ok: true,
      type: 'meta',
      size: stat.size,
      mtime: stat.mtime.toLocaleString('id-ID')
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Operasi File di Custom Explorer: Buat Folder, Buat File, Simpan Teks, Copy/Cut/Paste, Duplicate, Rename, Hapus ke Recycle Bin
ipcMain.handle('explorer-create-folder', async (event, parentDir, folderName) => {
  try {
    const safeName = String(folderName || '').trim().replace(/[<>:"/\\|?*]/g, '_');
    if (!safeName) return { ok: false, error: 'Nama folder tidak boleh kosong' };
    const target = path.join(parentDir, safeName);
    await fs.promises.mkdir(target, { recursive: true });
    return { ok: true, path: target, name: safeName };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('explorer-create-file', async (event, parentDir, fileName, content = '') => {
  try {
    let safeName = String(fileName || '').trim().replace(/[<>:"/\\|?*]/g, '_');
    if (!safeName) return { ok: false, error: 'Nama file tidak boleh kosong' };
    if (!path.extname(safeName)) safeName += '.txt';
    const target = path.join(parentDir, safeName);
    await fs.promises.writeFile(target, String(content || ''), 'utf-8');
    return { ok: true, path: target, name: safeName };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('explorer-save-text-file', async (event, filePath, content) => {
  try {
    await fs.promises.writeFile(filePath, String(content ?? ''), 'utf-8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('explorer-rename', async (event, oldPath, newName) => {
  try {
    const safeName = String(newName || '').trim().replace(/[<>:"/\\|?*]/g, '_');
    if (!safeName) return { ok: false, error: 'Nama baru tidak boleh kosong' };
    const newPath = path.join(path.dirname(oldPath), safeName);
    await fs.promises.rename(oldPath, newPath);
    return { ok: true, path: newPath, name: safeName };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('explorer-paste-item', async (event, payload = {}) => {
  try {
    const { sourcePath, targetDir, mode } = payload;
    if (!sourcePath || !targetDir || !fs.existsSync(sourcePath)) {
      return { ok: false, error: 'File sumber tidak ditemukan' };
    }
    const baseName = path.basename(sourcePath);
    const ext = path.extname(baseName);
    const stem = path.basename(baseName, ext);
    let destPath = path.join(targetDir, baseName);

    if (mode === 'cut' && path.resolve(sourcePath) === path.resolve(destPath)) {
      return { ok: true, path: destPath, name: baseName };
    }

    let counter = 1;
    while (fs.existsSync(destPath)) {
      const nextName = counter === 1 ? `${stem} - Copy${ext}` : `${stem} - Copy (${counter})${ext}`;
      destPath = path.join(targetDir, nextName);
      counter += 1;
    }

    if (mode === 'cut') {
      try {
        await fs.promises.rename(sourcePath, destPath);
      } catch (_) {
        await fs.promises.cp(sourcePath, destPath, { recursive: true });
        await fs.promises.rm(sourcePath, { recursive: true, force: true });
      }
    } else {
      await fs.promises.cp(sourcePath, destPath, { recursive: true });
    }
    return { ok: true, path: destPath, name: path.basename(destPath) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('explorer-trash', async (event, targetPath) => {
  try {
    await shell.trashItem(targetPath);
    return { ok: true };
  } catch (err) {
    try {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
      return { ok: true };
    } catch (err2) {
      return { ok: false, error: err2.message || err.message };
    }
  }
});

ipcMain.handle('explorer-show-in-folder', async (event, targetPath) => {
  if (!targetPath) return { ok: false };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.blur();
  }
  shell.showItemInFolder(targetPath);
  return { ok: true };
});

ipcMain.on('copy-to-clipboard', (event, text) => {
  clipboard.writeText(String(text || ''));
});

ipcMain.handle('get-clipboard-text', () => {
  try {
    return clipboard.readText() || '';
  } catch (_) {
    return '';
  }
});

ipcMain.handle('pick-wallpaper-image', async () => {
  if (!mainWindow) return null;
  mainWindow.setIgnoreMouseEvents(false);
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Pilih Gambar Background / Wallpaper Desktop',
    filters: [
      { name: 'Gambar Wallpaper', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  const fullPath = result.filePaths[0];
  return pathToFileURL(fullPath).href;
});

ipcMain.handle('pick-wallpaper-video', async () => {
  if (!mainWindow) return null;
  mainWindow.setIgnoreMouseEvents(false);
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Pilih Video Live Wallpaper (.mp4 / .webm)',
    filters: [
      { name: 'Video Live Wallpaper', extensions: ['mp4', 'webm', 'ogg', 'mov'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  const fullPath = result.filePaths[0];
  return pathToFileURL(fullPath).href;
});

ipcMain.on('open-external-url', (event, url) => {
  if (url && /^https?:\/\//i.test(url)) {
    shell.openExternal(url);
  }
});

ipcMain.handle('open-path', async (event, targetPath) => {
  if (!targetPath) return { ok: false };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.blur();
  }
  const errStr = await shell.openPath(targetPath);
  return { ok: !errStr, error: errStr || '' };
});

ipcMain.handle('run-terminal-cmd', (event, cmdString, cwdPath) => {
  return new Promise((resolve) => {
    exec(
      cmdString,
      { cwd: cwdPath || os.homedir(), windowsHide: true, timeout: 10000 },
      (error, stdout, stderr) => {
        resolve({
          output: stdout || stderr || (error ? error.message : 'Perintah selesai dijalankan.'),
          isError: Boolean(error)
        });
      }
    );
  });
});

ipcMain.on('launch-app', (event, appId) => {
  const commands = {
    explorer: 'explorer.exe',
    chrome: 'start chrome || start msedge',
    vscode: 'code || start code',
    terminal: 'wt.exe || start powershell.exe',
    calculator: 'calc.exe',
    notepad: 'notepad.exe',
    excel: 'start excel || explorer.exe',
    word: 'start winword || notepad.exe',
    powerpoint: 'start powerpnt || explorer.exe',
    postman: 'start postman || start chrome',
    settings: 'start ms-settings:',
    recyclebin: 'explorer.exe shell:RecycleBinFolder',
    taskmgr: 'taskmgr.exe',
    snipping: 'explorer.exe ms-screenclip:',
    lock: 'rundll32.exe user32.dll,LockWorkStation'
  };

  const cmd = commands[appId];
  if (cmd) {
    if (appId !== 'lock' && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
      mainWindow.blur();
    }
    exec(cmd, { windowsHide: true }, (error) => {
      if (error) {
        console.error(`Gagal menjalankan [${appId}]:`, error.message);
      }
      if (isAlwaysOnTop && mainWindow && !mainWindow.isDestroyed()) {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setAlwaysOnTop(true, 'screen-saver');
          }
        }, 350);
      }
    });
  }
});

// =========================================================
// 4A-1. AUTO-SCAN WINDOWS INSTALLED APPS (Start Menu Programs A-Z)
// =========================================================
let cachedInstalledApps = null;
let isScanningInstalledApps = false;

function scanDirShortcuts(dir, results = []) {
  try {
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        scanDirShortcuts(full, results);
      } else if (ent.name.toLowerCase().endsWith('.lnk')) {
        results.push({
          rawName: ent.name.replace(/\.lnk$/i, ''),
          path: full
        });
      }
    }
  } catch (_) {}
  return results;
}

ipcMain.handle('get-installed-apps', async () => {
  if (cachedInstalledApps && cachedInstalledApps.length > 0) {
    return cachedInstalledApps;
  }
  if (isScanningInstalledApps) {
    return cachedInstalledApps || [];
  }
  isScanningInstalledApps = true;

  try {
    const commonPath = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs';
    const userPath = path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs'
    );

    const rawList = [...scanDirShortcuts(commonPath), ...scanDirShortcuts(userPath)];
    const ignoredKeywords = [
      'uninstall', 'unins', 'remove', 'readme', 'documentation',
      'help', 'website', 'license', 'release notes', 'update', 'updater',
      'setup', 'install', 'configuration tool'
    ];

    const map = new Map();
    for (const item of rawList) {
      const name = item.rawName.trim();
      const lower = name.toLowerCase();
      if (!name || name.length < 2) continue;
      if (ignoredKeywords.some((kw) => lower.includes(kw))) continue;

      if (!map.has(lower)) {
        map.set(lower, {
          name,
          path: item.path,
          letter: (name.charAt(0).toUpperCase() >= 'A' && name.charAt(0).toUpperCase() <= 'Z')
            ? name.charAt(0).toUpperCase()
            : '#'
        });
      }
    }

    const appItems = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

    // Ambil ikon asli .lnk via resolver target/IconLocation Win32 (fallback ke app.getFileIcon)
    const dllPath = await ensureWin32ToolsDll();
    const pathsJson = JSON.stringify(appItems.map((it) => it.path));
    const batchIconMap = await extractBatchLnkIconsViaWin32(pathsJson, dllPath);

    const withIcons = await Promise.all(
      appItems.map(async (appItem) => {
        let iconDataUrl = batchIconMap.get(appItem.path) || '';
        if (!iconDataUrl) {
          iconDataUrl = await extractNativeAppIcon(appItem.path);
        } else {
          exeIconCache.set(appItem.path.toLowerCase(), iconDataUrl);
        }
        return {
          ...appItem,
          iconDataUrl
        };
      })
    );

    cachedInstalledApps = withIcons;
    isScanningInstalledApps = false;
    return cachedInstalledApps;
  } catch (err) {
    isScanningInstalledApps = false;
    return [];
  }
});

ipcMain.handle('open-app-path', async (event, appPath) => {
  try {
    if (!appPath) return { ok: false, error: 'Path kosong' };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
      mainWindow.blur();
    }
    const err = await shell.openPath(appPath);
    if (isAlwaysOnTop && mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setAlwaysOnTop(true, 'screen-saver');
        }
      }, 400);
    }
    return { ok: !err, error: err || '' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// =========================================================
// 4A-2. EXPORT NOTES & TO-DO KE FILE (.TXT / .MD) DI DESKTOP
// =========================================================
ipcMain.handle('export-notes-file', async (event, payload = {}) => {
  try {
    const { content = '', todos = [], format = 'md' } = payload;
    const desktopDir = path.join(os.homedir(), 'Desktop');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = format === 'txt' ? 'txt' : 'md';
    const fileName = `WinMac-Notes-${stamp}.${ext}`;
    const targetPath = path.join(desktopDir, fileName);

    let fileBody = '';
    if (ext === 'md') {
      fileBody = `# WinMac Desktop OS — Catatan & Tugas\n*Diekspor pada: ${new Date().toLocaleString('id-ID')}*\n\n---\n\n## 📝 Catatan Bebas\n\n${content || '*(Tidak ada catatan)*'}\n\n---\n\n## ✅ Daftar Tugas (To-Do List)\n\n`;
      if (Array.isArray(todos) && todos.length > 0) {
        todos.forEach((t) => {
          fileBody += `- [${t.done ? 'x' : ' '}] ${t.text}\n`;
        });
      } else {
        fileBody += '*(Tidak ada tugas)*\n';
      }
    } else {
      fileBody = `=== WINMAC DESKTOP OS - CATATAN & TUGAS ===\nTanggal: ${new Date().toLocaleString('id-ID')}\n\n--- CATATAN BEBAS ---\n${content || '(Kosong)'}\n\n--- DAFTAR TUGAS ---\n`;
      if (Array.isArray(todos) && todos.length > 0) {
        todos.forEach((t, i) => {
          fileBody += `${i + 1}. [${t.done ? 'SELESAI' : 'BELUM'}] ${t.text}\n`;
        });
      } else {
        fileBody += '(Kosong)\n';
      }
    }

    await fs.promises.writeFile(targetPath, fileBody, 'utf8');
    return { ok: true, path: targetPath, fileName };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// =========================================================
// 4B. LIVE RUNNING APPS DETECTOR & WIN32 WINDOW SWITCHER
//     (Mendeteksi & Membuka Kembali MS Office, Chrome, VS Code, dll.)
// =========================================================
let cachedRunningApps = [];
let lastRunningAppsCheck = 0;
let isScanningRunningApps = false;
const exeIconCache = new Map();

const IGNORED_PROCESSES = new Set([
  'electron',
  'winmac desktop os',
  'systemsettings',
  'textinputhost',
  'applicationframehost',
  'systemsettingsadminflows',
  'shellexperiencehost',
  'searchhost',
  'searchapp',
  'startmenuexperiencehost',
  'widgets',
  'widgetboard',
  'widgetservice',
  'webviewhost',
  'msedgewebview2',
  'phoneexperiencehost',
  'crossdeviceservice',
  'lockapp',
  'conhost',
  'svchost',
  'dwm',
  'ctfmon',
  'taskhostw',
  'runtimebroker',
  'sihost',
  'fontdrvhost',
  'securityhealthsystray',
  'gamebar',
  'gamebarftserver',
  'nvidia share',
  'nvidia overlay',
  'nvcontainer',
  'steamwebhelper',
  'idle'
]);

const KNOWN_APP_MAP = {
  winword: { appKey: 'word', label: 'Microsoft Word', badge: 'W', color: '#2563eb', category: 'MS Office' },
  excel: { appKey: 'excel', label: 'Microsoft Excel', badge: 'X', color: '#16a34a', category: 'MS Office' },
  powerpnt: { appKey: 'powerpoint', label: 'PowerPoint', badge: 'P', color: '#ea580c', category: 'MS Office' },
  outlook: { appKey: 'outlook', label: 'Microsoft Outlook', badge: 'O', color: '#0284c7', category: 'MS Office' },
  onenote: { appKey: 'onenote', label: 'OneNote', badge: 'N', color: '#9333ea', category: 'MS Office' },
  chrome: { appKey: 'chrome', label: 'Google Chrome', badge: '🌐', color: '#3b82f6', category: 'Browser', pinnedDock: true },
  msedge: { appKey: 'edge', label: 'Microsoft Edge', badge: '🌊', color: '#0ea5e9', category: 'Browser' },
  firefox: { appKey: 'firefox', label: 'Mozilla Firefox', badge: '🦊', color: '#f97316', category: 'Browser' },
  brave: { appKey: 'brave', label: 'Brave Browser', badge: '🦁', color: '#fb923c', category: 'Browser' },
  code: { appKey: 'vscode', label: 'VS Code', badge: '💻', color: '#0284c7', category: 'Developer', pinnedDock: true },
  antigravity: { appKey: 'antigravity', label: 'Antigravity', badge: 'AG', color: '#38bdf8', category: 'Developer' },
  cursor: { appKey: 'cursor', label: 'Cursor IDE', badge: 'CU', color: '#6366f1', category: 'Developer' },
  windsurf: { appKey: 'windsurf', label: 'Windsurf IDE', badge: 'WS', color: '#14b8a6', category: 'Developer' },
  laragon: { appKey: 'laragon', label: 'Laragon', badge: 'LG', color: '#0ea5e9', category: 'Developer' },
  explorer: { appKey: 'explorer', label: 'File Explorer', badge: '📁', color: '#f59e0b', category: 'System' },
  windowsterminal: { appKey: 'terminal', label: 'Windows Terminal', badge: '🐚', color: '#334155', category: 'Developer' },
  powershell: { appKey: 'powershell', label: 'PowerShell', badge: '🐚', color: '#2563eb', category: 'Developer' },
  cmd: { appKey: 'cmd', label: 'Command Prompt', badge: '🐚', color: '#475569', category: 'Developer' },
  notepad: { appKey: 'notepad', label: 'Notepad', badge: '📝', color: '#38bdf8', category: 'Utility' },
  calculatorapp: { appKey: 'calculator', label: 'Calculator', badge: '🧮', color: '#0ea5e9', category: 'Utility' },
  calc: { appKey: 'calculator', label: 'Calculator', badge: '🧮', color: '#0ea5e9', category: 'Utility' },
  spotify: { appKey: 'spotify', label: 'Spotify Music', badge: '🎵', color: '#22c55e', category: 'Media' },
  whatsapp: { appKey: 'whatsapp', label: 'WhatsApp', badge: '💬', color: '#10b981', category: 'Chat' },
  telegram: { appKey: 'telegram', label: 'Telegram', badge: '✈️', color: '#0ea5e9', category: 'Chat' },
  discord: { appKey: 'discord', label: 'Discord', badge: '🎮', color: '#6366f1', category: 'Chat' },
  zoom: { appKey: 'zoom', label: 'Zoom Meeting', badge: '📹', color: '#2563eb', category: 'Meeting' },
  teams: { appKey: 'teams', label: 'Microsoft Teams', badge: '👥', color: '#4f46e5', category: 'Meeting' },
  postman: { appKey: 'postman', label: 'Postman API', badge: '🚀', color: '#f97316', category: 'Developer' },
  figma: { appKey: 'figma', label: 'Figma Design', badge: '🎨', color: '#ec4899', category: 'Design' },
  acrord32: { appKey: 'acrobat', label: 'Adobe Acrobat PDF', badge: '📕', color: '#dc2626', category: 'Office' },
  acrobat: { appKey: 'acrobat', label: 'Adobe Acrobat PDF', badge: '📕', color: '#dc2626', category: 'Office' },
  vlc: { appKey: 'vlc', label: 'VLC Media Player', badge: '🎬', color: '#f97316', category: 'Media' },
  taskmgr: { appKey: 'taskmgr', label: 'Task Manager', badge: '📊', color: '#14b8a6', category: 'System' }
};

const WIN32_TOOLS_CS = `using System;
using System.IO;
using System.Text;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct WinMacRect {
  public int Left;
  public int Top;
  public int Right;
  public int Bottom;
}

public class WinMacWinItem {
  public long Hwnd;
  public int Pid;
  public string Title;
  public string ClassName;
  public bool IsMinimized;
}

public class WinMacWinEnum {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out WinMacRect lpRect);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out int pvAttribute, int cbAttribute);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] public static extern bool QueryFullProcessImageName(IntPtr hProcess, int dwFlags, StringBuilder lpExeName, ref int lpdwSize);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool CloseHandle(IntPtr hObject);

  public static string TryGetProcessPath(int pid) {
    if (pid <= 0) return "";
    IntPtr hProc = IntPtr.Zero;
    try {
      hProc = OpenProcess(0x1000, false, pid);
      if (hProc == IntPtr.Zero) return "";
      var sb = new StringBuilder(1024);
      int sz = sb.Capacity;
      if (QueryFullProcessImageName(hProc, 0, sb, ref sz) && sz > 0) {
        return sb.ToString(0, sz);
      }
    } catch {}
    finally {
      if (hProc != IntPtr.Zero) CloseHandle(hProc);
    }
    return "";
  }

  public static List<WinMacWinItem> ListWindows() {
    var list = new List<WinMacWinItem>();
    EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
      if (!IsWindowVisible(hWnd)) return true;
      int len = GetWindowTextLength(hWnd);
      if (len <= 0) return true;

      int cloaked = 0;
      try { DwmGetWindowAttribute(hWnd, 14, out cloaked, sizeof(int)); } catch {}
      if (cloaked != 0) return true;

      int exStyle = GetWindowLong(hWnd, -20);
      bool isTool = (exStyle & 0x00000080) != 0;
      bool isAppWin = (exStyle & 0x00040000) != 0;
      bool noActivate = (exStyle & 0x08000000) != 0;
      if (noActivate && !isAppWin) return true;
      if (isTool && !isAppWin) return true;

      IntPtr owner = GetWindow(hWnd, 4);
      if (owner != IntPtr.Zero && !isAppWin) return true;

      bool isMin = IsIconic(hWnd);
      if (!isMin) {
        WinMacRect rect;
        if (GetWindowRect(hWnd, out rect)) {
          if ((rect.Right - rect.Left) <= 1 || (rect.Bottom - rect.Top) <= 1) return true;
          if (rect.Left <= -20000 || rect.Top <= -20000) return true;
        }
      }

      var sbTitle = new StringBuilder(len + 1);
      GetWindowText(hWnd, sbTitle, sbTitle.Capacity);
      string title = sbTitle.ToString().Trim();
      if (string.IsNullOrEmpty(title)) return true;
      if (title == "Default IME" || title == "MSCTFIME UI" || title == "Microsoft Text Input Application" || title == "NVIDIA GeForce Overlay") return true;

      var sbCls = new StringBuilder(256);
      GetClassName(hWnd, sbCls, sbCls.Capacity);
      string cls = sbCls.ToString();

      int pid = 0;
      GetWindowThreadProcessId(hWnd, out pid);
      if (pid <= 0) return true;

      list.Add(new WinMacWinItem {
        Hwnd = hWnd.ToInt64(),
        Pid = pid,
        Title = title,
        ClassName = cls,
        IsMinimized = isMin
      });
      return true;
    }, IntPtr.Zero);
    return list;
  }
}

public class WinMacIcon {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct SHFILEINFO {
    public IntPtr hIcon;
    public int iIcon;
    public uint dwAttributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
    public string szDisplayName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
    public string szTypeName;
  }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes, ref SHFILEINFO psfi, uint cbFileInfo, uint uFlags);
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  public static extern uint ExtractIconEx(string lpszFile, int nIconIndex, IntPtr[] phiconLarge, IntPtr[] phiconSmall, uint nIcons);
  [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr hIcon);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);
  [DllImport("user32.dll", EntryPoint = "GetClassLong")]
  public static extern uint GetClassLong32(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint = "GetClassLongPtr")]
  public static extern IntPtr GetClassLong64(IntPtr hWnd, int nIndex);

  private static IntPtr GetClassLongSafe(IntPtr hWnd, int nIndex) {
    try {
      return IntPtr.Size > 4 ? GetClassLong64(hWnd, nIndex) : new IntPtr((long)GetClassLong32(hWnd, nIndex));
    } catch { return IntPtr.Zero; }
  }

  private static string HIconToPngDataUrl(IntPtr hIcon) {
    if (hIcon == IntPtr.Zero) return "";
    try {
      using (Icon ic = Icon.FromHandle(hIcon))
      using (Bitmap bmp = ic.ToBitmap())
      using (MemoryStream ms = new MemoryStream()) {
        bmp.Save(ms, ImageFormat.Png);
        return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
      }
    } catch { return ""; }
  }

  public static string ExtractFromFile(string filePath, int iconIndex) {
    if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath)) return "";
    IntPtr hIcon = IntPtr.Zero;
    bool needDestroy = false;
    try {
      if (iconIndex != 0) {
        IntPtr[] large = new IntPtr[1];
        uint cnt = ExtractIconEx(filePath, iconIndex, large, null, 1);
        if (cnt > 0 && large[0] != IntPtr.Zero) {
          hIcon = large[0];
          needDestroy = true;
        }
      }
      if (hIcon == IntPtr.Zero) {
        SHFILEINFO shinfo = new SHFILEINFO();
        SHGetFileInfo(filePath, 0, ref shinfo, (uint)Marshal.SizeOf(shinfo), 0x000000100 | 0x000000000);
        if (shinfo.hIcon != IntPtr.Zero) {
          hIcon = shinfo.hIcon;
          needDestroy = true;
        }
      }
      if (hIcon != IntPtr.Zero) {
        return HIconToPngDataUrl(hIcon);
      }
      using (Icon assoc = Icon.ExtractAssociatedIcon(filePath)) {
        if (assoc == null) return "";
        using (Bitmap bmp = assoc.ToBitmap())
        using (MemoryStream ms = new MemoryStream()) {
          bmp.Save(ms, ImageFormat.Png);
          return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
        }
      }
    } catch { return ""; }
    finally {
      if (needDestroy && hIcon != IntPtr.Zero) DestroyIcon(hIcon);
    }
  }

  public static string ExtractFromWindow(long hwndVal) {
    if (hwndVal == 0) return "";
    IntPtr hWnd = new IntPtr(hwndVal);
    if (!IsWindow(hWnd)) return "";
    try {
      IntPtr hIcon = IntPtr.Zero;
      SendMessageTimeout(hWnd, 0x007F, new IntPtr(1), IntPtr.Zero, 2, 80, out hIcon);
      if (hIcon == IntPtr.Zero) hIcon = GetClassLongSafe(hWnd, -14);
      if (hIcon == IntPtr.Zero) SendMessageTimeout(hWnd, 0x007F, new IntPtr(2), IntPtr.Zero, 2, 80, out hIcon);
      if (hIcon == IntPtr.Zero) hIcon = GetClassLongSafe(hWnd, -34);
      return HIconToPngDataUrl(hIcon);
    } catch { return ""; }
  }

  public static string ExtractBestBase64(long hwndVal, string filePath, int iconIndex) {
    string res = ExtractFromFile(filePath, iconIndex);
    if (!string.IsNullOrEmpty(res)) return res;
    return ExtractFromWindow(hwndVal);
  }
}

public class WinMacFocus {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
}

public class WinMacMin {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}

public class WinMacClose {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}`;

let win32DllReadyPath = '';
let win32DllPromise = null;

function getWin32DllTargetPath() {
  try {
    return path.join(app.getPath('userData'), 'winmac-win32-tools-v3.dll');
  } catch (_) {
    return path.join(os.tmpdir(), 'winmac-win32-tools-v3.dll');
  }
}

function ensureWin32ToolsDll() {
  const dllPath = getWin32DllTargetPath();
  if (win32DllReadyPath && fs.existsSync(win32DllReadyPath)) {
    return Promise.resolve(win32DllReadyPath);
  }
  if (fs.existsSync(dllPath)) {
    win32DllReadyPath = dllPath;
    return Promise.resolve(dllPath);
  }
  if (win32DllPromise) return win32DllPromise;

  win32DllPromise = new Promise((resolve) => {
    try {
      fs.mkdirSync(path.dirname(dllPath), { recursive: true });
    } catch (_) {}
    const tmpDll = `${dllPath}.${process.pid}.tmp.dll`;
    const compilePs = [
      '$cs = @"',
      WIN32_TOOLS_CS,
      '"@',
      `Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $cs -OutputAssembly ${psSingleQuote(tmpDll)}`,
      `Move-Item -Force -Path ${psSingleQuote(tmpDll)} -Destination ${psSingleQuote(dllPath)} -ErrorAction SilentlyContinue`
    ].join('\n');
    const encoded = Buffer.from(compilePs, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 10000 },
      (err) => {
        win32DllPromise = null;
        if (!err && fs.existsSync(dllPath)) {
          win32DllReadyPath = dllPath;
          resolve(dllPath);
        } else {
          try {
            if (fs.existsSync(tmpDll)) fs.unlinkSync(tmpDll);
          } catch (_) {}
          resolve('');
        }
      }
    );
  });
  return win32DllPromise;
}

function getWin32PreamblePs(dllPath) {
  if (dllPath) {
    return `Add-Type -Path ${psSingleQuote(dllPath)}\n`;
  }
  return `if (-not ("WinMacWinEnum" -as [type])) {\n  Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"\n${WIN32_TOOLS_CS}\n"@\n}\n`;
}

async function extractBatchLnkIconsViaWin32(pathsJson, dllPath) {
  const iconMap = new Map();
  if (!pathsJson || pathsJson === '[]') return iconMap;
  const psBatch = `
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    ${getWin32PreamblePs(dllPath)}
    $paths = ConvertFrom-Json ${psSingleQuote(pathsJson)}
    $wsh = New-Object -ComObject WScript.Shell
    $out = @{}
    foreach ($lnkPath in $paths) {
      try {
        $icPath = ''; $icIdx = 0
        if ($lnkPath -match '\\.lnk$') {
          $sc = $wsh.CreateShortcut($lnkPath)
          $loc = [string]$sc.IconLocation
          if ($loc) {
            $parts = $loc -split ','
            $cand = $parts[0].Trim()
            if ($parts.Length -gt 1) { [int]::TryParse($parts[1].Trim(), [ref]$icIdx) | Out-Null }
            if ($cand -and (Test-Path $cand)) { $icPath = $cand }
          }
          if (-not $icPath -and $sc.TargetPath -and (Test-Path $sc.TargetPath)) {
            $icPath = [string]$sc.TargetPath
          }
        } elseif (Test-Path $lnkPath) {
          $icPath = $lnkPath
        }
        if ($icPath) {
          $b64 = [WinMacIcon]::ExtractFromFile($icPath, $icIdx)
          if ($b64) { $out[$lnkPath] = $b64 }
        }
      } catch {}
    }
    $out | ConvertTo-Json -Compress
  `;
  const encoded = Buffer.from(psBatch, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 10000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (!err && stdout) {
          try {
            const obj = JSON.parse(stdout.trim());
            if (obj && typeof obj === 'object') {
              Object.entries(obj).forEach(([k, v]) => {
                if (v) iconMap.set(k, String(v));
              });
            }
          } catch (_) {}
        }
        resolve(iconMap);
      }
    );
  });
}

async function resolveIconViaWin32(targetPath, hwndStr = '') {
  const dllPath = await ensureWin32ToolsDll();
  const safeHwnd = sanitizeNumericHwnd(hwndStr);
  const psOne = `
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    ${getWin32PreamblePs(dllPath)}
    $p = ${psSingleQuote(targetPath || '')}
    $icPath = $p; $icIdx = 0
    if ($p -and $p -match '\\.lnk$' -and (Test-Path $p)) {
      try {
        $wsh = New-Object -ComObject WScript.Shell
        $sc = $wsh.CreateShortcut($p)
        $loc = [string]$sc.IconLocation
        $icPath = ''
        if ($loc) {
          $parts = $loc -split ','
          $cand = $parts[0].Trim()
          if ($parts.Length -gt 1) { [int]::TryParse($parts[1].Trim(), [ref]$icIdx) | Out-Null }
          if ($cand -and (Test-Path $cand)) { $icPath = $cand }
        }
        if (-not $icPath -and $sc.TargetPath -and (Test-Path $sc.TargetPath)) {
          $icPath = [string]$sc.TargetPath
        }
      } catch {}
    }
    [long]$hNum = 0
    [long]::TryParse("${safeHwnd}", [ref]$hNum) | Out-Null
    [WinMacIcon]::ExtractBestBase64($hNum, $icPath, $icIdx)
  `;
  const encoded = Buffer.from(psOne, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 4500 },
      (err, stdout) => {
        resolve(!err && stdout ? stdout.trim() : '');
      }
    );
  });
}

async function extractNativeAppIcon(filePath = '', hwndStr = '') {
  const cleanPath = String(filePath || '').trim();
  const cacheKey = cleanPath ? cleanPath.toLowerCase() : (hwndStr ? `hwnd:${hwndStr}` : '');
  if (!cacheKey) return '';
  if (exeIconCache.has(cacheKey)) {
    return exeIconCache.get(cacheKey);
  }

  let electronIconUrl = '';
  const isLnk = cleanPath.toLowerCase().endsWith('.lnk');
  if (cleanPath && !isLnk) {
    try {
      const nativeIcon = await app.getFileIcon(cleanPath, { size: 'large' });
      if (nativeIcon && !nativeIcon.isEmpty()) {
        const sz = nativeIcon.getSize();
        const url = nativeIcon.toDataURL();
        electronIconUrl = url;
        if (sz.width >= 48 || url.length >= 1350) {
          exeIconCache.set(cacheKey, url);
          return url;
        }
      }
    } catch (_) {}
  }

  const win32Url = await resolveIconViaWin32(cleanPath, hwndStr);
  const bestUrl = win32Url || electronIconUrl;
  if (bestUrl) {
    exeIconCache.set(cacheKey, bestUrl);
  }
  return bestUrl;
}

ipcMain.handle('get-running-apps', async (event, forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && cachedRunningApps.length > 0 && now - lastRunningAppsCheck < 3000) {
    return cachedRunningApps;
  }
  if (isScanningRunningApps) {
    return cachedRunningApps;
  }

  isScanningRunningApps = true;
  // Pastikan overlay Dock & Top Bar selalu berada di atas aplikasi eksternal & Taskbar Windows
  if (isAlwaysOnTop && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }

  let dllPath = '';
  try {
    dllPath = await ensureWin32ToolsDll();
  } catch (_) {}

  const psScript = `
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    ${getWin32PreamblePs(dllPath)}
    $procMap = @{}
    $allProcs = @(Get-Process -ErrorAction SilentlyContinue)
    foreach ($p in $allProcs) {
      $procMap[$p.Id] = $p
    }

    $results = New-Object System.Collections.Generic.List[object]
    $skipClasses = @('Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Windows.UI.Core.CoreWindow')

    foreach ($w in [WinMacWinEnum]::ListWindows()) {
      $p = $procMap[$w.Pid]
      if (-not $p) { continue }
      $pname = [string]$p.ProcessName
      if ($skipClasses -contains $w.ClassName) { continue }
      if ($pname -ieq 'explorer' -and $w.ClassName -ne 'CabinetWClass' -and $w.ClassName -ne 'ExploreWClass') {
        continue
      }

      $exePath = [WinMacWinEnum]::TryGetProcessPath($w.Pid)
      if (-not $exePath) {
        try { if ($p.Path) { $exePath = [string]$p.Path } } catch {}
      }
      if (-not $exePath -and $pname -ieq 'explorer') {
        $exePath = "$env:WINDIR\\explorer.exe"
      }

      $results.Add([PSCustomObject]@{
        Id = $w.Pid
        Hwnd = [string]$w.Hwnd
        ProcessName = $pname
        MainWindowTitle = $w.Title
        Path = $exePath
        IsMinimized = [bool]$w.IsMinimized
      })
    }

    if ($results.Count -gt 0) { $results | ConvertTo-Json -Compress } else { '[]' }
  `;

  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 8000 },
      async (err, stdout) => {
        isScanningRunningApps = false;
        lastRunningAppsCheck = Date.now();

        if (err || !stdout) {
          resolve(cachedRunningApps);
          return;
        }

        try {
          const trimmed = stdout.trim();
          const rawList = trimmed ? JSON.parse(trimmed) : [];
          const list = Array.isArray(rawList) ? rawList : [rawList];

          const groupedMap = new Map();
          for (const item of list) {
            if (!item || !item.ProcessName) continue;
            if (Number(item.Id) === process.pid) continue;
            const rawName = String(item.ProcessName);
            const lowerName = rawName.toLowerCase();
            if (IGNORED_PROCESSES.has(lowerName)) continue;

            const title = String(item.MainWindowTitle || '').trim();
            if (!title || title === 'Program Manager' || title === 'Windows Input Experience') continue;

            const exePath = item.Path ? String(item.Path) : '';
            const hwndStr = item.Hwnd ? String(item.Hwnd).trim() : '';
            const iconDataUrl = await extractNativeAppIcon(exePath, hwndStr);

            const meta = KNOWN_APP_MAP[lowerName] || {
              appKey: lowerName,
              label: rawName.charAt(0).toUpperCase() + rawName.slice(1),
              badge: rawName.slice(0, 2).toUpperCase(),
              color: '#6366f1',
              category: 'Application',
              pinnedDock: false
            };

            const winEntry = {
              hwnd: hwndStr,
              pid: Number(item.Id) || 0,
              processName: rawName,
              title: title || meta.label,
              isMinimized: Boolean(item.IsMinimized)
            };

            const existing = groupedMap.get(lowerName);
            if (!existing) {
              groupedMap.set(lowerName, {
                hwnd: hwndStr,
                pid: winEntry.pid,
                processName: rawName,
                appKey: meta.appKey,
                label: meta.label,
                title: winEntry.title,
                badge: meta.badge,
                color: meta.color,
                category: meta.category,
                pinnedDock: Boolean(meta.pinnedDock),
                iconDataUrl,
                windows: [winEntry],
                windowCount: 1,
                visibleWindowCount: winEntry.isMinimized ? 0 : 1,
                allMinimized: winEntry.isMinimized
              });
            } else {
              const dup = existing.windows.some((w) =>
                hwndStr ? w.hwnd === hwndStr : w.pid === winEntry.pid && w.title === winEntry.title
              );
              if (!dup) {
                existing.windows.push(winEntry);
                existing.windowCount = existing.windows.length;
                existing.visibleWindowCount = existing.windows.filter((w) => !w.isMinimized).length;
                existing.allMinimized = existing.visibleWindowCount === 0;
              }
              if (!existing.title && winEntry.title) {
                existing.title = winEntry.title;
                existing.pid = winEntry.pid;
                existing.hwnd = hwndStr;
              }
              if (!existing.iconDataUrl && iconDataUrl) {
                existing.iconDataUrl = iconDataUrl;
              }
            }
          }

          cachedRunningApps = Array.from(groupedMap.values());
          resolve(cachedRunningApps);
        } catch (_) {
          resolve(cachedRunningApps);
        }
      }
    );
  });
});

function sanitizeNumericHwnd(val) {
  const s = String(val || '').trim();
  return /^-?\d+$/.test(s) ? s : '0';
}

// Fokuskan & kembalikan (Un-minimize / Restore) jendela aplikasi yang sedang terbuka ke paling depan
ipcMain.handle('focus-running-app', async (event, payload = {}) => {
  const { hwnd, pid, processName } = payload;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.blur();
  }

  const safeHwnd = sanitizeNumericHwnd(hwnd);
  const safeProc = String(processName || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  const safePid = Number(pid) || 0;
  const dllPath = await ensureWin32ToolsDll();

  const psFocus = `
${getWin32PreamblePs(dllPath)}
$h = [IntPtr]::Zero
[long]$hwndNum = 0
if ([long]::TryParse("${safeHwnd}", [ref]$hwndNum) -and $hwndNum -ne 0) {
  $cand = [IntPtr]$hwndNum
  if ([WinMacFocus]::IsWindow($cand)) {
    $h = $cand
  }
}
$target = $null
if ($h -eq [IntPtr]::Zero) {
  if (${safePid} -gt 0) {
    $target = Get-Process -Id ${safePid} -ErrorAction SilentlyContinue
  }
  if ((-not $target -or $target.MainWindowHandle -eq 0) -and "${safeProc}" -ne "") {
    $target = Get-Process -Name "${safeProc}" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  }
  if ($target -and $target.MainWindowHandle -ne 0) {
    $h = $target.MainWindowHandle
  }
}
if ($h -ne [IntPtr]::Zero) {
  if ([WinMacFocus]::IsIconic($h)) {
    [WinMacFocus]::ShowWindowAsync($h, 9) | Out-Null
  } else {
    [WinMacFocus]::ShowWindowAsync($h, 5) | Out-Null
  }
  [WinMacFocus]::BringWindowToTop($h) | Out-Null
  [WinMacFocus]::SwitchToThisWindow($h, $true)
  [WinMacFocus]::SetForegroundWindow($h) | Out-Null
}
`;

  const encoded = Buffer.from(psFocus, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 4000 },
      () => {
        lastRunningAppsCheck = 0;
        if (isAlwaysOnTop && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setAlwaysOnTop(true, 'screen-saver');
        }
        resolve(true);
      }
    );
  });
});

ipcMain.handle('minimize-running-app', async (event, payload = {}) => {
  const safeHwnd = sanitizeNumericHwnd(payload.hwnd);
  const safePid = Number(payload.pid) || 0;
  if (safeHwnd === '0' && !safePid) return false;
  const dllPath = await ensureWin32ToolsDll();
  const psMin = `
${getWin32PreamblePs(dllPath)}
$h = [IntPtr]::Zero
[long]$hwndNum = 0
if ([long]::TryParse("${safeHwnd}", [ref]$hwndNum) -and $hwndNum -ne 0) {
  $cand = [IntPtr]$hwndNum
  if ([WinMacMin]::IsWindow($cand)) { $h = $cand }
}
if ($h -eq [IntPtr]::Zero -and ${safePid} -gt 0) {
  $p = Get-Process -Id ${safePid} -ErrorAction SilentlyContinue
  if ($p -and $p.MainWindowHandle -ne 0) { $h = $p.MainWindowHandle }
}
if ($h -ne [IntPtr]::Zero) {
  [WinMacMin]::ShowWindowAsync($h, 6) | Out-Null
}
`;
  const encoded = Buffer.from(psMin, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 3500 },
      () => {
        lastRunningAppsCheck = 0;
        resolve(true);
      }
    );
  });
});

ipcMain.handle('close-running-app', async (event, payload = {}) => {
  const safeHwnd = sanitizeNumericHwnd(payload.hwnd);
  const safePid = Number(payload.pid) || 0;
  if (safeHwnd === '0' && !safePid) return false;
  const dllPath = await ensureWin32ToolsDll();
  const psClose = `
${getWin32PreamblePs(dllPath)}
$handled = $false
[long]$hwndNum = 0
if ([long]::TryParse("${safeHwnd}", [ref]$hwndNum) -and $hwndNum -ne 0) {
  $cand = [IntPtr]$hwndNum
  if ([WinMacClose]::IsWindow($cand)) {
    [WinMacClose]::PostMessage($cand, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    $handled = $true
  }
}
if (-not $handled -and ${safePid} -gt 0) {
  $p = Get-Process -Id ${safePid} -ErrorAction SilentlyContinue
  if ($p) { $p.CloseMainWindow() | Out-Null }
}
`;
  const encoded = Buffer.from(psClose, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 3500 },
      () => {
        lastRunningAppsCheck = 0;
        resolve(true);
      }
    );
  });
});

// =========================================================
// 5. APP LIFECYCLE & GLOBAL SHORTCUTS
// =========================================================
app.whenReady().then(() => {
  createWindow();
  createTrayIcon();
  // Auto-start disinkronkan dari konfigurasi permanen renderer saat startup (set-autostart)

  // Global Shortcut: Alt+Space untuk Start Menu, Alt+E untuk Custom Explorer
  globalShortcut.register('Alt+Space', () => {
    if (!mainWindow) return;
    if (!isOverlayVisible) {
      isOverlayVisible = true;
      mainWindow.show();
    }
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.focus();
    mainWindow.webContents.send('shortcut-trigger', 'toggle-start');
  });

  globalShortcut.register('Alt+E', () => {
    if (!mainWindow) return;
    if (!isOverlayVisible) {
      isOverlayVisible = true;
      mainWindow.show();
    }
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.focus();
    mainWindow.webContents.send('shortcut-trigger', 'toggle-explorer');
  });

  globalShortcut.register('Alt+K', () => {
    if (!mainWindow) return;
    if (!isOverlayVisible) {
      isOverlayVisible = true;
      mainWindow.show();
    }
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.focus();
    mainWindow.webContents.send('shortcut-trigger', 'toggle-spotlight');
  });

  globalShortcut.register('Alt+W', () => {
    if (!mainWindow) return;
    if (!isOverlayVisible) {
      isOverlayVisible = true;
      mainWindow.show();
    }
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.focus();
    mainWindow.webContents.send('shortcut-trigger', 'toggle-task-switcher');
  });

  globalShortcut.register('Alt+D', () => {
    if (!mainWindow) return;
    if (!isOverlayVisible) {
      isOverlayVisible = true;
      mainWindow.show();
    }
    mainWindow.webContents.send('shortcut-trigger', 'toggle-desktop-mode');
  });

  globalShortcut.register('Alt+N', () => {
    if (!mainWindow) return;
    if (!isOverlayVisible) {
      isOverlayVisible = true;
      mainWindow.show();
    }
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.focus();
    mainWindow.webContents.send('shortcut-trigger', 'toggle-notifications');
  });

  globalShortcut.register('Alt+S', () => {
    if (!mainWindow) return;
    if (!isOverlayVisible) {
      isOverlayVisible = true;
      mainWindow.show();
    }
    mainWindow.webContents.send('shortcut-trigger', 'trigger-screenshot-studio');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
