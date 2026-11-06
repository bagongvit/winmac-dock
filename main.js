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
  clipboard
} = require('electron');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

let mainWindow;
let tray = null;
let isAlwaysOnTop = true;
let isOverlayVisible = true;

// Optimasi Ringan untuk Laptop (Hemat RAM & GPU V8)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

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

ipcMain.on('set-autostart', (event, flag) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(flag),
      path: process.execPath
    });
  } catch (e) {
    console.error('Gagal mengatur auto-start:', e.message);
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

      items.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        ext: entry.isDirectory() ? 'folder' : path.extname(entry.name).toLowerCase(),
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
      return {
        ok: true,
        type: 'image',
        url: `file://${filePath.replace(/\\/g, '/')}`,
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
    exec(cmd, { windowsHide: true }, (error) => {
      if (error) {
        console.error(`Gagal menjalankan [${appId}]:`, error.message);
      }
    });
  }
});

// =========================================================
// 5. APP LIFECYCLE & GLOBAL SHORTCUTS
// =========================================================
app.whenReady().then(() => {
  createWindow();
  createTrayIcon();

  // Global Shortcut: Alt+Space untuk Start Menu, Alt+E untuk Custom Explorer
  globalShortcut.register('Alt+Space', () => {
    if (!mainWindow) return;
    if (!isOverlayVisible) {
      isOverlayVisible = true;
      mainWindow.show();
    }
    mainWindow.webContents.send('shortcut-trigger', 'toggle-start');
  });

  globalShortcut.register('Alt+E', () => {
    if (!mainWindow) return;
    if (!isOverlayVisible) {
      isOverlayVisible = true;
      mainWindow.show();
    }
    mainWindow.webContents.send('shortcut-trigger', 'toggle-explorer');
  });

  globalShortcut.register('Alt+K', () => {
    if (!mainWindow) return;
    if (!isOverlayVisible) {
      isOverlayVisible = true;
      mainWindow.show();
    }
    mainWindow.webContents.send('shortcut-trigger', 'toggle-spotlight');
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
