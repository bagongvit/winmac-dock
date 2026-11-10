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
const os = require('os');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

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
    diskD: cachedDiskD
  };
}

// =========================================================
// 2. WINDOW UTAMA & SYSTEM TRAY ICON
// =========================================================
function createTrayIcon() {
  // Buat ikon 16x16 PNG DataURL secara programatis agar selalu tampil tanpa file eksternal
  const iconDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABMSURBVDhPY2RgYPgPxFQBjAwMDP8p4dH1MDAwMPzHpgcXAwNQBgaG/9j04NL AwMDwH5seXBoYGBj+U9pN2DSQ4gYGBoZRAwYGAAAzcR4R728v5QAAAABJRU5ErkJggg==';
  const image = nativeImage.createFromDataURL(iconDataUrl);

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
      nodeIntegration: true,
      contextIsolation: false
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

  const psSetup = `
$wsh = New-Object -ComObject WScript.Shell
$desktopDir = [Environment]::GetFolderPath('Desktop')
$startupDir = [Environment]::GetFolderPath('Startup')

# Bersihkan shortcut duplikat lama jika ada
Remove-Item (Join-Path $desktopDir "WinMac Desktop OS (Admin).lnk") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $desktopDir "WinMac Desktop OS (Run as Admin).lnk") -Force -ErrorAction SilentlyContinue

# 1. Buat 1 Shortcut Utama di Desktop
if (Test-Path "${launcherExe}") {
  $s1 = $wsh.CreateShortcut((Join-Path $desktopDir "WinMac Desktop OS.lnk"))
  $s1.TargetPath = "${launcherExe}"
  $s1.WorkingDirectory = "${__dirname}"
  $s1.Description = "WinMac Desktop OS Suite Pro"
  if (Test-Path "${icoPath}") { $s1.IconLocation = "${icoPath}" }
  $s1.Save()
}

# 2. Atur Auto-Start Saat PC Restart / Login Windows (Registry Run & Startup Folder)
$regPath = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
$startupLnk = Join-Path $startupDir "WinMac Desktop OS.lnk"

if ($${enableStartup ? 'true' : 'false'}) {
  Set-ItemProperty -Path $regPath -Name "WinMacDesktopOS" -Value '"${targetExe}"' -ErrorAction SilentlyContinue
  if (Test-Path "${launcherExe}") {
    $s3 = $wsh.CreateShortcut($startupLnk)
    $s3.TargetPath = "${launcherExe}"
    $s3.WorkingDirectory = "${__dirname}"
    if (Test-Path "${icoPath}") { $s3.IconLocation = "${icoPath}" }
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

  const psAdmin = `Start-Process -FilePath "${target}" -WorkingDirectory "${__dirname}" -Verb RunAs`;
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

// Kontrol Kecerahan Layar Laptop (WMI) + Fallback Layar Desktop
let brightTimeout = null;
ipcMain.on('set-system-brightness', (event, level) => {
  clearTimeout(brightTimeout);
  brightTimeout = setTimeout(() => {
    const br = Math.max(20, Math.min(100, Number(level)));
    exec(
      `powershell -NoProfile -WindowStyle Hidden -Command "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue).WmiSetBrightness(1, ${br})"`,
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
  return {
    name: baseName.charAt(0).toUpperCase() + baseName.slice(1),
    path: fullPath
  };
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
    { name: 'Workspace', icon: 'code', path: process.cwd() },
    { name: 'Local Disk (C:)', icon: 'drive', path: 'C:\\' },
    { name: 'Data Disk (D:)', icon: 'drive', path: 'D:\\' }
  ];
  return bookmarks.filter((b) => fs.existsSync(b.path));
});

ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const targetPath = dirPath || os.homedir();
    const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
    const items = [];

    const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico']);

    for (const entry of entries) {
      if (entry.name.startsWith('$') || entry.name.toLowerCase() === 'desktop.ini') continue;

      const fullPath = path.join(targetPath, entry.name);
      let size = 0;
      let mtime = null;
      try {
        const stat = await fs.promises.stat(fullPath);
        size = stat.size;
        mtime = stat.mtime ? stat.mtime.toISOString() : null;
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
        mtime
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
      items: items.slice(0, 150)
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

// Operasi File di Custom Explorer: Buat Folder, Rename, Hapus ke Recycle Bin, Copy Path
ipcMain.handle('explorer-create-folder', async (event, parentDir, folderName) => {
  try {
    const target = path.join(parentDir, folderName);
    await fs.promises.mkdir(target, { recursive: true });
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('explorer-rename', async (event, oldPath, newName) => {
  try {
    const newPath = path.join(path.dirname(oldPath), newName);
    await fs.promises.rename(oldPath, newPath);
    return { ok: true, path: newPath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('explorer-trash', async (event, targetPath) => {
  try {
    await shell.trashItem(targetPath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
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
  return `file://${fullPath.replace(/\\/g, '/')}`;
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
  return `file://${fullPath.replace(/\\/g, '/')}`;
});

ipcMain.on('open-external-url', (event, url) => {
  if (url && /^https?:\/\//i.test(url)) {
    shell.openExternal(url);
  }
});

ipcMain.handle('open-path', async (event, targetPath) => {
  if (!targetPath) return;
  await shell.openPath(targetPath);
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
// 4B. LIVE RUNNING APPS DETECTOR & WIN32 WINDOW SWITCHER
//     (Mendeteksi & Membuka Kembali MS Office, Chrome, VS Code, dll.)
// =========================================================
let cachedRunningApps = [];
let lastRunningAppsCheck = 0;
let isScanningRunningApps = false;
const exeIconCache = new Map();

const IGNORED_PROCESSES = new Set([
  'electron',
  'systemsettings',
  'textinputhost',
  'applicationframehost',
  'systemsettingsadminflows',
  'shellexperiencehost',
  'searchhost',
  'searchapp',
  'startmenuexperiencehost',
  'widgets',
  'widgetservice',
  'webviewhost',
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
  antigravity: { appKey: 'vscode', label: 'Antigravity IDE', badge: '💻', color: '#0284c7', category: 'Developer', pinnedDock: true },
  cursor: { appKey: 'vscode', label: 'Cursor IDE', badge: '💻', color: '#0284c7', category: 'Developer', pinnedDock: true },
  windsurf: { appKey: 'vscode', label: 'Windsurf IDE', badge: '💻', color: '#0284c7', category: 'Developer', pinnedDock: true },
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

  const psScript = `
    $expWins = @()
    try {
      $sh = New-Object -ComObject Shell.Application
      $expWins = @($sh.Windows() | Where-Object { $_.Visible -eq $true -and $_.LocationName })
    } catch {}
    $procs = @(Get-Process | Where-Object {
      $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -and $_.MainWindowTitle.Trim() -ne '' -and $_.ProcessName -ne 'explorer'
    } | Select-Object Id, ProcessName, MainWindowTitle, Path)
    if ($expWins.Count -gt 0) {
      $firstTitle = [string]$expWins[0].LocationName
      $expProc = Get-Process -Name explorer -ErrorAction SilentlyContinue | Select-Object -First 1
      $expId = if ($expProc) { $expProc.Id } else { 0 }
      $procs += [PSCustomObject]@{
        Id = $expId
        ProcessName = 'explorer'
        MainWindowTitle = $firstTitle
        Path = "$env:WINDIR\\explorer.exe"
        WindowCountOverride = $expWins.Count
      }
    }
    if ($procs.Count -gt 0) { $procs | ConvertTo-Json -Compress } else { '[]' }
  `;

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript],
      { windowsHide: true, timeout: 4500 },
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
            const rawName = String(item.ProcessName);
            const lowerName = rawName.toLowerCase();
            if (IGNORED_PROCESSES.has(lowerName)) continue;

            const title = String(item.MainWindowTitle || '').trim();
            if (!title || title === 'Program Manager' || title === 'Windows Input Experience') continue;

            const exePath = item.Path ? String(item.Path) : '';
            let iconDataUrl = '';
            if (exePath) {
              if (exeIconCache.has(exePath)) {
                iconDataUrl = exeIconCache.get(exePath);
              } else {
                try {
                  const nativeIcon = await app.getFileIcon(exePath, { size: 'large' });
                  if (nativeIcon && !nativeIcon.isEmpty()) {
                    iconDataUrl = nativeIcon.toDataURL();
                    exeIconCache.set(exePath, iconDataUrl);
                  }
                } catch (_) {}
              }
            }

            const meta = KNOWN_APP_MAP[lowerName] || {
              appKey: lowerName,
              label: rawName.charAt(0).toUpperCase() + rawName.slice(1),
              badge: rawName.slice(0, 2).toUpperCase(),
              color: '#6366f1',
              category: 'Application',
              pinnedDock: false
            };

            const existing = groupedMap.get(lowerName);
            if (!existing) {
              groupedMap.set(lowerName, {
                pid: item.Id,
                processName: rawName,
                appKey: meta.appKey,
                label: meta.label,
                title: title || meta.label,
                badge: meta.badge,
                color: meta.color,
                category: meta.category,
                pinnedDock: Boolean(meta.pinnedDock),
                iconDataUrl,
                windowCount: Number(item.WindowCountOverride) || 1
              });
            } else {
              existing.windowCount += 1;
              if (!existing.title && title) {
                existing.title = title;
                existing.pid = item.Id;
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

// Fokuskan & kembalikan (Un-minimize / Restore) jendela aplikasi yang sedang terbuka ke paling depan
ipcMain.handle('focus-running-app', async (event, payload = {}) => {
  const { pid, processName } = payload;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.blur();
  }

  const safeProc = String(processName || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  const safePid = Number(pid) || 0;

  const psFocus = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinMacFocus {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$wsh = New-Object -ComObject WScript.Shell
$target = $null
if (${safePid} -gt 0) {
  $target = Get-Process -Id ${safePid} -ErrorAction SilentlyContinue
}
if ((-not $target -or $target.MainWindowHandle -eq 0) -and "${safeProc}" -ne "") {
  $target = Get-Process -Name "${safeProc}" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
}
if ($target -and $target.MainWindowHandle -ne 0) {
  $h = $target.MainWindowHandle
  if ([WinMacFocus]::IsIconic($h)) {
    [WinMacFocus]::ShowWindowAsync($h, 9) | Out-Null
  } else {
    [WinMacFocus]::ShowWindowAsync($h, 5) | Out-Null
  }
  [WinMacFocus]::SetForegroundWindow($h) | Out-Null
  $wsh.AppActivate($target.Id) | Out-Null
}
`;

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psFocus],
      { windowsHide: true, timeout: 4000 },
      () => {
        if (isAlwaysOnTop && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setAlwaysOnTop(true, 'screen-saver');
        }
        resolve(true);
      }
    );
  });
});

ipcMain.handle('minimize-running-app', async (event, payload = {}) => {
  const safePid = Number(payload.pid) || 0;
  if (!safePid) return false;
  const psMin = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinMacMin {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@
$p = Get-Process -Id ${safePid} -ErrorAction SilentlyContinue
if ($p -and $p.MainWindowHandle -ne 0) {
  [WinMacMin]::ShowWindowAsync($p.MainWindowHandle, 6) | Out-Null
}
`;
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psMin],
      { windowsHide: true, timeout: 3500 },
      () => resolve(true)
    );
  });
});

ipcMain.handle('close-running-app', async (event, payload = {}) => {
  const safePid = Number(payload.pid) || 0;
  if (!safePid) return false;
  const psClose = `
$p = Get-Process -Id ${safePid} -ErrorAction SilentlyContinue
if ($p) { $p.CloseMainWindow() | Out-Null }
`;
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psClose],
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
  configureDesktopAppAndStartup(true);

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
