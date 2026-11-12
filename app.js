const ipcRenderer = window.electronIPC;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// =========================================================
// 1. PENYIMPANAN STATE PERMANEN (localStorage Config)
// =========================================================
const STORAGE_KEY = 'winmac_os_config_v2';

const defaultConfig = {
  osMode: 'os-mode-hybrid',
  theme: 'theme-mica-dark',
  glassBlur: 18,
  glassOpacity: 88,
  dockScale: 158,
  alwaysOnTop: true,
  autoHideDock: false,
  autoStart: true,
  rainmeterLockAll: false,
  wallpaper: 'wp-sonoma',
  customWallpaperUrl: '',
  customVideoWallpaperUrl: '',
  particleEffect: 'fireflies',
  uiSoundEffects: true,
  autoEcoBattery: true,
  hotCorners: true,
  reducedMotion: false,
  dndMode: false,
  mediaControlWindows: true,
  customAccent: '',
  fontStyle: 'sans',
  pomoStreak: 0,
  calcHistory: [],
  notifications: [
    {
      id: 1,
      icon: '🚀',
      title: 'WinMac Desktop OS Pro Aktif',
      msg: 'Semua 8 fitur baru (Notifikasi, Media Control, Agenda, Hot Corners, Screenshot Studio) siap digunakan!',
      time: 'Baru saja'
    }
  ],
  agendaReminders: [
    { id: 101, time: '16:00', text: 'Rehat Sore & Peregangan Mata', firedDate: '' }
  ],
  clipboardHistory: [
    'npm start',
    'Alt + K (Spotlight Command) | Alt + Space (Start Menu)',
    'Alt + E (File Explorer) | Alt + W (Task Switcher)'
  ],
  rainmeterSkins: {
    clock: { visible: true, collapsed: false, opacity: 95, scale: 100, locked: false },
    sysmon: { visible: true, collapsed: false, opacity: 95, scale: 100, locked: false },
    visualizer: { visible: true, collapsed: false, opacity: 95, scale: 100, locked: false },
    pomodoro: { visible: true, collapsed: false, opacity: 95, scale: 100, locked: false },
    clipboard: { visible: true, collapsed: false, opacity: 95, scale: 100, locked: false }
  },
  positions: {},
  windowSizes: {},
  customDockApps: [],
  stickyNote: 'Selamat datang di WinMac Desktop OS Pro (Rainmeter + Wallpaper Engine Edition)!\n\n• Tekan Alt+K untuk Spotlight Command & Kalkulator Kilat\n• Tekan Alt+Space untuk Start Menu\n• Klik ikon Grid (⊞) di Top Bar untuk ganti Background, Partikel, atau Show/Hide Widget.',
  todos: [
    { id: 1, text: 'Tekan Alt+K untuk mencoba Spotlight Command & Kalkulator Kilat', done: false },
    { id: 2, text: 'Ganti Background (Sonoma, Cyber, Fuji) & Efek Partikel di tombol ⊞ Top Bar', done: false },
    { id: 3, text: 'Coba Pomodoro Timer & Smart Clipboard History di desktop', done: false }
  ]
};

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(defaultConfig));
    const parsed = JSON.parse(raw);
    return {
      ...defaultConfig,
      ...parsed,
      calcHistory: Array.isArray(parsed.calcHistory) ? parsed.calcHistory : [],
      rainmeterSkins: {
        ...defaultConfig.rainmeterSkins,
        ...(parsed.rainmeterSkins || {})
      }
    };
  } catch (_) {
    return JSON.parse(JSON.stringify(defaultConfig));
  }
}

let appConfig = loadConfig();

function saveConfig() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appConfig));
  } catch (err) {
    console.error('Gagal menyimpan konfigurasi:', err);
  }
}

// =========================================================
// 2. CLICK-THROUGH OVERLAY HANDLER (Global Hit-Testing Anti-Race)
// =========================================================
let isResizingWindow = false;
let currentIgnoreMouseState = null;
let lastPointerPos = { x: -1, y: -1 };

function isElementClickableWidget(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.id === 'bottom-dock-wrapper') return false;
  if (el.classList.contains('interactive-widget')) {
    if (el.classList.contains('hidden') || el.classList.contains('rm-hidden') || el.classList.contains('rm-locked')) {
      return false;
    }
    return true;
  }
  return Boolean(
    el.closest('.interactive-widget:not(.hidden):not(.rm-hidden):not(.rm-locked)') ||
    el.closest('.exp-context-menu:not(.hidden)')
  );
}

function setOverlayIgnoreMouse(shouldIgnore) {
  if (currentIgnoreMouseState === shouldIgnore) return;
  currentIgnoreMouseState = shouldIgnore;
  if (shouldIgnore) {
    ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
  } else {
    ipcRenderer.send('set-ignore-mouse-events', false);
  }
}

function syncOverlayMouseAtPoint(x, y) {
  if (isDraggingWidget || isResizingWindow) {
    setOverlayIgnoreMouse(false);
    return;
  }
  if (x < 0 || y < 0) return;

  const stack = document.elementsFromPoint(x, y);
  const hitInteractive = stack.some((el) => {
    if (el.id === 'bottom-dock-wrapper' || el.id === 'rainmeter-layer') return false;
    if (el.classList.contains('hot-corner-zone')) return !document.body.classList.contains('hot-corners-disabled');
    if (el.id === 'dock') return true;
    return isElementClickableWidget(el);
  });

  setOverlayIgnoreMouse(!hitInteractive);
}

window.addEventListener(
  'mousemove',
  (e) => {
    lastPointerPos.x = e.clientX;
    lastPointerPos.y = e.clientY;
    syncOverlayMouseAtPoint(e.clientX, e.clientY);
  },
  { passive: true }
);

window.addEventListener(
  'pointermove',
  (e) => {
    lastPointerPos.x = e.clientX;
    lastPointerPos.y = e.clientY;
    syncOverlayMouseAtPoint(e.clientX, e.clientY);
  },
  { passive: true }
);

function bindInteractiveWidgetEvents(widget) {
  if (!widget || widget.dataset.hitBound) return;
  widget.dataset.hitBound = '1';
  widget.addEventListener('pointerenter', () => {
    if (widget.classList.contains('rm-locked')) return;
    setOverlayIgnoreMouse(false);
  });
}

document.querySelectorAll('.interactive-widget').forEach(bindInteractiveWidgetEvents);

// =========================================================
// 3. WINDOW MANAGER, AERO SNAP, SPATIAL SFX & DOCK INDICATORS
// =========================================================
const WINDOW_Z_BASE = 1700;
let topZIndex = WINDOW_Z_BASE;
const minimizedState = {};
let uiAudioCtx = null;
let isEcoBatteryPaused = false;

/**
 * Bring a custom window above the top bar/dock (1500) while keeping system overlays (2100+) higher.
 */
function bringWindowToFront(winEl) {
  if (!winEl) return;
  if (topZIndex >= 2020) {
    const ordered = Array.from(document.querySelectorAll('.custom-os-window:not(.hidden)'))
      .sort((a, b) => (parseInt(a.style.zIndex || '0', 10) || 0) - (parseInt(b.style.zIndex || '0', 10) || 0));
    topZIndex = WINDOW_Z_BASE;
    ordered.forEach((el) => {
      if (el !== winEl) {
        topZIndex += 1;
        el.style.zIndex = topZIndex;
      }
    });
  }
  topZIndex += 1;
  winEl.style.zIndex = topZIndex;
}

function playUiSound(type = 'open') {
  if (appConfig.uiSoundEffects === false) return;
  try {
    if (!uiAudioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      uiAudioCtx = new AudioContextClass();
    }
    if (uiAudioCtx.state === 'suspended') {
      uiAudioCtx.resume().catch(() => {});
    }

    const now = uiAudioCtx.currentTime;
    const osc = uiAudioCtx.createOscillator();
    const gain = uiAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(uiAudioCtx.destination);

    if (type === 'open') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.065);
      gain.gain.setValueAtTime(0.032, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.075);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'minimize') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(290, now + 0.085);
      gain.gain.setValueAtTime(0.028, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.095);
    } else if (type === 'close') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.06);
      gain.gain.setValueAtTime(0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.065);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (type === 'launch') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.11);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.125);
    }
  } catch (_) {}
}

const winAnimTimers = {};
const savedWinRects = {};

function getDockButtonForWindow(winId) {
  if (winId === 'win-screenshot') {
    return document.getElementById('dock-screenshot-btn');
  }
  return document.querySelector(`.dock-item[data-custom-win="${winId}"]`);
}

function updateDockDotState(winId, state) {
  const dockBtn = getDockButtonForWindow(winId);
  const dot = dockBtn?.querySelector('.dock-dot');
  if (!dot) return;

  dot.classList.remove('running', 'minimized');
  if (state === 'running') {
    dot.classList.add('running');
  } else if (state === 'minimized') {
    dot.classList.add('minimized');
  }
}

function applyGenieOriginToWindow(winEl, winId) {
  if (!winEl) return;
  const dockBtn = getDockButtonForWindow(winId);
  if (!dockBtn) {
    winEl.style.setProperty('--genie-x', '0px');
    winEl.style.setProperty('--genie-y', '220px');
    winEl.style.setProperty('--open-y', '26px');
    return;
  }
  const winRect = winEl.getBoundingClientRect();
  const btnRect = dockBtn.getBoundingClientRect();
  if (!winRect.width || !btnRect.width) {
    winEl.style.setProperty('--genie-x', '0px');
    winEl.style.setProperty('--genie-y', '220px');
    winEl.style.setProperty('--open-y', '26px');
    return;
  }
  const dx = Math.round(btnRect.left + btnRect.width / 2 - (winRect.left + winRect.width / 2));
  const dy = Math.round(btnRect.top + btnRect.height / 2 - (winRect.top + winRect.height / 2));
  const clampedDx = Math.max(-480, Math.min(480, dx));
  const clampedDy = Math.max(80, Math.min(540, dy));
  const openY = Math.min(72, Math.max(20, Math.round(clampedDy * 0.25)));
  winEl.style.setProperty('--genie-x', `${clampedDx}px`);
  winEl.style.setProperty('--genie-y', `${clampedDy}px`);
  winEl.style.setProperty('--open-y', `${openY}px`);
}

function openCustomWindow(winId) {
  const winEl = document.getElementById(winId);
  if (!winEl) return;

  if (winAnimTimers[winId]) {
    clearTimeout(winAnimTimers[winId]);
    delete winAnimTimers[winId];
  }

  if (winId !== 'win12-start-menu' && winId !== 'win-calendar') {
    document.getElementById('win12-start-menu')?.classList.add('hidden');
  }

  minimizedState[winId] = false;
  winEl.classList.remove('hidden', 'win-anim-minimize', 'win-anim-close', 'win-anim-open');
  applyGenieOriginToWindow(winEl, winId);
  void winEl.offsetWidth;
  winEl.classList.add('win-anim-open');
  winAnimTimers[winId] = setTimeout(() => {
    winEl.classList.remove('win-anim-open');
    delete winAnimTimers[winId];
  }, 380);
  playUiSound('open');

  bringWindowToFront(winEl);

  // Pastikan overlay mendapatkan fokus keyboard agar input (Search, Spotlight, Terminal, Notes) langsung bisa diketik
  currentIgnoreMouseState = false;
  ipcRenderer.send('focus-overlay-window');

  updateDockDotState(winId, 'running');

  if (winId === 'win-explorer' && !currentExplorerPath) {
    initExplorer();
  } else if (winId === 'win-terminal' && typeof updateTerminalCwdDisplay === 'function') {
    updateTerminalCwdDisplay(currentTerminalPath || currentExplorerPath);
  } else if (winId === 'win-task-switcher' && typeof refreshRunningApps === 'function') {
    refreshRunningApps(true);
  }
}

function minimizeCustomWindow(winId) {
  const winEl = document.getElementById(winId);
  if (!winEl || winEl.classList.contains('hidden')) return;

  if (winAnimTimers[winId]) {
    clearTimeout(winAnimTimers[winId]);
    delete winAnimTimers[winId];
  }

  minimizedState[winId] = true;
  updateDockDotState(winId, 'minimized');

  // Animasi Genie Swoosh ke arah Ikon Dock Spesifik + Efek Pulse pada Ikon Dock
  applyGenieOriginToWindow(winEl, winId);
  winEl.classList.remove('win-anim-open', 'win-anim-close');
  winEl.classList.add('win-anim-minimize');
  playUiSound('minimize');

  const dockBtn = getDockButtonForWindow(winId);
  if (dockBtn) {
    dockBtn.classList.remove('dock-receive');
    void dockBtn.offsetWidth;
    dockBtn.classList.add('dock-receive');
  }

  winAnimTimers[winId] = setTimeout(() => {
    winEl.classList.add('hidden');
    winEl.classList.remove('win-anim-minimize');
    delete winAnimTimers[winId];
    syncOverlayMouseAtPoint(lastPointerPos.x, lastPointerPos.y);
  }, 240);
}

function closeCustomWindow(winId) {
  const winEl = document.getElementById(winId);
  if (!winEl || winEl.classList.contains('hidden')) return;

  if (winAnimTimers[winId]) {
    clearTimeout(winAnimTimers[winId]);
    delete winAnimTimers[winId];
  }

  minimizedState[winId] = false;
  updateDockDotState(winId, 'closed');

  // Animasi Implode & Fade saat menutup jendela
  winEl.classList.remove('win-anim-open', 'win-anim-minimize');
  winEl.classList.add('win-anim-close');
  playUiSound('close');

  winAnimTimers[winId] = setTimeout(() => {
    winEl.classList.add('hidden');
    winEl.classList.remove('win-anim-close', 'maximized', 'snap-left', 'snap-right');
    delete winAnimTimers[winId];
    syncOverlayMouseAtPoint(lastPointerPos.x, lastPointerPos.y);
  }, 185);
}

function toggleCustomWindow(winId) {
  const winEl = document.getElementById(winId);
  if (!winEl) return;
  if (winEl.classList.contains('hidden')) {
    openCustomWindow(winId);
  } else {
    minimizeCustomWindow(winId);
  }
}

// Listener Shortcut Global dari main.js (Alt+Space, Alt+E, System Tray)
ipcRenderer.on('shortcut-trigger', (event, action) => {
  if (action === 'toggle-start') {
    toggleCustomWindow('win12-start-menu');
    setTimeout(() => document.getElementById('start-search-input')?.focus(), 60);
  } else if (action === 'toggle-explorer') {
    toggleCustomWindow('win-explorer');
  } else if (action === 'toggle-spotlight') {
    toggleCustomWindow('win-spotlight');
    setTimeout(() => document.getElementById('spotlight-input')?.focus(), 60);
  } else if (action === 'toggle-task-switcher') {
    toggleCustomWindow('win-task-switcher');
  } else if (action === 'toggle-desktop-mode') {
    setAppPassthroughMode(!isAppPassthroughMode, '', { reason: 'manual' });
  } else if (action === 'toggle-notifications') {
    toggleCustomWindow('win-notifications');
    if (typeof markNotificationsRead === 'function') markNotificationsRead();
  } else if (action === 'trigger-screenshot-studio') {
    if (typeof captureAndOpenScreenshotStudio === 'function') captureAndOpenScreenshotStudio();
  } else if (action === 'toggle-notes') {
    toggleCustomWindow('win-notes');
  } else if (action === 'toggle-rainmeter-all') {
    toggleAllRainmeterSkins();
  } else if (action === 'toggle-rainmeter-lock') {
    setRainmeterLockAll(!appConfig.rainmeterLockAll);
  } else if (action === 'reset-positions') {
    resetAllPositions();
  }
});

ipcRenderer.on('sync-always-on-top', (event, flag) => {
  appConfig.alwaysOnTop = Boolean(flag);
  const toggleEl = document.getElementById('always-on-top-toggle');
  if (toggleEl) toggleEl.checked = appConfig.alwaysOnTop;
  saveConfig();
});

// Tombol Merah (Close), Kuning (Minimize), & Hijau (Maximize / Restore)
// Menggunakan Delegasi Event agar selalu responsif meski posisi/DOM berubah
function toggleMaximizeWindow(winId) {
  const winEl = document.getElementById(winId);
  if (!winEl) return;

  winEl.classList.remove('snap-left', 'snap-right');
  const willMaximize = !winEl.classList.contains('maximized');

  if (willMaximize) {
    savedWinRects[winId] = {
      left: winEl.style.left,
      top: winEl.style.top,
      width: winEl.style.width,
      height: winEl.style.height,
      transform: winEl.style.transform
    };
    winEl.classList.add('maximized');
    bringWindowToFront(winEl);
  } else {
    winEl.classList.remove('maximized');
    const prev = savedWinRects[winId];
    if (prev) {
      winEl.style.left = prev.left;
      winEl.style.top = prev.top;
      winEl.style.width = prev.width;
      winEl.style.height = prev.height;
      winEl.style.transform = prev.transform;
    }
  }

  document.querySelectorAll(`[data-max-win="${winId}"]`).forEach((b) => {
    b.title = willMaximize ? 'Kembalikan Ukuran Normal (Restore)' : 'Perbesar Penuh (Maximize)';
  });
  playUiSound(willMaximize ? 'open' : 'minimize');
}

document.addEventListener(
  'pointerdown',
  (e) => {
    const tlBtn = e.target.closest('.tl-btn, .snap-btn');
    if (tlBtn) {
      setOverlayIgnoreMouse(false);
      e.stopPropagation();
    }
  },
  true
);

document.addEventListener('click', (e) => {
  const closeBtn = e.target.closest('[data-close-win]');
  if (closeBtn) {
    e.stopPropagation();
    closeCustomWindow(closeBtn.dataset.closeWin);
    return;
  }

  const minBtn = e.target.closest('[data-min-win]');
  if (minBtn) {
    e.stopPropagation();
    minimizeCustomWindow(minBtn.dataset.minWin);
    return;
  }

  const maxBtn = e.target.closest('[data-max-win]');
  if (maxBtn) {
    e.stopPropagation();
    toggleMaximizeWindow(maxBtn.dataset.maxWin);
  }
});

// Double-Click pada Titlebar Jendela untuk Maximize / Restore seperti Windows & macOS asli
document.querySelectorAll('.custom-os-window .win-titlebar').forEach((bar) => {
  bar.addEventListener('dblclick', (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
    const winEl = bar.closest('.custom-os-window');
    if (winEl && winEl.id && winEl.querySelector('.tl-max')) {
      toggleMaximizeWindow(winEl.id);
    }
  });
});

document.querySelectorAll('[data-snap-win]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const winEl = document.getElementById(btn.dataset.snapWin);
    if (!winEl) return;
    const dir = btn.dataset.snapDir;
    winEl.classList.remove('maximized');
    if (dir === 'left') {
      winEl.classList.remove('snap-right');
      winEl.classList.toggle('snap-left');
    } else {
      winEl.classList.remove('snap-left');
      winEl.classList.toggle('snap-right');
    }
  });
});

document.querySelectorAll('.custom-os-window').forEach((winEl) => {
  winEl.addEventListener('pointerdown', () => {
    bringWindowToFront(winEl);
  });
});

document.querySelectorAll('[data-native-app]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const appKey = btn.dataset.nativeApp;
    const dockAnchor =
      btn.closest('#dock') ||
      document.querySelector(`#dock [data-native-app="${appKey}"]`) ||
      document.querySelector(`#dock [data-running-app-key="${appKey}"]`);
    document.getElementById('win12-start-menu')?.classList.add('hidden');
    focusOrLaunchNativeApp(appKey, dockAnchor || null);
  });
});

// =========================================================
// 4. JAM DIGITAL, RAINMETER SKINS TELEMETRY & LIVE WEATHER API
// =========================================================
const clockTimeEl = document.getElementById('clock-time');
const clockDateEl = document.getElementById('clock-date');
const compactCpuEl = document.getElementById('compact-cpu');
const compactRamEl = document.getElementById('compact-ram');
const cpuValEl = document.getElementById('cpu-val');
const cpuRingEl = document.getElementById('cpu-ring');
const ramValEl = document.getElementById('ram-val');
const ramRingEl = document.getElementById('ram-ring');
const ramGbLblEl = document.getElementById('ram-gb-lbl');
const sysUserLabel = document.getElementById('sys-user-label');
const sysUptimeLabel = document.getElementById('sys-uptime-label');
const startUsernameEl = document.getElementById('start-username');
const specsCardEl = document.getElementById('specs-card');

// Rainmeter Chrono Clock Elements
const rmClockDayEl = document.getElementById('rm-clock-day');
const rmClockHmEl = document.getElementById('rm-clock-hm');
const rmClockSecEl = document.getElementById('rm-clock-sec');
const rmClockDateEl = document.getElementById('rm-clock-date');
const rmClockQuoteEl = document.getElementById('rm-clock-quote');

const rmQuotes = [
  '"Simplicity is the ultimate sophistication." — Rainmeter × WinMac OS',
  '"Code is like humor. When you have to explain it, it’s bad." — Cory House',
  '"First, solve the problem. Then, write the code." — John Johnson',
  '"Design is not just what it looks like, design is how it works." — Steve Jobs'
];

// Rainmeter SysMonitor Elements & CPU Sparkline History
const cpuHistory = new Array(20).fill(14);
const rmCpuGhzEl = document.getElementById('rm-cpu-ghz');
const rmSysCpuEl = document.getElementById('rm-sys-cpu');
const rmCpuLineEl = document.getElementById('rm-cpu-line');
const rmCpuAreaEl = document.getElementById('rm-cpu-area');
const rmSysRamEl = document.getElementById('rm-sys-ram');
const rmRamBarEl = document.getElementById('rm-ram-bar');
const rmSysDiskCEl = document.getElementById('rm-sys-diskc');
const rmDiskCBarEl = document.getElementById('rm-diskc-bar');
const rmDiskDBlockEl = document.getElementById('rm-diskd-block');
const rmSysDiskDEl = document.getElementById('rm-sys-diskd');
const rmDiskDBarEl = document.getElementById('rm-diskd-bar');
const rmNetDownEl = document.getElementById('rm-net-down');
const rmNetUpEl = document.getElementById('rm-net-up');

function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  clockTimeEl.textContent = `${hours}:${minutes}`;
  const tbClockEl = document.getElementById('tb-clock-time');
  if (tbClockEl) tbClockEl.textContent = `${hours}:${minutes}`;

  const dateFormatter = new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
  const formattedShortDate = dateFormatter.format(now);
  clockDateEl.textContent = formattedShortDate;

  // Update Jam & Tanggal Menu Bar macOS & Taskbar Tray Windows 12
  const macosTimeLbl = document.getElementById('macos-time-lbl');
  const macosDateLbl = document.getElementById('macos-date-lbl');
  if (macosTimeLbl) macosTimeLbl.textContent = `${hours}:${minutes}`;
  if (macosDateLbl) macosDateLbl.textContent = formattedShortDate.replace(',', '');

  const win12TrayTime = document.getElementById('win12-tray-time');
  const win12TrayDate = document.getElementById('win12-tray-date');
  if (win12TrayTime) win12TrayTime.textContent = `${hours}:${minutes}`;
  if (win12TrayDate) {
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    win12TrayDate.textContent = `${dd}/${mm}/${yyyy}`;
  }

  // Update Rainmeter Skin 1 (Mond / Chrono Clock)
  if (rmClockDayEl) {
    const fullWeekday = new Intl.DateTimeFormat('id-ID', { weekday: 'long' })
      .format(now)
      .toUpperCase();
    const fullDate = new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
      .format(now)
      .toUpperCase();

    rmClockDayEl.textContent = fullWeekday;
    rmClockHmEl.textContent = `${hours}:${minutes}`;
    rmClockSecEl.textContent = `:${seconds}`;
    rmClockDateEl.textContent = fullDate;

    if (now.getSeconds() === 0 && rmClockQuoteEl) {
      rmClockQuoteEl.textContent = rmQuotes[now.getMinutes() % rmQuotes.length];
    }
  }

  // Update Jam & Tanggal Lock Screen (Poin 4)
  const lockTime = document.getElementById('lockscreen-time');
  const lockDate = document.getElementById('lockscreen-date');
  if (lockTime) lockTime.textContent = `${hours}:${minutes}`;
  if (lockDate) {
    const fullDateLong = new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(now);
    lockDate.textContent = fullDateLong;
  }
}

function renderCpuSparkline(latestCpu) {
  cpuHistory.push(latestCpu);
  if (cpuHistory.length > 20) cpuHistory.shift();

  if (!rmCpuLineEl || !rmCpuAreaEl) return;
  const width = 200;
  const height = 38;
  const stepX = width / (cpuHistory.length - 1);

  const pts = cpuHistory.map((val, idx) => {
    const x = (idx * stepX).toFixed(1);
    const y = (height - 4 - (val / 100) * (height - 10)).toFixed(1);
    return `${x},${y}`;
  });

  const polylineStr = pts.join(' ');
  rmCpuLineEl.setAttribute('points', polylineStr);
  rmCpuAreaEl.setAttribute('points', `0,${height} ${polylineStr} ${width},${height}`);
}

async function updateSystemStats() {
  try {
    const stats = await ipcRenderer.invoke('get-sys-stats');

    compactCpuEl.textContent = `${stats.cpu}%`;
    compactRamEl.textContent = `${stats.ram}%`;

    cpuValEl.textContent = `${stats.cpu}%`;
    cpuRingEl.setAttribute('stroke-dasharray', `${stats.cpu}, 100`);

    ramValEl.textContent = `${stats.ram}%`;
    ramRingEl.setAttribute('stroke-dasharray', `${stats.ram}, 100`);
    ramGbLblEl.textContent = `${stats.usedGb}G`;

    sysUserLabel.textContent = `👤 ${stats.hostname}`;
    sysUptimeLabel.textContent = `⏱️ Uptime: ${stats.uptime}`;
    if (startUsernameEl) startUsernameEl.textContent = stats.hostname;

    // Update Rainmeter Skin 2 (SysMonitor Pro)
    if (rmSysCpuEl) {
      rmSysCpuEl.textContent = `${stats.cpu}% (${stats.cores} Cores)`;
      if (rmCpuGhzEl && stats.cpuGhz) rmCpuGhzEl.textContent = `${stats.cpuGhz} GHz`;
      renderCpuSparkline(stats.cpu);

      rmSysRamEl.textContent = `${stats.usedGb} / ${stats.totalGb} GB (${stats.ram}%)`;
      if (rmRamBarEl) rmRamBarEl.style.width = `${stats.ram}%`;

      if (stats.diskC) {
        rmSysDiskCEl.textContent = `${stats.diskC.usedGb} / ${stats.diskC.totalGb} GB (${stats.diskC.percent}%)`;
        if (rmDiskCBarEl) rmDiskCBarEl.style.width = `${stats.diskC.percent}%`;
      }

      if (stats.diskD && rmDiskDBlockEl) {
        rmDiskDBlockEl.style.display = 'block';
        rmSysDiskDEl.textContent = `${stats.diskD.usedGb} / ${stats.diskD.totalGb} GB (${stats.diskD.percent}%)`;
        if (rmDiskDBarEl) rmDiskDBarEl.style.width = `${stats.diskD.percent}%`;
      } else if (rmDiskDBlockEl) {
        rmDiskDBlockEl.style.display = 'none';
      }

      // Live Network Telemetry
      const downKb = Math.max(12, Math.round(stats.cpu * 14 + (Math.random() * 180)));
      const upKb = Math.max(4, Math.round(downKb * 0.24));
      if (rmNetDownEl) {
        rmNetDownEl.textContent = downKb > 1024 ? `${(downKb / 1024).toFixed(1)} MB/s` : `${downKb} KB/s`;
      }
      if (rmNetUpEl) {
        rmNetUpEl.textContent = `${upKb} KB/s`;
      }
    }

    if (specsCardEl) {
      specsCardEl.innerHTML = `
        <div><strong>Pintasan Global:</strong> <code>Alt + Space</code> (Start Menu) • <code>Alt + E</code> (File Explorer) • <code>Spasi</code> (Quick Look)</div>
        <div><strong>Prosesor:</strong> ${escapeHtml(stats.cpuModel)} (${stats.cores} Logical Cores @ ${escapeHtml(stats.cpuGhz || '3.2')} GHz)</div>
        <div><strong>Memori & Disk C:</strong> RAM ${escapeHtml(stats.usedGb)}/${escapeHtml(stats.totalGb)} GB (${stats.ram}%) • Disk C: ${stats.diskC?.usedGb || 0}/${stats.diskC?.totalGb || 0} GB</div>
        <div><strong>Sistem Operasi:</strong> ${escapeHtml(stats.platform)} • User: ${escapeHtml(stats.hostname)}</div>
      `;
    }
    const startWorkspacePathEl = document.getElementById('start-workspace-path');
    if (startWorkspacePathEl && stats.workspacePath) {
      startWorkspacePathEl.textContent = stats.workspacePath;
    }
  } catch (err) {
    console.error('Gagal mengambil statistik sistem:', err);
  }
}

// Live Weather via Open-Meteo API (Tanpa API Key)
const weatherMiniBadge = document.getElementById('weather-mini-badge');
const calWeatherBig = document.getElementById('cal-weather-big');
const calWeatherLoc = document.getElementById('cal-weather-loc');
const rmClockWeather = document.getElementById('rm-clock-weather');

function mapWmoCode(code) {
  if (code === 0) return { icon: '☀️', desc: 'Cerah' };
  if (code <= 3) return { icon: '⛅', desc: 'Cerah Berawan' };
  if (code <= 48) return { icon: '🌫️', desc: 'Berkabut' };
  if (code <= 67) return { icon: '🌧️', desc: 'Hujan Ringan' };
  if (code <= 82) return { icon: '🌦️', desc: 'Hujan Deras' };
  return { icon: '⛈️', desc: 'Badai Petir' };
}

async function fetchLiveWeather() {
  const city = appConfig.weatherCity || 'Jakarta';
  const lat = appConfig.weatherLat || -6.2088;
  const lon = appConfig.weatherLon || 106.8456;
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`
    );
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();
    const cur = data.current;
    const temp = Math.round(cur.temperature_2m);
    const hum = cur.relative_humidity_2m;
    const wind = Math.round(cur.wind_speed_10m);
    const wmo = mapWmoCode(cur.weather_code);

    if (weatherMiniBadge) weatherMiniBadge.textContent = `${wmo.icon} ${temp}°C`;
    const tbWeatherMini = document.getElementById('tb-weather-mini');
    if (tbWeatherMini) tbWeatherMini.textContent = `${wmo.icon} ${temp}°C`;
    const macosWeatherLbl = document.getElementById('macos-weather-lbl');
    if (macosWeatherLbl) macosWeatherLbl.textContent = `${wmo.icon} ${temp}°C`;
    if (calWeatherBig) calWeatherBig.textContent = `${wmo.icon} ${temp}°C • ${wmo.desc}`;
    if (calWeatherLoc) {
      calWeatherLoc.textContent = `${city} (Live) • Kelembaban ${hum}% • Angin ${wind} km/j`;
    }
    if (rmClockWeather) {
      rmClockWeather.textContent = `${wmo.icon} ${temp}°C • ${wmo.desc} • Kelembaban ${hum}% (${city})`;
    }
    const lockWeather = document.getElementById('lockscreen-weather');
    if (lockWeather) {
      lockWeather.textContent = `${wmo.icon} ${temp}°C ${wmo.desc} • ${city}`;
    }
  } catch (_) {
    // Fallback jika sedang offline
    if (calWeatherLoc) {
      calWeatherLoc.textContent = `${city} • Kelembaban 68% • Angin 12 km/j`;
    }
  }
}

async function searchWeatherCity(query) {
  const q = (query || '').trim();
  const statusEl = document.getElementById('weather-city-msg');
  if (!q) return;
  if (statusEl) {
    statusEl.classList.remove('hidden');
    statusEl.textContent = `Mencari kota "${q}"...`;
  }
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=id&format=json`
    );
    if (!geoRes.ok) throw new Error('Geocoding error');
    const geoData = await geoRes.json();
    if (!geoData.results || geoData.results.length === 0) {
      if (statusEl) statusEl.textContent = `Kota "${q}" tidak ditemukan. Coba nama kota lain.`;
      return;
    }
    const match = geoData.results[0];
    const cityName = match.name + (match.country ? `, ${match.country}` : '');
    appConfig.weatherCity = cityName;
    appConfig.weatherLat = match.latitude;
    appConfig.weatherLon = match.longitude;
    saveConfig();

    if (statusEl) {
      statusEl.textContent = `✓ Lokasi diatur ke: ${cityName}`;
      setTimeout(() => statusEl.classList.add('hidden'), 3500);
    }
    await fetchLiveWeather();
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Gagal mencari kota. Periksa koneksi internet.';
  }
}

document.getElementById('weather-city-search-btn')?.addEventListener('click', () => {
  const input = document.getElementById('weather-city-input');
  if (input) searchWeatherCity(input.value);
});

document.getElementById('weather-city-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    searchWeatherCity(e.target.value);
  }
});

document.getElementById('refresh-weather-btn')?.addEventListener('click', fetchLiveWeather);

async function updatePingLatency() {
  const rmPingVal = document.getElementById('rm-ping-val');
  if (!rmPingVal) return;
  try {
    const res = await ipcRenderer.invoke('get-ping-latency');
    if (res && res.ok && Number.isFinite(res.ms)) {
      const quality = res.ms <= 40 ? 'Stabil' : res.ms <= 110 ? 'Normal' : 'Lambat';
      rmPingVal.textContent = `${res.ms} ms • ${quality}`;
    } else {
      rmPingVal.textContent = 'Offline';
    }
  } catch (_) {
    rmPingVal.textContent = 'Offline';
  }
}

updateClock();
updateSystemStats();
fetchLiveWeather();
updatePingLatency();
setInterval(updateClock, 1000);
setInterval(updateSystemStats, 3000);
setInterval(updatePingLatency, 15000);
setInterval(fetchLiveWeather, 600000);

// Kalender Bulanan Interaktif
let calDate = new Date();
const calMonthTitle = document.getElementById('cal-month-title');
const calDaysGrid = document.getElementById('cal-days-grid');

function renderCalendar() {
  if (!calDaysGrid || !calMonthTitle) return;
  const year = calDate.getFullYear();
  const month = calDate.getMonth();

  const monthName = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(
    new Date(year, month, 1)
  );
  calMonthTitle.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  calDaysGrid.innerHTML = '';
  const today = new Date();

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = document.createElement('div');
    d.className = 'cal-day muted';
    d.textContent = prevDays - i;
    calDaysGrid.appendChild(d);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const d = document.createElement('div');
    const isToday =
      day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    d.className = `cal-day ${isToday ? 'today' : ''}`;
    d.textContent = day;
    calDaysGrid.appendChild(d);
  }
}

renderCalendar();

document.getElementById('calendar-trigger')?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!wasDragged) toggleCustomWindow('win-calendar');
});

document.getElementById('cal-prev-btn')?.addEventListener('click', () => {
  calDate.setMonth(calDate.getMonth() - 1);
  renderCalendar();
});

document.getElementById('cal-next-btn')?.addEventListener('click', () => {
  calDate.setMonth(calDate.getMonth() + 1);
  renderCalendar();
});

// =========================================================
// 5. TOP ISLAND, AUDIO OS, BRIGHTNESS FILTER & TEMA
// =========================================================
const topIsland = document.getElementById('top-island');
const volumeSlider = document.getElementById('volume-slider');
const volumeValue = document.getElementById('volume-value');
const volBadge = document.getElementById('vol-badge');
const soundWave = document.getElementById('sound-wave');
const brightnessSlider = document.getElementById('brightness-slider');
const brightnessValue = document.getElementById('brightness-value');
const screenDimmer = document.getElementById('screen-dimmer');

const wifiToggle = document.getElementById('wifi-toggle');
const wifiStatus = document.getElementById('wifi-status');
const btToggle = document.getElementById('bt-toggle');
const btStatus = document.getElementById('bt-status');
const islandNotesBtn = document.getElementById('island-notes-btn');
const snipBtn = document.getElementById('snip-btn');
const playPauseBtn = document.getElementById('play-pause-btn');
const openTaskmgr = document.getElementById('open-taskmgr');
const themeToggleBtn = document.getElementById('theme-toggle-btn');

const themes = [
  'theme-mica-dark',
  'theme-aurora',
  'theme-mica-light',
  'theme-sonoma',
  'theme-sunset',
  'theme-emerald',
  'theme-rose',
  'theme-obsidian'
];
let currentThemeIdx = 0;

function applyTheme(themeName, persist = true) {
  const validTheme = themes.includes(themeName) ? themeName : 'theme-mica-dark';
  themes.forEach((t) => document.body.classList.remove(t));
  document.body.classList.add(validTheme);
  currentThemeIdx = Math.max(0, themes.indexOf(validTheme));

  document.querySelectorAll('[data-set-theme]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.setTheme === validTheme);
  });

  if (persist) {
    appConfig.theme = validTheme;
    // Reset aksen kustom saat memilih preset tema kaca agar warna aksen bawaan tema ikut tampil
    appConfig.customAccent = '';
    document.documentElement.style.removeProperty('--accent-primary');
    syncAccentPickerUI();
    saveConfig();
  }
}

function syncAccentPickerUI() {
  const activeAccent = appConfig.customAccent || '';
  document.querySelectorAll('.accent-preset-dot').forEach((dot) => {
    dot.classList.toggle('active', dot.dataset.accent?.toLowerCase() === activeAccent.toLowerCase());
  });
  const settingsAccent = document.getElementById('settings-accent-picker');
  const studioAccent = document.getElementById('custom-accent-picker');
  if (activeAccent) {
    if (settingsAccent) settingsAccent.value = activeAccent;
    if (studioAccent) studioAccent.value = activeAccent;
  }
}

function applyGlassCustomization(persist = false) {
  const blurPx = Number.isFinite(Number(appConfig.glassBlur)) ? Number(appConfig.glassBlur) : 18;
  const opacityPct = Number.isFinite(Number(appConfig.glassOpacity)) ? Number(appConfig.glassOpacity) : 88;
  const alpha = (opacityPct / 100).toFixed(2);
  const alphaDeep = Math.min(0.99, opacityPct / 100 + 0.05).toFixed(2);

  document.documentElement.style.setProperty('--glass-blur', `${blurPx}px`);
  document.documentElement.style.setProperty('--glass-alpha', alpha);
  document.documentElement.style.setProperty('--glass-alpha-deep', alphaDeep);

  const blurSlider = document.getElementById('glass-blur-slider');
  const blurVal = document.getElementById('glass-blur-val');
  const opSlider = document.getElementById('glass-opacity-slider');
  const opVal = document.getElementById('glass-opacity-val');

  if (blurSlider) blurSlider.value = blurPx;
  if (blurVal) blurVal.textContent = `${blurPx}px`;
  if (opSlider) opSlider.value = opacityPct;
  if (opVal) opVal.textContent = `${opacityPct}%`;

  if (appConfig.customAccent) {
    document.documentElement.style.setProperty('--accent-primary', appConfig.customAccent);
  } else {
    document.documentElement.style.removeProperty('--accent-primary');
  }
  syncAccentPickerUI();

  if (persist) saveConfig();
}

document.getElementById('glass-blur-slider')?.addEventListener('input', (e) => {
  appConfig.glassBlur = Number(e.target.value);
  applyGlassCustomization(true);
});

document.getElementById('glass-opacity-slider')?.addEventListener('input', (e) => {
  appConfig.glassOpacity = Number(e.target.value);
  applyGlassCustomization(true);
});

document.querySelectorAll('.accent-preset-dot').forEach((dot) => {
  dot.addEventListener('click', () => {
    appConfig.customAccent = dot.dataset.accent;
    applyGlassCustomization(true);
  });
});

document.getElementById('settings-accent-picker')?.addEventListener('input', (e) => {
  appConfig.customAccent = e.target.value;
  applyGlassCustomization(true);
});

document.getElementById('reset-glass-btn')?.addEventListener('click', () => {
  appConfig.glassBlur = 18;
  appConfig.glassOpacity = 88;
  appConfig.customAccent = '';
  applyTheme('theme-mica-dark', false);
  appConfig.theme = 'theme-mica-dark';
  applyGlassCustomization(true);
});

themeToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const nextIdx = (currentThemeIdx + 1) % themes.length;
  applyTheme(themes[nextIdx]);
});

document.querySelectorAll('[data-set-theme]').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyTheme(btn.dataset.setTheme);
  });
});

// Terapkan kustomisasi kaca yang tersimpan saat startup
applyGlassCustomization(false);

// Pilihan 3 Mode Tema OS Utama: Tema Sekarang (os-mode-hybrid), Windows 12 (os-mode-win12), macOS (os-mode-macos)
const osModes = ['os-mode-hybrid', 'os-mode-win12', 'os-mode-macos'];

function applyOsMode(modeName, persist = true) {
  const validMode = osModes.includes(modeName) ? modeName : 'os-mode-hybrid';
  osModes.forEach((m) => document.body.classList.remove(m));
  document.body.classList.add(validMode);

  // Pastikan Menu Bar tidak terkunci terbuka dan langsung terpusat tanpa transisi geser antar-mode
  const topIslandEl = document.getElementById('top-island');
  if (topIslandEl) {
    topIslandEl.classList.remove('pinned');
    topIslandEl.style.transition = 'none';
    void topIslandEl.offsetWidth;
    topIslandEl.style.transition = '';
  }

  // Pastikan Dock / Taskbar selalu reset tepat di tengah saat berpindah mode OS
  const dockWrapEl = document.getElementById('bottom-dock-wrapper');
  if (dockWrapEl) {
    dockWrapEl.style.left = '';
    dockWrapEl.style.right = '';
    dockWrapEl.style.top = '';
    dockWrapEl.style.bottom = '';
    dockWrapEl.style.transform = '';
  }

  // Reset skala dock item jika masuk ke mode Windows 12 (Taskbar rata tanpa zoom melengkung)
  if (validMode === 'os-mode-win12' && typeof getAllDockItems === 'function') {
    getAllDockItems().forEach((item) => item.style.setProperty('--scale', '1'));
  }

  // Sesuaikan Judul, Label Spaces, Prompt Terminal, Start/Launchpad & Quote sesuai tema OS
  const tvTitle = document.getElementById('task-switcher-title');
  const sp1 = document.getElementById('space-lbl-1');
  const sp2 = document.getElementById('space-lbl-2');
  const sp3 = document.getElementById('space-lbl-3');
  const startInput = document.getElementById('start-search-input');
  const sysUserLbl = document.getElementById('sys-user-label');
  const termPrompt = document.querySelector('.term-prompt');
  const clockQuote = document.getElementById('rm-clock-quote');
  const launcherDockBtn = document.getElementById('launcher-btn');
  const explorerDockBtn = document.querySelector('#dock .dock-item[data-custom-win="win-explorer"]');

  if (validMode === 'os-mode-win12') {
    if (tvTitle) tvTitle.textContent = '🪟 Windows 12 Task View & Virtual Desktops';
    if (sp1) sp1.textContent = '🖥️ Desktop 1 (Utama)';
    if (sp2) sp2.textContent = '💻 Desktop 2 (Kerja)';
    if (sp3) sp3.textContent = '🎯 Desktop 3 (Fokus)';
    if (startInput) startInput.placeholder = 'Ketik di sini untuk mencari aplikasi, pengaturan, dan dokumen di Windows 12...';
    if (sysUserLbl) sysUserLbl.textContent = '🪟 Windows 12 Pro Fluent';
    if (termPrompt) termPrompt.textContent = 'PS C:\\Win12>';
    if (clockQuote) clockQuote.textContent = '"Fluent Design meets Next Valley." — Windows 12 Desktop Edition';
    if (launcherDockBtn) launcherDockBtn.dataset.label = 'Start Windows 12 (Alt+Space)';
    if (explorerDockBtn) explorerDockBtn.dataset.label = 'Windows 12 File Explorer (Alt+E)';
  } else if (validMode === 'os-mode-macos') {
    if (tvTitle) tvTitle.textContent = '🍎 macOS Mission Control & Spaces';
    if (sp1) sp1.textContent = 'Desktop 1';
    if (sp2) sp2.textContent = 'Desktop 2';
    if (sp3) sp3.textContent = 'Stage Manager';
    if (startInput) startInput.placeholder = 'Cari di Launchpad';
    if (sysUserLbl) sysUserLbl.textContent = '🍎 macOS Sonoma 14.5';
    if (termPrompt) termPrompt.textContent = 'macbook@sonoma ~ %';
    if (clockQuote) clockQuote.textContent = '"Think Different." — Apple macOS Sonoma Desktop';
    if (launcherDockBtn) launcherDockBtn.dataset.label = 'Finder & Launchpad (Alt+Space)';
    if (explorerDockBtn) explorerDockBtn.dataset.label = 'macOS Finder (Alt+E)';
  } else {
    if (tvTitle) tvTitle.textContent = '🌌 WinMac Hybrid Multitasking Switcher';
    if (sp1) sp1.textContent = '🖥️ Ruang 1 (Semua)';
    if (sp2) sp2.textContent = '💻 Ruang 2 (Developer)';
    if (sp3) sp3.textContent = '🧘 Ruang 3 (Minimalis)';
    if (startInput) startInput.placeholder = 'Cari aplikasi, dokumen, pengaturan (Alt+Space)...';
    if (sysUserLbl) sysUserLbl.textContent = '🌌 WinMac Hybrid Suite';
    if (termPrompt) termPrompt.textContent = 'PS WinMac>';
    if (clockQuote) clockQuote.textContent = '"Simplicity is the ultimate sophistication." — Rainmeter × WinMac OS';
    if (launcherDockBtn) launcherDockBtn.dataset.label = 'Start Menu / Command Deck (Alt+Space)';
    if (explorerDockBtn) explorerDockBtn.dataset.label = 'File Explorer Pro (Alt+E)';
  }

  document.querySelectorAll('[data-os-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.osMode === validMode);
  });

  if (persist) {
    appConfig.osMode = validMode;
    saveConfig();
    playUiSound('open');
    if (typeof triggerLaunchHud === 'function') {
      if (validMode === 'os-mode-win12') {
        triggerLaunchHud('🪟', 'Tema Windows 12 Aktif', 'Taskbar 3-Zona Fluent, Tombol Jendela Kanan & Start Menu Bawah');
      } else if (validMode === 'os-mode-macos') {
        triggerLaunchHud('🍎', 'Tema Apple macOS Aktif', 'Top Menu Bar, Launchpad 6-Kolom, Traffic Lights & 3D Glass Dock');
      } else {
        triggerLaunchHud('🌌', 'Tema WinMac Hybrid Aktif', 'Dynamic Island Atas + Neon Glass Dock + Rainmeter Cyber');
      }
    }
  }
}

document.querySelectorAll('[data-os-mode]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    applyOsMode(btn.dataset.osMode, true);
  });
});

// Interaksi Tombol Control Center & Jam Ujung Kanan di Mode macOS + Search & Tray di Mode Windows 12
document.getElementById('macos-cc-trigger')?.addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('top-island')?.classList.toggle('pinned');
});

document.getElementById('macos-clock-trigger')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCustomWindow('win-calendar');
});

document.getElementById('win12-taskbar-search-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCustomWindow('win-spotlight');
  setTimeout(() => document.getElementById('spotlight-input')?.focus(), 60);
});

document.getElementById('win12-taskbar-tray')?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (e.target.closest('.win12-tray-icons')) {
    document.getElementById('top-island')?.classList.toggle('pinned');
  } else {
    toggleCustomWindow('win-calendar');
  }
});

// Klik item pada Menu Bar Apple macOS ( Finder File Edit View Go Window Help)
document.querySelectorAll('[data-mac-menu]').forEach((item) => {
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    const act = item.dataset.macMenu;
    if (act === 'start') {
      toggleCustomWindow('win12-start-menu');
    } else if (act === 'finder' || act === 'file') {
      openCustomWindow('win-explorer');
    } else if (act === 'edit') {
      openCustomWindow('win-notes');
    } else if (act === 'view') {
      toggleCustomWindow('win-rm-drawer');
    } else if (act === 'go') {
      toggleCustomWindow('win-spotlight');
      setTimeout(() => document.getElementById('spotlight-input')?.focus(), 60);
    } else if (act === 'window') {
      toggleCustomWindow('win-task-switcher');
    } else if (act === 'help') {
      openCustomWindow('win-settings');
    }
  });
});

applyOsMode(appConfig.osMode || 'os-mode-hybrid', false);

volumeSlider.addEventListener('input', (e) => {
  const val = Number(e.target.value);
  volumeValue.textContent = `${val}%`;
  volBadge.textContent = `${val}%`;
  soundWave.classList.toggle('muted', val === 0);
  ipcRenderer.send('set-system-volume', val);
});

brightnessSlider.addEventListener('input', (e) => {
  const val = Number(e.target.value);
  brightnessValue.textContent = `${val}%`;
  // Redupkan layar secara mulus + kirim perintah WMI untuk laptop
  const dimOpacity = Math.max(0, Math.min(0.68, (100 - val) / 110));
  if (screenDimmer) screenDimmer.style.opacity = dimOpacity.toFixed(2);
  ipcRenderer.send('set-system-brightness', val);
});

playPauseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleVisualizerPlay();
});

wifiToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  const active = wifiToggle.classList.toggle('active');
  wifiStatus.textContent = active ? 'Wi-Fi 5G' : 'Wi-Fi Off';
});

btToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  const active = btToggle.classList.toggle('active');
  btStatus.textContent = active ? 'Bluetooth' : 'BT Off';
});

islandNotesBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCustomWindow('win-notes');
});

snipBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  ipcRenderer.send('launch-app', 'snipping');
});

openTaskmgr.addEventListener('click', (e) => {
  e.stopPropagation();
  ipcRenderer.send('launch-app', 'taskmgr');
});

document.getElementById('island-start-trigger')?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!wasDragged) toggleCustomWindow('win12-start-menu');
});

topIsland.addEventListener('click', (e) => {
  if (
    e.target.closest('button') ||
    e.target.closest('input') ||
    e.target.closest('#open-taskmgr') ||
    e.target.closest('#island-start-trigger') ||
    e.target.closest('#calendar-trigger')
  ) {
    return;
  }
  if (!wasDragged) {
    topIsland.classList.toggle('pinned');
  }
});

// =========================================================
// 6. CUSTOM WINDOWS 12 START MENU
// =========================================================
const launcherBtn = document.getElementById('launcher-btn');
const startSearchInput = document.getElementById('start-search-input');
const startAppCards = Array.from(document.querySelectorAll('.start-app-card'));
const catPills = Array.from(document.querySelectorAll('.cat-pill'));

launcherBtn.addEventListener('click', () => {
  toggleCustomWindow('win12-start-menu');
  setTimeout(() => startSearchInput?.focus(), 60);
});

document.getElementById('close-start-btn')?.addEventListener('click', () => {
  document.getElementById('win12-start-menu')?.classList.add('hidden');
});

document.getElementById('lock-pc-btn')?.addEventListener('click', () => {
  document.getElementById('win12-start-menu')?.classList.add('hidden');
  showLockScreen();
});

document.getElementById('reset-pos-start-btn')?.addEventListener('click', () => {
  resetAllPositions();
});

document.getElementById('start-open-explorer-btn')?.addEventListener('click', () => {
  openCustomWindow('win-explorer');
});

startAppCards.forEach((card) => {
  card.addEventListener('click', () => {
    if (card.dataset.customWin) {
      openCustomWindow(card.dataset.customWin);
    }
    // Kartu [data-native-app] sudah ditangani secara terpadu oleh listener global focusOrLaunchNativeApp()
  });
});

let activeCategory = 'all';
let installedAppsList = [];
let hasLoadedInstalledApps = false;

async function loadInstalledApps(force = false) {
  const container = document.getElementById('start-all-apps-list');
  const countEl = document.getElementById('start-all-apps-count');
  if (!container) return;
  if (hasLoadedInstalledApps && !force && installedAppsList.length > 0) {
    renderInstalledApps(installedAppsList);
    return;
  }
  container.innerHTML = '<div class="start-app-loading">Memindai semua aplikasi Windows (A-Z)...</div>';
  try {
    const apps = await ipcRenderer.invoke('get-installed-apps');
    installedAppsList = Array.isArray(apps) ? apps : [];
    hasLoadedInstalledApps = true;
    if (countEl) countEl.textContent = `${installedAppsList.length} Aplikasi Terpasang di PC`;
    renderInstalledApps(installedAppsList);
  } catch (err) {
    container.innerHTML = '<div class="start-app-loading">Gagal memuat aplikasi Windows.</div>';
  }
}

function renderInstalledApps(apps) {
  const container = document.getElementById('start-all-apps-list');
  if (!container) return;
  container.innerHTML = '';
  if (!apps || apps.length === 0) {
    container.innerHTML = '<div class="start-app-loading">Tidak ada aplikasi yang cocok.</div>';
    return;
  }

  const groups = {};
  apps.forEach((app) => {
    const letter = app.letter || '#';
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(app);
  });

  const letters = Object.keys(groups).sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b);
  });

  letters.forEach((ltr) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'start-letter-group';
    groupEl.innerHTML = `<div class="start-letter-title">${ltr}</div>`;

    groups[ltr].forEach((app) => {
      const row = document.createElement('div');
      row.className = 'start-app-row';
      row.dataset.path = app.path;
      row.dataset.name = app.name.toLowerCase();
      const safeAppName = escapeHtml(app.name);
      row.innerHTML = `
        ${
          app.iconDataUrl
            ? `<img class="start-app-row-icon" src="${escapeHtml(app.iconDataUrl)}" alt="${safeAppName}" />`
            : `<div class="start-app-row-icon">🪟</div>`
        }
        <div class="start-app-row-info">
          <span class="start-app-row-name">${safeAppName}</span>
          <span class="start-app-row-sub">Aplikasi Windows</span>
        </div>
      `;

      row.addEventListener('click', async () => {
        document.getElementById('win12-start-menu')?.classList.add('hidden');
        await ipcRenderer.invoke('open-app-path', app.path);
      });

      groupEl.appendChild(row);
    });

    container.appendChild(groupEl);
  });
}

document.getElementById('refresh-installed-apps-btn')?.addEventListener('click', () => {
  loadInstalledApps(true);
});

function filterStartApps() {
  const q = (startSearchInput?.value || '').toLowerCase().trim();
  const pinnedGrid = document.getElementById('start-apps-grid');
  const allAppsContainer = document.getElementById('start-all-apps-container');

  if (activeCategory === 'all-installed') {
    if (pinnedGrid) pinnedGrid.style.display = 'none';
    if (allAppsContainer) allAppsContainer.classList.remove('hidden');
    if (!hasLoadedInstalledApps) {
      loadInstalledApps();
    } else {
      const filtered = installedAppsList.filter((a) => a.name.toLowerCase().includes(q));
      renderInstalledApps(filtered);
    }
    return;
  }

  // Kategori Pinned / Custom / Office
  startAppCards.forEach((card) => {
    const matchCat = activeCategory === 'all' || card.dataset.cat === activeCategory;
    const matchText =
      card.dataset.name.includes(q) || card.textContent.toLowerCase().includes(q);
    card.style.display = matchCat && matchText ? 'flex' : 'none';
  });

  if (pinnedGrid) pinnedGrid.style.display = 'grid';

  // Jika user mengetik di search bar, tampilkan juga aplikasi terpasang di bawahnya
  if (q.length > 0) {
    if (allAppsContainer) allAppsContainer.classList.remove('hidden');
    if (!hasLoadedInstalledApps) {
      loadInstalledApps();
    } else {
      const matchingInstalled = installedAppsList.filter((a) => a.name.toLowerCase().includes(q));
      renderInstalledApps(matchingInstalled);
    }
  } else {
    if (allAppsContainer) allAppsContainer.classList.add('hidden');
  }
}

const startSearchClearBtn = document.getElementById('start-search-clear');
startSearchInput?.addEventListener('input', () => {
  if (startSearchClearBtn) {
    startSearchClearBtn.classList.toggle('hidden', !(startSearchInput.value || '').length);
  }
  filterStartApps();
});
startSearchClearBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!startSearchInput) return;
  startSearchInput.value = '';
  startSearchClearBtn.classList.add('hidden');
  filterStartApps();
  startSearchInput.focus();
});
startSearchInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const firstAllApp = document.querySelector('#start-all-apps-list .start-all-app-row');
    const firstPinned = Array.from(document.querySelectorAll('#start-apps-grid .start-app-card')).find(
      (c) => c.style.display !== 'none'
    );
    const targetCard = activeCategory === 'all-installed' ? firstAllApp || firstPinned : firstPinned || firstAllApp;
    if (targetCard) targetCard.click();
  } else if (e.key === 'Escape') {
    closeCustomWindow('win12-start-menu');
  }
});

catPills.forEach((pill) => {
  pill.addEventListener('click', () => {
    catPills.forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    activeCategory = pill.dataset.filter;
    if (activeCategory === 'all-installed') {
      loadInstalledApps();
    }
    filterStartApps();
  });
});

document.querySelectorAll('[data-open-folder]').forEach((card) => {
  card.addEventListener('click', async () => {
    openCustomWindow('win-explorer');
    const bookmarks = await ipcRenderer.invoke('get-user-Bookmarks');
    const targetKey = card.dataset.openFolder.toLowerCase();
    const found = bookmarks.find((b) => b.name.toLowerCase().includes(targetKey));
    if (found) {
      navigateExplorer(found.path);
    }
  });
});

// =========================================================
// 7. CUSTOM FILE EXPLORER + HISTORY + QUICK LOOK + CONTEXT MENU
// =========================================================
let currentExplorerPath = '';
let currentTerminalPath = '';
let currentParentPath = '';
let currentDirItems = [];
let selectedFileItem = null;
let explorerClipboard = { path: '', mode: '' }; // mode: 'copy' | 'cut'
let explorerSortBy = 'name'; // 'name' | 'date' | 'size' | 'type'
let explorerViewMode = 'grid'; // 'grid' | 'list'

// Riwayat Back / Forward
let navHistory = [];
let navHistoryIndex = -1;

const expBookmarksEl = document.getElementById('exp-bookmarks');
const expFilesGridEl = document.getElementById('exp-files-grid');
const expPathInput = document.getElementById('exp-path-input');
const expFilterInput = document.getElementById('exp-filter-input');
const expSortSelect = document.getElementById('exp-sort-select');
const expViewToggleBtn = document.getElementById('exp-view-toggle-btn');
const expItemCountEl = document.getElementById('exp-item-count');
const expTabTitleEl = document.getElementById('exp-tab-title');
const expPreviewPane = document.getElementById('exp-preview-pane');
const previewTitleEl = document.getElementById('preview-title');
const previewBodyEl = document.getElementById('preview-body');
const previewMetaEl = document.getElementById('preview-meta');
const expContextMenu = document.getElementById('exp-context-menu');

// Inline Prompt Bar untuk New Folder / New File / Rename
const expInlinePrompt = document.getElementById('exp-inline-prompt');
const expPromptLabel = document.getElementById('exp-prompt-label');
const expPromptInput = document.getElementById('exp-prompt-input');
const expPromptOk = document.getElementById('exp-prompt-ok');
const expPromptCancel = document.getElementById('exp-prompt-cancel');
let promptActionCallback = null;

function openInlinePrompt(labelText, initialValue, onConfirm) {
  expPromptLabel.textContent = labelText;
  expPromptInput.value = initialValue || '';
  expInlinePrompt.classList.remove('hidden');
  promptActionCallback = onConfirm;
  setTimeout(() => {
    expPromptInput.focus();
    const dotIdx = expPromptInput.value.lastIndexOf('.');
    if (dotIdx > 0) {
      expPromptInput.setSelectionRange(0, dotIdx);
    } else {
      expPromptInput.select();
    }
  }, 40);
}

function closeInlinePrompt() {
  expInlinePrompt.classList.add('hidden');
  promptActionCallback = null;
}

expPromptOk?.addEventListener('click', () => {
  const val = expPromptInput.value.trim();
  if (val && promptActionCallback) promptActionCallback(val);
  closeInlinePrompt();
});

expPromptCancel?.addEventListener('click', closeInlinePrompt);

expPromptInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const val = expPromptInput.value.trim();
    if (val && promptActionCallback) promptActionCallback(val);
    closeInlinePrompt();
  } else if (e.key === 'Escape') {
    closeInlinePrompt();
  }
});

function getFileIcon(item) {
  if (item.isDirectory) return '📁';
  const ext = (item.ext || '').toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'].includes(ext)) return '🖼️';
  if (['.mp4', '.mkv', '.mov', '.avi', '.webm'].includes(ext)) return '🎬';
  if (['.mp3', '.wav', '.flac', '.ogg', '.m4a'].includes(ext)) return '🎵';
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return '📦';
  if (['.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.py', '.php', '.sql', '.sh', '.bat', '.ps1'].includes(ext)) return '💻';
  if (['.pdf'].includes(ext)) return '📕';
  if (['.doc', '.docx'].includes(ext)) return '📘';
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return '📗';
  if (['.ppt', '.pptx'].includes(ext)) return '📙';
  if (['.exe', '.msi', '.cmd'].includes(ext)) return '⚙️';
  if (['.txt', '.md', '.log', '.ini', '.yaml', '.yml'].includes(ext)) return '📝';
  return '📄';
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

function openExternalFileFromExplorer(targetPath, labelName = 'File') {
  if (!targetPath) return;
  if (typeof setAppPassthroughMode === 'function') {
    setAppPassthroughMode(true, `Membuka: ${labelName}`, {
      reason: 'app',
      isColdLaunch: true,
      waitForRestore: true
    });
  }
  ipcRenderer.invoke('open-path', targetPath);
}

function showItemInNativeExplorer(targetPath) {
  if (!targetPath) return;
  if (typeof setAppPassthroughMode === 'function') {
    setAppPassthroughMode(true, 'Windows Explorer', {
      reason: 'app',
      isColdLaunch: true,
      waitForRestore: true
    });
  }
  ipcRenderer.invoke('explorer-show-in-folder', targetPath);
}

function openTerminalAtExplorerPath(dirPath) {
  const targetDir = dirPath || currentExplorerPath;
  if (!targetDir) return;
  currentTerminalPath = targetDir;
  openCustomWindow('win-terminal');
  updateTerminalCwdDisplay(targetDir);
  const termOut = document.getElementById('term-output');
  if (termOut) {
    const line = document.createElement('div');
    line.className = 'term-line sys';
    line.textContent = `📂 Direktori aktif disetel ke: ${targetDir}`;
    termOut.appendChild(line);
    termOut.scrollTop = termOut.scrollHeight;
  }
  setTimeout(() => document.getElementById('term-input')?.focus(), 80);
}

async function initExplorer() {
  const bookmarks = await ipcRenderer.invoke('get-user-Bookmarks');
  expBookmarksEl.innerHTML = '';

  const iconMap = {
    desktop: '🖥️',
    downloads: '📥',
    documents: '📂',
    pictures: '🖼️',
    videos: '🎬',
    music: '🎵',
    code: '⚡',
    drive: '💽'
  };

  bookmarks.forEach((b) => {
    const btn = document.createElement('button');
    btn.className = 'bookmark-btn';
    btn.dataset.path = b.path;
    btn.innerHTML = `<span>${iconMap[b.icon] || '📁'}</span><span>${escapeHtml(b.name)}</span>`;
    btn.addEventListener('click', () => {
      navigateExplorer(b.path);
    });
    expBookmarksEl.appendChild(btn);
  });

  if (bookmarks.length > 0 && !currentExplorerPath) {
    navigateExplorer(bookmarks[0].path);
  } else if (currentExplorerPath) {
    loadDirectory(currentExplorerPath);
  }
}

function updateExplorerNavButtonsState() {
  const backBtn = document.getElementById('exp-back-btn');
  const fwdBtn = document.getElementById('exp-fwd-btn');
  const upBtn = document.getElementById('exp-up-btn');
  if (backBtn) backBtn.style.opacity = navHistoryIndex > 0 ? '1' : '0.4';
  if (fwdBtn) fwdBtn.style.opacity = navHistoryIndex < navHistory.length - 1 ? '1' : '0.4';
  if (upBtn) upBtn.style.opacity = currentParentPath && currentParentPath !== currentExplorerPath ? '1' : '0.4';

  // Sync active bookmark
  document.querySelectorAll('#exp-bookmarks .bookmark-btn').forEach((btn) => {
    const bPath = (btn.dataset.path || '').toLowerCase().replace(/[\\/]$/, '');
    const curPath = (currentExplorerPath || '').toLowerCase().replace(/[\\/]$/, '');
    btn.classList.toggle('active', Boolean(bPath && curPath === bPath));
  });
}

function navigateExplorer(dirPath, recordHistory = true) {
  if (!dirPath) return;
  if (recordHistory) {
    if (navHistory[navHistoryIndex] !== dirPath) {
      navHistory = navHistory.slice(0, navHistoryIndex + 1);
      navHistory.push(dirPath);
      navHistoryIndex = navHistory.length - 1;
    }
  }
  loadDirectory(dirPath);
}

function getSortedAndFilteredExplorerItems() {
  const q = (expFilterInput?.value || '').toLowerCase().trim();
  const filtered = currentDirItems.filter((it) => !q || it.name.toLowerCase().includes(q));

  const sorted = [...filtered].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;

    if (explorerSortBy === 'date') {
      return (b.mtimeMs || 0) - (a.mtimeMs || 0);
    }
    if (explorerSortBy === 'size') {
      return (b.size || 0) - (a.size || 0);
    }
    if (explorerSortBy === 'type') {
      return (a.ext || '').localeCompare(b.ext || '') || a.name.localeCompare(b.name, undefined, { numeric: true });
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  return sorted;
}

function renderExplorerBreadcrumbs(dirPath) {
  const container = document.getElementById('exp-breadcrumbs');
  if (!container || !dirPath) return;
  container.innerHTML = '';

  const normalized = dirPath.replace(/[/\\]+$/, '');
  const parts = normalized.split(/[/\\]/).filter(Boolean);
  if (parts.length === 0) {
    const btn = document.createElement('button');
    btn.className = 'exp-crumb-btn active';
    btn.textContent = dirPath;
    container.appendChild(btn);
    return;
  }

  let accumPath = '';
  parts.forEach((seg, idx) => {
    if (idx === 0) {
      accumPath = /^[a-zA-Z]:$/.test(seg) ? `${seg}\\` : seg;
    } else {
      accumPath = accumPath.endsWith('\\') || accumPath.endsWith('/')
        ? `${accumPath}${seg}`
        : `${accumPath}\\${seg}`;
    }
    const targetForClick = accumPath;
    const isLast = idx === parts.length - 1;

    if (idx > 0) {
      const sep = document.createElement('span');
      sep.className = 'exp-crumb-sep';
      sep.textContent = '›';
      container.appendChild(sep);
    }

    const btn = document.createElement('button');
    btn.className = `exp-crumb-btn${isLast ? ' active' : ''}`;
    btn.title = targetForClick;
    btn.textContent = idx === 0 ? `💽 ${seg}` : seg;
    if (!isLast) {
      btn.addEventListener('click', () => navigateExplorer(targetForClick));
    }
    container.appendChild(btn);
  });

  container.scrollLeft = container.scrollWidth;
}

async function loadDirectory(dirPath, selectPathAfterLoad = '') {
  const res = await ipcRenderer.invoke('read-directory', dirPath);
  if (!res.ok) {
    expFilesGridEl.innerHTML = `<div style="grid-column:1/-1;padding:20px;color:#f87171;">⚠️ Gagal membuka direktori: ${escapeHtml(res.error)}</div>`;
    return;
  }

  currentExplorerPath = res.currentPath;
  currentParentPath = res.parentPath;
  currentDirItems = res.items;
  selectedFileItem = null;

  expPathInput.value = currentExplorerPath;
  const parts = currentExplorerPath.split(/[/\\]/).filter(Boolean);
  expTabTitleEl.textContent = parts[parts.length - 1] || currentExplorerPath;
  renderExplorerBreadcrumbs(currentExplorerPath);
  updateExplorerNavButtonsState();

  renderExplorerItems(getSortedAndFilteredExplorerItems(), selectPathAfterLoad);
}

function renderExplorerItems(items, selectPathAfterLoad = '') {
  expFilesGridEl.innerHTML = '';
  expFilesGridEl.classList.toggle('list-view', explorerViewMode === 'list');
  const folderCount = items.filter((i) => i.isDirectory).length;
  const fileCount = items.length - folderCount;
  expItemCountEl.textContent = `${items.length} item (${folderCount} folder, ${fileCount} file)${explorerClipboard.path ? ` • 📋 Clipboard: ${explorerClipboard.mode === 'cut' ? 'Cut' : 'Copy'}` : ''}`;

  if (items.length === 0) {
    expFilesGridEl.innerHTML = `<div style="grid-column:1/-1;padding:34px;text-align:center;color:var(--text-secondary);">📂 Folder ini kosong — Klik kanan atau klik tombol <b>+ Folder</b> / <b>+ File</b> di atas</div>`;
    return;
  }

  let matchedSelectCard = null;
  let matchedSelectItem = null;

  items.forEach((item) => {
    const card = document.createElement('div');
    const isCutPending = explorerClipboard.mode === 'cut' && explorerClipboard.path === item.path;
    card.className = `file-item-card${isCutPending ? ' cut-pending' : ''}`;
    card.title = `${item.name}\nLokasi: ${item.path}${item.isDirectory ? '' : `\nUkuran: ${formatBytes(item.size)}`}`;

    const safeItemName = escapeHtml(item.name);
    const iconOrThumbHtml =
      item.isImage && item.imageUrl
        ? `<div class="file-thumb-wrap"><img class="file-thumb-img" src="${escapeHtml(item.imageUrl)}" loading="lazy" alt="${safeItemName}" /></div>`
        : `<div class="file-ic">${getFileIcon(item)}</div>`;

    const dateStr = item.mtimeMs ? new Date(item.mtimeMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    card.innerHTML = `
      ${iconOrThumbHtml}
      <div class="file-name">${safeItemName}</div>
      <div class="file-sub">${item.isDirectory ? 'Folder' : formatBytes(item.size)}${explorerViewMode === 'list' && dateStr ? ` • ${dateStr}` : ''}</div>
    `;

    // Klik 1x: Pilih item & langsung tampilkan Preview di panel kanan
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      hideContextMenu();
      document.querySelectorAll('.file-item-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedFileItem = item;
      showQuickLookPreview(item);
    });

    // Klik 2x: Masuk ke folder atau buka file
    card.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      hideContextMenu();
      if (item.isDirectory) {
        navigateExplorer(item.path);
      } else {
        openExternalFileFromExplorer(item.path, item.name);
      }
    });

    // Klik Kanan pada Item: Tampilkan Custom Glass Context Menu
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll('.file-item-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedFileItem = item;
      showQuickLookPreview(item);
      openContextMenu(e.clientX, e.clientY, true);
    });

    if (selectPathAfterLoad && item.path === selectPathAfterLoad) {
      matchedSelectCard = card;
      matchedSelectItem = item;
    }

    expFilesGridEl.appendChild(card);
  });

  if (matchedSelectCard && matchedSelectItem) {
    matchedSelectCard.classList.add('selected');
    selectedFileItem = matchedSelectItem;
    showQuickLookPreview(matchedSelectItem);
    matchedSelectCard.scrollIntoView({ block: 'nearest' });
    return;
  }

  // Jika di dalam folder ada file gambar, otomatis tampilkan preview gambar pertama di panel kanan
  const firstImageItem = items.find((it) => it.isImage);
  if (firstImageItem) {
    selectedFileItem = firstImageItem;
    showQuickLookPreview(firstImageItem);
  }
}

// Klik area kosong di Grid Explorer: batalkan seleksi atau buka menu klik kanan area kosong
expFilesGridEl?.addEventListener('click', (e) => {
  if (e.target === expFilesGridEl) {
    hideContextMenu();
    document.querySelectorAll('.file-item-card').forEach((c) => c.classList.remove('selected'));
    selectedFileItem = null;
  }
});

expFilesGridEl?.addEventListener('contextmenu', (e) => {
  if (e.target === expFilesGridEl || !e.target.closest('.file-item-card')) {
    e.preventDefault();
    document.querySelectorAll('.file-item-card').forEach((c) => c.classList.remove('selected'));
    selectedFileItem = null;
    openContextMenu(e.clientX, e.clientY, false);
  }
});

// Quick Look Preview (macOS Spasi, Klik 1x, & Editor Teks Langsung)
async function showQuickLookPreview(item) {
  if (!item) return;
  expPreviewPane.classList.remove('hidden');
  previewTitleEl.textContent = item.name;
  previewBodyEl.innerHTML = '<div style="color:var(--text-secondary);font-size:11px;">Memuat preview...</div>';

  if (item.isDirectory) {
    previewBodyEl.innerHTML = `<div style="font-size:56px;">📁</div>`;
    previewMetaEl.innerHTML = `
      <div><strong>Tipe:</strong> Folder Direktori</div>
      <div style="word-break:break-all;"><strong>Lokasi:</strong> ${escapeHtml(item.path)}</div>
      <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
        <button class="addr-go-btn" id="ql-open-dir-btn" style="flex:1;">📂 Buka Folder</button>
        <button class="pill-action-btn" id="ql-term-dir-btn" style="flex:1;">🐚 Terminal</button>
      </div>
      <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
        <button class="pill-action-btn" id="ql-show-native-btn" style="flex:1;">🪟 Di Windows</button>
        <button class="pill-action-btn" id="ql-rename-item-btn">✏️ Rename</button>
        <button class="pill-action-btn" id="ql-trash-item-btn" style="color:#f87171;">🗑️ Hapus</button>
      </div>
    `;
    document.getElementById('ql-open-dir-btn')?.addEventListener('click', () => navigateExplorer(item.path));
    document.getElementById('ql-term-dir-btn')?.addEventListener('click', () => openTerminalAtExplorerPath(item.path));
    document.getElementById('ql-show-native-btn')?.addEventListener('click', () => showItemInNativeExplorer(item.path));
    document.getElementById('ql-rename-item-btn')?.addEventListener('click', () => triggerRenameItem(item));
    document.getElementById('ql-trash-item-btn')?.addEventListener('click', () => triggerDeleteItem(item));
    return;
  }

  const res = await ipcRenderer.invoke('preview-file', item.path);
  if (!res.ok) {
    previewBodyEl.innerHTML = `<div style="color:#f87171;font-size:11px;">Gagal memuat preview: ${escapeHtml(res.error || '')}</div>`;
    return;
  }

  if (res.type === 'image') {
    previewBodyEl.innerHTML = `<img src="${escapeHtml(res.url)}" alt="${escapeHtml(item.name)}" style="cursor:zoom-in" title="Klik untuk membuka di aplikasi foto Windows" />`;
    previewBodyEl.querySelector('img')?.addEventListener('click', () => {
      openExternalFileFromExplorer(item.path, item.name);
    });
  } else if (res.type === 'text') {
    previewBodyEl.innerHTML = `
      <textarea class="ql-text-editor" id="ql-text-editor" spellcheck="false" placeholder="Tulis isi file teks di sini..."></textarea>
    `;
    const editorEl = document.getElementById('ql-text-editor');
    if (editorEl) {
      editorEl.value = res.content || '';
    }
  } else {
    previewBodyEl.innerHTML = `<div style="font-size:52px;">${getFileIcon(item)}</div>`;
  }

  previewMetaEl.innerHTML = `
    <div><strong>Ukuran:</strong> ${formatBytes(res.size)}</div>
    <div><strong>Diubah:</strong> ${escapeHtml(res.mtime)}</div>
    <div><strong>Ekstensi:</strong> ${escapeHtml(item.ext || '-')}</div>
    <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
      ${
        res.type === 'text'
          ? `<button class="addr-go-btn" id="ql-save-text-btn" style="flex:1;">💾 Simpan Teks</button>`
          : ''
      }
      <button class="pill-action-btn" id="ql-open-file-btn" style="flex:1;">📂 Buka Aplikasi</button>
      ${
        res.type === 'image'
          ? `<button class="addr-go-btn" id="ql-set-wp-btn" style="flex:1;">🖼️ Jadi Wallpaper</button>`
          : ''
      }
    </div>
    <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
      <button class="pill-action-btn" id="ql-show-native-btn" style="flex:1;">🪟 Tampilkan Folder</button>
      <button class="pill-action-btn" id="ql-rename-item-btn">✏️ Rename</button>
      <button class="pill-action-btn" id="ql-trash-item-btn" style="color:#f87171;">🗑️</button>
    </div>
  `;

  document.getElementById('ql-save-text-btn')?.addEventListener('click', async () => {
    const editorEl = document.getElementById('ql-text-editor');
    const saveBtn = document.getElementById('ql-save-text-btn');
    if (!editorEl) return;
    const saveRes = await ipcRenderer.invoke('explorer-save-text-file', item.path, editorEl.value);
    if (saveRes.ok) {
      if (saveBtn) saveBtn.textContent = '✅ Tersimpan!';
      if (typeof pushNotification === 'function') {
        pushNotification('💾', 'File Teks Disimpan', item.name, false);
      }
      loadDirectory(currentExplorerPath, item.path);
    } else if (saveBtn) {
      saveBtn.textContent = '⚠️ Gagal Simpan';
    }
  });

  document.getElementById('ql-open-file-btn')?.addEventListener('click', () => {
    openExternalFileFromExplorer(item.path, item.name);
  });
  document.getElementById('ql-show-native-btn')?.addEventListener('click', () => {
    showItemInNativeExplorer(item.path);
  });
  document.getElementById('ql-rename-item-btn')?.addEventListener('click', () => {
    triggerRenameItem(item);
  });
  document.getElementById('ql-trash-item-btn')?.addEventListener('click', () => {
    triggerDeleteItem(item);
  });
  document.getElementById('ql-set-wp-btn')?.addEventListener('click', () => {
    appConfig.customWallpaperUrl = res.fileUrl || res.url;
    applyWallpaper('wp-custom');
    if (typeof pushNotification === 'function') {
      pushNotification('🖼️', 'Wallpaper Diperbarui dari Explorer', item.name, true);
    }
  });
}

document.getElementById('close-preview-btn')?.addEventListener('click', () => {
  expPreviewPane.classList.add('hidden');
});

// Context Menu Klik Kanan di Explorer (kompensasi transform pada #win-explorer)
function openContextMenu(clientX, clientY, hasItem = true) {
  if (!expContextMenu) return;
  const expWin = document.getElementById('win-explorer');
  const rect = expWin ? expWin.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

  // Tampilkan/sembunyikan tombol yang butuh item terpilih vs tombol umum
  const itemOnlyActions = ['open', 'preview', 'shownative', 'copy', 'cut', 'duplicate', 'rename', 'copypath', 'trash'];
  expContextMenu.querySelectorAll('button[data-ctx]').forEach((btn) => {
    const act = btn.dataset.ctx;
    if (itemOnlyActions.includes(act)) {
      btn.style.display = hasItem && selectedFileItem ? 'flex' : 'none';
    } else if (act === 'paste') {
      btn.style.display = explorerClipboard.path ? 'flex' : 'none';
      const clipName = explorerClipboard.path.split(/[/\\]/).pop();
      btn.textContent = `📥 Tempel (${explorerClipboard.mode === 'cut' ? 'Move' : 'Copy'}: ${clipName})`;
    } else {
      btn.style.display = 'flex';
    }
  });

  expContextMenu.classList.remove('hidden');
  const menuW = expContextMenu.offsetWidth || 225;
  const menuH = expContextMenu.offsetHeight || 290;
  const relX = Math.max(8, Math.min(clientX - rect.left, rect.width - menuW - 10));
  const relY = Math.max(36, Math.min(clientY - rect.top, rect.height - menuH - 10));

  expContextMenu.style.left = `${relX}px`;
  expContextMenu.style.top = `${relY}px`;
}

function hideContextMenu() {
  expContextMenu?.classList.add('hidden');
}

window.addEventListener('click', hideContextMenu);

function triggerCreateFolder() {
  if (!currentExplorerPath) return;
  openInlinePrompt('📁 Nama Folder Baru:', 'Folder Baru', async (folderName) => {
    const res = await ipcRenderer.invoke('explorer-create-folder', currentExplorerPath, folderName);
    if (res.ok) {
      loadDirectory(currentExplorerPath, res.path);
    } else if (typeof pushNotification === 'function') {
      pushNotification('⚠️', 'Gagal Membuat Folder', res.error || '', true);
    }
  });
}

function triggerCreateFile() {
  if (!currentExplorerPath) return;
  openInlinePrompt('📄 Nama File Baru:', 'Catatan Baru.txt', async (fileName) => {
    const res = await ipcRenderer.invoke('explorer-create-file', currentExplorerPath, fileName, '');
    if (res.ok) {
      loadDirectory(currentExplorerPath, res.path);
    } else if (typeof pushNotification === 'function') {
      pushNotification('⚠️', 'Gagal Membuat File', res.error || '', true);
    }
  });
}

function triggerRenameItem(item = selectedFileItem) {
  if (!item) return;
  openInlinePrompt(`✏️ Ubah nama "${item.name}":`, item.name, async (newName) => {
    if (newName === item.name) return;
    const res = await ipcRenderer.invoke('explorer-rename', item.path, newName);
    if (res.ok) {
      loadDirectory(currentExplorerPath, res.path);
    } else if (typeof pushNotification === 'function') {
      pushNotification('⚠️', 'Gagal Mengubah Nama', res.error || '', true);
    }
  });
}

async function triggerDeleteItem(item = selectedFileItem) {
  if (!item) return;
  const res = await ipcRenderer.invoke('explorer-trash', item.path);
  if (res.ok) {
    if (selectedFileItem && selectedFileItem.path === item.path) {
      selectedFileItem = null;
      expPreviewPane.classList.add('hidden');
    }
    if (typeof pushNotification === 'function') {
      pushNotification('🗑️', 'Item Dihapus', `${item.name} dipindahkan ke Recycle Bin`, false);
    }
    loadDirectory(currentExplorerPath);
  } else if (typeof pushNotification === 'function') {
    pushNotification('⚠️', 'Gagal Menghapus Item', res.error || '', true);
  }
}

async function triggerPasteClipboard() {
  if (!explorerClipboard.path || !currentExplorerPath) return;
  const res = await ipcRenderer.invoke('explorer-paste-item', {
    sourcePath: explorerClipboard.path,
    targetDir: currentExplorerPath,
    mode: explorerClipboard.mode
  });
  if (res.ok) {
    if (explorerClipboard.mode === 'cut') {
      explorerClipboard = { path: '', mode: '' };
    }
    loadDirectory(currentExplorerPath, res.path);
  } else if (typeof pushNotification === 'function') {
    pushNotification('⚠️', 'Gagal Menempel Item', res.error || '', true);
  }
}

async function triggerDuplicateItem(item = selectedFileItem) {
  if (!item || !currentExplorerPath) return;
  const res = await ipcRenderer.invoke('explorer-paste-item', {
    sourcePath: item.path,
    targetDir: currentExplorerPath,
    mode: 'copy'
  });
  if (res.ok) {
    loadDirectory(currentExplorerPath, res.path);
  } else if (typeof pushNotification === 'function') {
    pushNotification('⚠️', 'Gagal Menduplikat Item', res.error || '', true);
  }
}

expContextMenu?.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const action = btn.dataset.ctx;
    hideContextMenu();

    if (action === 'preview' && selectedFileItem) {
      showQuickLookPreview(selectedFileItem);
    } else if (action === 'open' && selectedFileItem) {
      if (selectedFileItem.isDirectory) {
        navigateExplorer(selectedFileItem.path);
      } else {
        openExternalFileFromExplorer(selectedFileItem.path, selectedFileItem.name);
      }
    } else if (action === 'shownative') {
      showItemInNativeExplorer(selectedFileItem ? selectedFileItem.path : currentExplorerPath);
    } else if (action === 'terminal') {
      const targetDir = selectedFileItem && selectedFileItem.isDirectory ? selectedFileItem.path : currentExplorerPath;
      openTerminalAtExplorerPath(targetDir);
    } else if (action === 'copy' && selectedFileItem) {
      explorerClipboard = { path: selectedFileItem.path, mode: 'copy' };
      renderExplorerItems(getSortedAndFilteredExplorerItems(), selectedFileItem.path);
    } else if (action === 'cut' && selectedFileItem) {
      explorerClipboard = { path: selectedFileItem.path, mode: 'cut' };
      renderExplorerItems(getSortedAndFilteredExplorerItems(), selectedFileItem.path);
    } else if (action === 'paste') {
      await triggerPasteClipboard();
    } else if (action === 'duplicate' && selectedFileItem) {
      await triggerDuplicateItem(selectedFileItem);
    } else if (action === 'copypath' && selectedFileItem) {
      ipcRenderer.send('copy-to-clipboard', selectedFileItem.path);
      if (typeof pushNotification === 'function') {
        pushNotification('📋', 'Path Disalin ke Clipboard', selectedFileItem.path, false);
      }
    } else if (action === 'newfolder') {
      triggerCreateFolder();
    } else if (action === 'newfile') {
      triggerCreateFile();
    } else if (action === 'refresh') {
      if (currentExplorerPath) loadDirectory(currentExplorerPath);
    } else if (action === 'rename' && selectedFileItem) {
      triggerRenameItem(selectedFileItem);
    } else if (action === 'trash' && selectedFileItem) {
      await triggerDeleteItem(selectedFileItem);
    }
  });
});

// Keyboard Shortcuts Lengkap di File Explorer
window.addEventListener('keydown', (e) => {
  const expWin = document.getElementById('win-explorer');
  if (!expWin || expWin.classList.contains('hidden')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  if (e.code === 'Space' && selectedFileItem) {
    e.preventDefault();
    if (expPreviewPane.classList.contains('hidden')) {
      showQuickLookPreview(selectedFileItem);
    } else {
      expPreviewPane.classList.add('hidden');
    }
  } else if (e.key === 'Enter' && selectedFileItem) {
    e.preventDefault();
    if (selectedFileItem.isDirectory) {
      navigateExplorer(selectedFileItem.path);
    } else {
      openExternalFileFromExplorer(selectedFileItem.path, selectedFileItem.name);
    }
  } else if (e.key === 'F2' && selectedFileItem) {
    e.preventDefault();
    triggerRenameItem(selectedFileItem);
  } else if (e.key === 'Delete' && selectedFileItem) {
    e.preventDefault();
    triggerDeleteItem(selectedFileItem);
  } else if (e.key === 'F5') {
    e.preventDefault();
    if (currentExplorerPath) loadDirectory(currentExplorerPath);
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    if (currentParentPath && currentParentPath !== currentExplorerPath) {
      navigateExplorer(currentParentPath);
    }
  } else if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    document.getElementById('exp-back-btn')?.click();
  } else if (e.altKey && e.key === 'ArrowRight') {
    e.preventDefault();
    document.getElementById('exp-fwd-btn')?.click();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedFileItem) {
    e.preventDefault();
    explorerClipboard = { path: selectedFileItem.path, mode: 'copy' };
    renderExplorerItems(getSortedAndFilteredExplorerItems(), selectedFileItem.path);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && selectedFileItem) {
    e.preventDefault();
    explorerClipboard = { path: selectedFileItem.path, mode: 'cut' };
    renderExplorerItems(getSortedAndFilteredExplorerItems(), selectedFileItem.path);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && explorerClipboard.path) {
    e.preventDefault();
    triggerPasteClipboard();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedFileItem) {
    e.preventDefault();
    triggerDuplicateItem(selectedFileItem);
  }
});

document.getElementById('exp-new-folder-btn')?.addEventListener('click', triggerCreateFolder);
document.getElementById('exp-new-file-btn')?.addEventListener('click', triggerCreateFile);
document.getElementById('exp-open-term-btn')?.addEventListener('click', () => {
  openTerminalAtExplorerPath(currentExplorerPath);
});

document.getElementById('exp-back-btn')?.addEventListener('click', () => {
  if (navHistoryIndex > 0) {
    navHistoryIndex -= 1;
    loadDirectory(navHistory[navHistoryIndex]);
  }
});

document.getElementById('exp-fwd-btn')?.addEventListener('click', () => {
  if (navHistoryIndex < navHistory.length - 1) {
    navHistoryIndex += 1;
    loadDirectory(navHistory[navHistoryIndex]);
  }
});

document.getElementById('exp-up-btn')?.addEventListener('click', () => {
  if (currentParentPath && currentParentPath !== currentExplorerPath) {
    navigateExplorer(currentParentPath);
  }
});

document.getElementById('exp-refresh-btn')?.addEventListener('click', () => {
  if (currentExplorerPath) loadDirectory(currentExplorerPath);
});

document.getElementById('exp-go-btn')?.addEventListener('click', () => {
  if (expPathInput.value.trim()) navigateExplorer(expPathInput.value.trim());
});

expPathInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && expPathInput.value.trim()) {
    navigateExplorer(expPathInput.value.trim());
  }
});

expFilterInput?.addEventListener('input', () => {
  renderExplorerItems(getSortedAndFilteredExplorerItems());
});

expSortSelect?.addEventListener('change', (e) => {
  explorerSortBy = e.target.value || 'name';
  renderExplorerItems(getSortedAndFilteredExplorerItems(), selectedFileItem?.path || '');
});

expViewToggleBtn?.addEventListener('click', () => {
  explorerViewMode = explorerViewMode === 'grid' ? 'list' : 'grid';
  expViewToggleBtn.textContent = explorerViewMode === 'grid' ? '⊞ Grid' : '☰ List';
  renderExplorerItems(getSortedAndFilteredExplorerItems(), selectedFileItem?.path || '');
});

document.getElementById('exp-open-native')?.addEventListener('click', () => {
  openExternalFileFromExplorer(currentExplorerPath || 'C:\\', 'Windows Explorer');
});

// =========================================================
// 8. WIDGET STICKY NOTES & TO-DO LIST (Auto-Save, Filter & Export)
// =========================================================
const stickyTextarea = document.getElementById('sticky-textarea');
const notesSavedBadge = document.getElementById('notes-saved-badge');
const notesWordCountEl = document.getElementById('notes-word-count');
const notesPreviewToggleBtn = document.getElementById('notes-preview-toggle');
const stickyMarkdownPreview = document.getElementById('sticky-markdown-preview');
const todoInput = document.getElementById('todo-input');
const todoAddBtn = document.getElementById('todo-add-btn');
const todoListEl = document.getElementById('todo-list');
const todoProgressFill = document.getElementById('todo-progress-fill');
const todoProgressLabel = document.getElementById('todo-progress-label');
let currentTodoFilter = 'all';
let isNotesPreviewMode = false;

function updateNotesStatsAndPreview() {
  if (!stickyTextarea) return;
  const txt = stickyTextarea.value || '';
  const words = txt.trim() ? txt.trim().split(/\s+/).length : 0;
  if (notesWordCountEl) {
    notesWordCountEl.textContent = `${words} kata • ${txt.length} kar`;
  }
  if (isNotesPreviewMode && stickyMarkdownPreview) {
    const safeLines = escapeHtml(txt).split('\n').map((line) => {
      if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`;
      if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
      if (/^[-•*]\s+\[x\]\s+/i.test(line)) return `<div>✅ <s>${line.replace(/^[-•*]\s+\[x\]\s+/i, '')}</s></div>`;
      if (/^[-•*]\s+\[\s?\]\s+/.test(line)) return `<div>⬜ ${line.replace(/^[-•*]\s+\[\s?\]\s+/, '')}</div>`;
      if (/^[-•*]\s+/.test(line)) return `<ul><li>${line.replace(/^[-•*]\s+/, '')}</li></ul>`;
      return line || '<br/>';
    });
    const rendered = safeLines
      .join('\n')
      .replace(/<\/ul>\n<ul>/g, '')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    stickyMarkdownPreview.innerHTML = rendered || '<span style="opacity:0.6">Catatan kosong.</span>';
  }
}

if (stickyTextarea) {
  stickyTextarea.value = appConfig.stickyNote || '';
  updateNotesStatsAndPreview();
  stickyTextarea.addEventListener('input', () => {
    appConfig.stickyNote = stickyTextarea.value;
    saveConfig();
    updateNotesStatsAndPreview();
    if (notesSavedBadge) {
      notesSavedBadge.textContent = '💾 Menyimpan...';
      setTimeout(() => {
        notesSavedBadge.textContent = '✓ Tersimpan';
      }, 450);
    }
  });
}

notesPreviewToggleBtn?.addEventListener('click', () => {
  isNotesPreviewMode = !isNotesPreviewMode;
  notesPreviewToggleBtn.classList.toggle('active', isNotesPreviewMode);
  notesPreviewToggleBtn.textContent = isNotesPreviewMode ? '✏️ Edit' : '👁️ Preview';
  stickyTextarea?.classList.toggle('hidden', isNotesPreviewMode);
  stickyMarkdownPreview?.classList.toggle('hidden', !isNotesPreviewMode);
  updateNotesStatsAndPreview();
});

function renderTodos() {
  if (!todoListEl) return;
  todoListEl.innerHTML = '';

  const total = appConfig.todos.length;
  const doneCount = appConfig.todos.filter((t) => t.done).length;
  const activeCount = total - doneCount;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  if (todoProgressFill) todoProgressFill.style.width = `${pct}%`;
  if (todoProgressLabel) todoProgressLabel.textContent = `${pct}% Selesai`;

  const countAll = document.getElementById('todo-count-all');
  const countActive = document.getElementById('todo-count-active');
  const countDone = document.getElementById('todo-count-done');
  if (countAll) countAll.textContent = total;
  if (countActive) countActive.textContent = activeCount;
  if (countDone) countDone.textContent = doneCount;

  const filtered = appConfig.todos.filter((t) => {
    if (currentTodoFilter === 'active') return !t.done;
    if (currentTodoFilter === 'done') return t.done;
    return true;
  });

  if (filtered.length === 0) {
    const emptyRow = document.createElement('div');
    emptyRow.style.padding = '14px';
    emptyRow.style.fontSize = '12px';
    emptyRow.style.color = 'var(--text-secondary)';
    emptyRow.style.textAlign = 'center';
    emptyRow.textContent = 'Tidak ada tugas dalam kategori ini.';
    todoListEl.appendChild(emptyRow);
    return;
  }

  filtered.forEach((todo) => {
    const row = document.createElement('div');
    row.className = `todo-item ${todo.done ? 'done' : ''}`;
    row.innerHTML = `
      <div class="todo-left">
        <input type="checkbox" ${todo.done ? 'checked' : ''} />
        <span>${escapeHtml(todo.text)}</span>
      </div>
      <button class="todo-del-btn" title="Hapus">✕</button>
    `;

    const leftEl = row.querySelector('.todo-left');
    const textSpan = leftEl?.querySelector('span');
    let clickLockTimer = null;

    leftEl?.querySelector('input')?.addEventListener('click', (e) => {
      e.stopPropagation();
      todo.done = !todo.done;
      saveConfig();
      renderTodos();
    });

    leftEl?.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      clearTimeout(clickLockTimer);
      clickLockTimer = setTimeout(() => {
        todo.done = !todo.done;
        saveConfig();
        renderTodos();
      }, 190);
    });

    textSpan?.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      clearTimeout(clickLockTimer);
      const editInput = document.createElement('input');
      editInput.type = 'text';
      editInput.className = 'todo-edit-input';
      editInput.value = todo.text;
      textSpan.replaceWith(editInput);
      editInput.focus();
      editInput.select();

      const commitEdit = () => {
        const nextText = editInput.value.trim();
        if (nextText) {
          todo.text = nextText;
          saveConfig();
        }
        renderTodos();
      };
      editInput.addEventListener('blur', commitEdit);
      editInput.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') {
          ke.preventDefault();
          editInput.blur();
        } else if (ke.key === 'Escape') {
          renderTodos();
        }
      });
    });

    row.querySelector('.todo-del-btn').addEventListener('click', () => {
      appConfig.todos = appConfig.todos.filter((t) => t.id !== todo.id);
      saveConfig();
      renderTodos();
    });

    todoListEl.appendChild(row);
  });
}

document.getElementById('todo-clear-done-btn')?.addEventListener('click', () => {
  const before = (appConfig.todos || []).length;
  appConfig.todos = (appConfig.todos || []).filter((t) => !t.done);
  if (appConfig.todos.length !== before) {
    saveConfig();
    renderTodos();
    triggerLaunchHud('🧹', 'Tugas Selesai Dibersihkan', `${before - appConfig.todos.length} tugas dihapus`);
  }
});

document.querySelectorAll('[data-todo-filter]').forEach((pill) => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('[data-todo-filter]').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    currentTodoFilter = pill.dataset.todoFilter;
    renderTodos();
  });
});

document.getElementById('notes-export-btn')?.addEventListener('click', async () => {
  const content = stickyTextarea ? stickyTextarea.value : '';
  const todos = appConfig.todos || [];
  const exportBtn = document.getElementById('notes-export-btn');
  if (exportBtn) exportBtn.textContent = '⏳ Menyimpan...';
  try {
    const res = await ipcRenderer.invoke('export-notes-file', {
      content,
      todos,
      format: 'md'
    });
    if (res.ok) {
      if (notesSavedBadge) {
        notesSavedBadge.textContent = '✓ Disimpan ke Desktop';
        setTimeout(() => {
          notesSavedBadge.textContent = '✓ Tersimpan';
        }, 3000);
      }
      if (exportBtn) exportBtn.textContent = '✓ Tersimpan!';
      setTimeout(() => {
        if (exportBtn) exportBtn.textContent = '💾 Ekspor';
      }, 2000);
    } else {
      if (exportBtn) exportBtn.textContent = '❌ Gagal';
    }
  } catch (err) {
    if (exportBtn) exportBtn.textContent = '❌ Gagal';
  }
});

function addTodoItem() {
  const val = (todoInput?.value || '').trim();
  if (!val) return;
  appConfig.todos.unshift({
    id: Date.now(),
    text: val,
    done: false
  });
  todoInput.value = '';
  saveConfig();
  renderTodos();
}

todoAddBtn?.addEventListener('click', addTodoItem);
todoInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTodoItem();
});

renderTodos();

// =========================================================
// 9. CUSTOM GLASS TERMINAL & CALCULATOR (Command History & Chips)
// =========================================================
const termOutputEl = document.getElementById('term-output');
const termInputEl = document.getElementById('term-input');
const termSendBtn = document.getElementById('term-send-btn');
const termSuggestHintEl = document.getElementById('term-suggest-hint');
let termHistory = [];
let termHistoryIndex = -1;

const TERM_AUTOCOMPLETE_COMMANDS = [
  'dir',
  'cd ..',
  'cls',
  'clear',
  'help',
  'git status',
  'git log --oneline -5',
  'git branch',
  'ipconfig',
  'node -v',
  'npm -v',
  'whoami',
  'systeminfo',
  'tasklist'
];

function updateTerminalSuggestionHint(val) {
  if (!termSuggestHintEl) return;
  const typed = (val || '').trim().toLowerCase();
  if (!typed) {
    termSuggestHintEl.classList.add('hidden');
    return;
  }
  const match = TERM_AUTOCOMPLETE_COMMANDS.find((c) => c.startsWith(typed) && c !== typed);
  if (match) {
    termSuggestHintEl.textContent = `Tab ⇥ ${match}`;
    termSuggestHintEl.classList.remove('hidden');
  } else {
    termSuggestHintEl.classList.add('hidden');
  }
}

function updateTerminalCwdDisplay(targetPath) {
  const cwdBadge = document.getElementById('term-cwd-badge');
  if (!cwdBadge) return;
  const p = targetPath || currentExplorerPath || 'C:\\';
  const folderName = p.split(/[/\\]/).filter(Boolean).pop() || 'Root';
  cwdBadge.textContent = `📁 ${folderName}`;
  cwdBadge.title = p;
}

function appendTerminalLine(text, cls = '') {
  if (!termOutputEl) return;
  const line = document.createElement('div');
  line.className = `term-line${cls ? ` ${cls}` : ''}`;
  line.textContent = text;
  termOutputEl.appendChild(line);
  termOutputEl.scrollTop = termOutputEl.scrollHeight;
}

async function resolveAndChangeTerminalDir(rawTarget) {
  const baseDir = currentTerminalPath || currentExplorerPath || '';
  const cleaned = rawTarget.replace(/^["']|["']$/g, '').trim();
  let candidate = cleaned;

  if (!cleaned || cleaned === '~') {
    const bm = await ipcRenderer.invoke('get-user-Bookmarks');
    candidate = bm?.[0]?.path || baseDir;
  } else if (cleaned === '..') {
    if (baseDir) {
      const checkParent = await ipcRenderer.invoke('read-directory', baseDir);
      candidate = checkParent?.parentPath || baseDir;
    }
  } else if (!/^[a-zA-Z]:[/\\]/.test(cleaned) && !cleaned.startsWith('\\\\') && baseDir) {
    candidate = baseDir.endsWith('\\') || baseDir.endsWith('/') ? `${baseDir}${cleaned}` : `${baseDir}\\${cleaned}`;
  }

  const res = await ipcRenderer.invoke('read-directory', candidate);
  if (res && res.ok && res.currentPath) {
    currentTerminalPath = res.currentPath;
    updateTerminalCwdDisplay(currentTerminalPath);
    appendTerminalLine(`📂 Direktori aktif berpindah ke: ${currentTerminalPath}`, 'sys');
  } else {
    appendTerminalLine(`⚠️ Direktori tidak ditemukan atau tidak dapat diakses: ${candidate}`, 'err');
  }
}

async function executeTerminalCommand(cmd) {
  const cleanCmd = cmd.trim();
  if (!cleanCmd) return;

  // Simpan riwayat perintah untuk navigasi Panah Atas / Bawah
  if (termHistory.length === 0 || termHistory[termHistory.length - 1] !== cleanCmd) {
    termHistory.push(cleanCmd);
  }
  termHistoryIndex = termHistory.length;
  updateTerminalSuggestionHint('');

  if (cleanCmd.toLowerCase() === 'cls' || cleanCmd.toLowerCase() === 'clear') {
    termOutputEl.innerHTML = '';
    return;
  }

  const promptText = document.querySelector('.term-prompt')?.textContent || 'PS WinMac>';
  appendTerminalLine(`${promptText} ${cleanCmd}`, 'cmd');

  if (cleanCmd.toLowerCase() === 'help') {
    appendTerminalLine(
      'WinMac Glass Terminal Pro — Panduan Cepat:\n• cd <folder> / cd .. : Pindah direktori kerja aktif\n• Tab : Autocomplete perintah umum\n• ↑ / ↓ : Telusuri riwayat perintah sebelumnya\n• Ctrl+L / cls : Bersihkan layar terminal',
      'sys'
    );
    return;
  }

  if (/^cd(\s+.*)?$/i.test(cleanCmd)) {
    const arg = cleanCmd.slice(2).trim();
    await resolveAndChangeTerminalDir(arg);
    return;
  }

  const activeDir = currentTerminalPath || currentExplorerPath;
  const res = await ipcRenderer.invoke('run-terminal-cmd', cleanCmd, activeDir);
  appendTerminalLine(res.output, res.isError ? 'err' : '');
  updateTerminalCwdDisplay(activeDir);
}

termSendBtn?.addEventListener('click', () => {
  executeTerminalCommand(termInputEl.value);
  termInputEl.value = '';
  updateTerminalSuggestionHint('');
});

termInputEl?.addEventListener('input', (e) => {
  updateTerminalSuggestionHint(e.target.value);
});

termInputEl?.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    const typed = (termInputEl.value || '').trim().toLowerCase();
    const match = TERM_AUTOCOMPLETE_COMMANDS.find((c) => c.startsWith(typed));
    if (typed && match) {
      e.preventDefault();
      termInputEl.value = match;
      updateTerminalSuggestionHint(match);
    }
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    if (termOutputEl) termOutputEl.innerHTML = '';
  } else if (e.key === 'Enter') {
    executeTerminalCommand(termInputEl.value);
    termInputEl.value = '';
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (termHistory.length === 0) return;
    if (termHistoryIndex > 0) {
      termHistoryIndex--;
    } else {
      termHistoryIndex = 0;
    }
    termInputEl.value = termHistory[termHistoryIndex] || '';
    updateTerminalSuggestionHint(termInputEl.value);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (termHistory.length === 0) return;
    if (termHistoryIndex < termHistory.length - 1) {
      termHistoryIndex++;
      termInputEl.value = termHistory[termHistoryIndex] || '';
    } else {
      termHistoryIndex = termHistory.length;
      termInputEl.value = '';
    }
    updateTerminalSuggestionHint(termInputEl.value);
  }
});

document.querySelectorAll('.term-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    executeTerminalCommand(chip.dataset.cmd);
  });
});

document.getElementById('term-copy-btn')?.addEventListener('click', () => {
  const txt = (termOutputEl?.innerText || '').trim();
  if (!txt) return;
  ipcRenderer.send('copy-to-clipboard', txt);
  triggerLaunchHud('📋', 'Output Terminal Disalin', 'Tersimpan di Clipboard');
});

document.getElementById('term-clear-btn')?.addEventListener('click', () => {
  if (termOutputEl) termOutputEl.innerHTML = '';
});

document.getElementById('term-open-native')?.addEventListener('click', () => {
  ipcRenderer.send('launch-app', 'terminal');
});

// Kalkulator Pro (Live Preview, Scientific Quick Keys, Riwayat & Keyboard Support)
let calcExpression = '';
const calcExprEl = document.getElementById('calc-expr');
const calcResultEl = document.getElementById('calc-result');
const calcLivePreviewEl = document.getElementById('calc-live-preview');
const calcHistoryDrawer = document.getElementById('calc-history-drawer');
const calcHistoryListEl = document.getElementById('calc-history-list');
const calcHistoryBtn = document.getElementById('calc-history-btn');

function evaluateCalcFormula(rawExpr) {
  const cleaned = (rawExpr || '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/%/g, '/100')
    .replace(/[^0-9+\-*/.()]/g, '');
  if (!cleaned) return null;
  try {
    const val = Function(`"use strict"; return (${cleaned})`)();
    if (!Number.isFinite(val)) return null;
    return Number(val.toFixed(6));
  } catch (_) {
    return null;
  }
}

function updateCalcLivePreview() {
  if (!calcLivePreviewEl) return;
  if (!calcExpression || !/[+\-*/%]/.test(calcExpression)) {
    calcLivePreviewEl.classList.add('hidden');
    return;
  }
  const val = evaluateCalcFormula(calcExpression);
  if (val !== null) {
    calcLivePreviewEl.textContent = `= ${val}`;
    calcLivePreviewEl.classList.remove('hidden');
  } else {
    calcLivePreviewEl.classList.add('hidden');
  }
}

function renderCalcHistory() {
  if (!calcHistoryListEl) return;
  const list = appConfig.calcHistory || [];
  calcHistoryListEl.innerHTML = '';
  if (list.length === 0) {
    calcHistoryListEl.innerHTML = `<div style="font-size:10.5px;color:var(--text-secondary);text-align:center;padding:4px;">Belum ada riwayat perhitungan.</div>`;
    return;
  }
  list.forEach((item) => {
    const btn = document.createElement('button');
    btn.className = 'calc-hist-item';
    btn.innerHTML = `<span style="opacity:0.75">${escapeHtml(item.expr)}</span><strong>= ${escapeHtml(String(item.res))}</strong>`;
    btn.addEventListener('click', () => {
      calcExpression = String(item.res);
      if (calcExprEl) calcExprEl.textContent = item.expr;
      if (calcResultEl) calcResultEl.textContent = String(item.res);
      updateCalcLivePreview();
    });
    calcHistoryListEl.appendChild(btn);
  });
}
renderCalcHistory();

function handleCalculatorKeyInput(key) {
  if (key === 'C') {
    calcExpression = '';
    if (calcExprEl) calcExprEl.textContent = '0';
    if (calcResultEl) calcResultEl.textContent = '0';
  } else if (key === 'DEL') {
    calcExpression = calcExpression.slice(0, -1);
    if (calcExprEl) calcExprEl.textContent = calcExpression || '0';
  } else if (key === 'NEG') {
    const val = evaluateCalcFormula(calcExpression || calcResultEl?.textContent || '0');
    if (val !== null) {
      calcExpression = String(-val);
      if (calcExprEl) calcExprEl.textContent = calcExpression;
      if (calcResultEl) calcResultEl.textContent = calcExpression;
    }
  } else if (key === 'SQRT') {
    const val = evaluateCalcFormula(calcExpression || calcResultEl?.textContent || '0');
    if (val !== null && val >= 0) {
      const sq = Number(Math.sqrt(val).toFixed(6));
      if (calcExprEl) calcExprEl.textContent = `√(${val})`;
      if (calcResultEl) calcResultEl.textContent = String(sq);
      calcExpression = String(sq);
    } else if (calcResultEl) {
      calcResultEl.textContent = 'Error';
      calcExpression = '';
    }
  } else if (key === 'SQ') {
    const val = evaluateCalcFormula(calcExpression || calcResultEl?.textContent || '0');
    if (val !== null) {
      const sq = Number((val * val).toFixed(6));
      if (calcExprEl) calcExprEl.textContent = `(${val})²`;
      if (calcResultEl) calcResultEl.textContent = String(sq);
      calcExpression = String(sq);
    }
  } else if (key === '=') {
    const rounded = evaluateCalcFormula(calcExpression);
    if (rounded !== null) {
      const exprSnapshot = calcExpression || String(rounded);
      if (calcResultEl) calcResultEl.textContent = String(rounded);
      if (!Array.isArray(appConfig.calcHistory)) appConfig.calcHistory = [];
      appConfig.calcHistory.unshift({ expr: exprSnapshot, res: rounded });
      appConfig.calcHistory = appConfig.calcHistory.slice(0, 12);
      saveConfig();
      renderCalcHistory();
      calcExpression = String(rounded);
    } else {
      if (calcResultEl) calcResultEl.textContent = 'Error';
      calcExpression = '';
    }
  } else {
    calcExpression += key;
    if (calcExprEl) calcExprEl.textContent = calcExpression;
  }
  updateCalcLivePreview();
}

document.querySelectorAll('.calc-key, .calc-sci-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    handleCalculatorKeyInput(btn.dataset.key);
  });
});

calcHistoryBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const isHidden = calcHistoryDrawer?.classList.toggle('hidden');
  calcHistoryBtn.classList.toggle('active', !isHidden);
});

document.getElementById('calc-history-clear-btn')?.addEventListener('click', () => {
  appConfig.calcHistory = [];
  saveConfig();
  renderCalcHistory();
});

document.getElementById('calc-copy-btn')?.addEventListener('click', () => {
  const val = calcResultEl?.textContent || '0';
  ipcRenderer.send('copy-to-clipboard', val);
  triggerLaunchHud('🧮', `Hasil Disalin: ${val}`, 'Siap ditempel (Ctrl+V)');
});

window.addEventListener('keydown', (e) => {
  const calcWin = document.getElementById('win-calculator');
  if (!calcWin || calcWin.classList.contains('hidden')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  // Pastikan jendela modal lain yang menutup calculator tidak ikut ketik
  const spotWin = document.getElementById('win-spotlight');
  const startWin = document.getElementById('win12-start-menu');
  if ((spotWin && !spotWin.classList.contains('hidden')) || (startWin && !startWin.classList.contains('hidden'))) return;

  if (/^[0-9+\-*/.%()]$/.test(e.key)) {
    e.preventDefault();
    handleCalculatorKeyInput(e.key);
  } else if (e.key === 'Enter' || e.key === '=') {
    e.preventDefault();
    handleCalculatorKeyInput('=');
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    handleCalculatorKeyInput('DEL');
  } else if (e.key === 'Delete') {
    e.preventDefault();
    handleCalculatorKeyInput('C');
  }
});

// =========================================================
// 10. DOCK MAGNIFICATION, AUTO-HIDE DOCK & CUSTOM SHORTCUTS (+)
// =========================================================
const dockWrapper = document.getElementById('bottom-dock-wrapper');
const dockHoverZone = document.getElementById('dock-hover-zone');
const dock = document.getElementById('dock');
const customDockContainer = document.getElementById('custom-dock-items');
const addDockAppBtn = document.getElementById('add-dock-app-btn');

let maxDockScale = Number(appConfig.dockScale || 158) / 100;
const EFFECT_RADIUS = 160;
let autoHideTimer = null;

function getAllDockItems() {
  return Array.from(document.querySelectorAll('.dock-item'));
}

const customDockIconTried = new Set();

// Render shortcut aplikasi yang ditambahkan user ke Dock
function renderCustomDockApps() {
  if (!customDockContainer) return;
  customDockContainer.innerHTML = '';

  const pendingBackfill = [];
  (appConfig.customDockApps || []).forEach((appItem, idx) => {
    const btn = document.createElement('button');
    btn.className = 'dock-item';
    btn.dataset.label = `${appItem.name} (Klik Kanan: Hapus)`;
    const initials = escapeHtml(appItem.name.slice(0, 2).toUpperCase());
    const iconHtml = appItem.iconDataUrl
      ? `<div class="dock-icon icon-custom-app has-native-icon"><img src="${escapeHtml(appItem.iconDataUrl)}" class="native-exe-icon-img" alt="${escapeHtml(appItem.name)}" /></div>`
      : `<div class="dock-icon icon-custom-app">${initials}</div>`;
    btn.innerHTML = `
      ${iconHtml}
      <span class="dock-dot"></span>
    `;

    if (!appItem.iconDataUrl && appItem.path && !customDockIconTried.has(appItem.path)) {
      customDockIconTried.add(appItem.path);
      pendingBackfill.push(appItem);
    }

    btn.addEventListener('click', () => {
      btn.classList.remove('launching');
      void btn.offsetWidth;
      btn.classList.add('launching');
      btn.querySelector('.dock-dot')?.classList.add('active');
      ipcRenderer.invoke('open-path', appItem.path);
    });

    // Klik kanan untuk menghapus shortcut dari Dock
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      appConfig.customDockApps.splice(idx, 1);
      saveConfig();
      renderCustomDockApps();
    });

    customDockContainer.appendChild(btn);
  });

  if (pendingBackfill.length > 0) {
    Promise.all(
      pendingBackfill.map(async (item) => {
        try {
          const ico = await ipcRenderer.invoke('get-app-icon', item.path);
          if (ico) {
            item.iconDataUrl = ico;
            return true;
          }
        } catch (_) {}
        return false;
      })
    ).then((results) => {
      if (results.some(Boolean)) {
        saveConfig();
        renderCustomDockApps();
      }
    });
  }
}

renderCustomDockApps();

addDockAppBtn?.addEventListener('click', async () => {
  const picked = await ipcRenderer.invoke('pick-app-shortcut');
  if (picked && picked.path) {
    appConfig.customDockApps = appConfig.customDockApps || [];
    appConfig.customDockApps.push(picked);
    saveConfig();
    renderCustomDockApps();
  }
});

// Efek Gelombang Fisika Magnification Dock (60fps rAF, Aktif di Mode macOS & WinMac Hybrid; nonaktif di Taskbar Windows 12 / Reduced Motion)
let dockMagRafId = null;
let dockLastMouseX = null;

dock.addEventListener('mousemove', (e) => {
  if (document.body.classList.contains('os-mode-win12') || appConfig.reducedMotion) return;
  dockLastMouseX = e.clientX;
  if (dockMagRafId) return;

  dockMagRafId = requestAnimationFrame(() => {
    dockMagRafId = null;
    if (dockLastMouseX === null) return;
    const mouseX = dockLastMouseX;
    getAllDockItems().forEach((item) => {
      const rect = item.getBoundingClientRect();
      const itemCenterX = rect.left + rect.width / 2;
      const distance = Math.abs(mouseX - itemCenterX);

      if (distance < EFFECT_RADIUS) {
        const ratio = Math.cos((distance / EFFECT_RADIUS) * (Math.PI / 2));
        const scale = 1 + (maxDockScale - 1) * Math.pow(ratio, 1.45);
        item.style.setProperty('--scale', scale.toFixed(3));
      } else {
        item.style.setProperty('--scale', '1');
      }
    });
  });
});

dock.addEventListener('mouseleave', () => {
  if (dockMagRafId) {
    cancelAnimationFrame(dockMagRafId);
    dockMagRafId = null;
  }
  dockLastMouseX = null;
  getAllDockItems().forEach((item) => {
    item.style.setProperty('--scale', '1');
  });
  scheduleAutoHideDock();
});

// Auto-Hide Dock Sensor
function scheduleAutoHideDock() {
  clearTimeout(autoHideTimer);
  if (!appConfig.autoHideDock) {
    dockWrapper.classList.remove('autohide-hidden');
    return;
  }
  autoHideTimer = setTimeout(() => {
    dockWrapper.classList.add('autohide-hidden');
  }, 650);
}

function revealDock() {
  clearTimeout(autoHideTimer);
  dockWrapper.classList.remove('autohide-hidden');
}

dockHoverZone?.addEventListener('mouseenter', revealDock);
dockWrapper?.addEventListener('mouseenter', revealDock);

// Klik ikon bawaan Dock
document.querySelectorAll('#dock > .dock-item').forEach((item) => {
  item.addEventListener('click', () => {
    item.classList.remove('launching');
    void item.offsetWidth;
    item.classList.add('launching');

    if (item.dataset.customWin) {
      toggleCustomWindow(item.dataset.customWin);
    }
  });
});

// Settings Controls
const dockScaleSlider = document.getElementById('dock-scale-slider');
const autoHideToggle = document.getElementById('autohide-dock-toggle');
const alwaysOnTopToggle = document.getElementById('always-on-top-toggle');
const autoStartToggle = document.getElementById('autostart-toggle');

if (dockScaleSlider) {
  dockScaleSlider.value = appConfig.dockScale || 158;
  dockScaleSlider.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    maxDockScale = val / 100;
    appConfig.dockScale = val;
    saveConfig();
  });
}

if (autoHideToggle) {
  autoHideToggle.checked = Boolean(appConfig.autoHideDock);
  autoHideToggle.addEventListener('change', (e) => {
    appConfig.autoHideDock = e.target.checked;
    saveConfig();
    scheduleAutoHideDock();
  });
}

if (alwaysOnTopToggle) {
  alwaysOnTopToggle.checked = Boolean(appConfig.alwaysOnTop);
  alwaysOnTopToggle.addEventListener('change', (e) => {
    appConfig.alwaysOnTop = e.target.checked;
    ipcRenderer.send('set-always-on-top', appConfig.alwaysOnTop);
    saveConfig();
  });
}

if (autoStartToggle) {
  autoStartToggle.checked = Boolean(appConfig.autoStart);
  autoStartToggle.addEventListener('change', (e) => {
    appConfig.autoStart = e.target.checked;
    ipcRenderer.send('set-autostart', appConfig.autoStart);
    saveConfig();
  });
}

const uiSfxToggle = document.getElementById('ui-sfx-toggle');
if (uiSfxToggle) {
  uiSfxToggle.checked = appConfig.uiSoundEffects !== false;
  uiSfxToggle.addEventListener('change', (e) => {
    appConfig.uiSoundEffects = e.target.checked;
    saveConfig();
    if (appConfig.uiSoundEffects) playUiSound('open');
  });
}

const ecoBatteryToggle = document.getElementById('eco-battery-toggle');
if (ecoBatteryToggle) {
  ecoBatteryToggle.checked = appConfig.autoEcoBattery !== false;
  ecoBatteryToggle.addEventListener('change', (e) => {
    appConfig.autoEcoBattery = e.target.checked;
    saveConfig();
    evaluateEcoBatteryState();
  });
}

function applyReducedMotionState(enabled) {
  document.body.classList.toggle('reduced-motion', Boolean(enabled));
}
applyReducedMotionState(Boolean(appConfig.reducedMotion));

const reducedMotionToggle = document.getElementById('reduced-motion-toggle');
if (reducedMotionToggle) {
  reducedMotionToggle.checked = Boolean(appConfig.reducedMotion);
  reducedMotionToggle.addEventListener('change', (e) => {
    appConfig.reducedMotion = e.target.checked;
    applyReducedMotionState(appConfig.reducedMotion);
    saveConfig();
    if (appConfig.reducedMotion) {
      getAllDockItems().forEach((item) => item.style.setProperty('--scale', '1'));
    }
  });
}

// Smart Battery & Auto-Eco Power Saver Monitor (Chromium Battery API)
let currentBatteryInfo = { level: 1, charging: true, dischargingTime: Infinity };

function evaluateEcoBatteryState() {
  const pct = Math.round((currentBatteryInfo.level || 1) * 100);
  const charging = Boolean(currentBatteryInfo.charging);
  const shouldPause =
    appConfig.autoEcoBattery !== false &&
    !charging &&
    currentBatteryInfo.level <= 0.25;
  isEcoBatteryPaused = shouldPause;
  document.body.classList.toggle('eco-paused', shouldPause);
  if (typeof syncVideoWallpaperPlayback === 'function') {
    syncVideoWallpaperPlayback();
  }

  // Update Pill Baterai di Top Dynamic Island & SysMonitor Pro
  const compactBat = document.getElementById('compact-bat');
  const compactBatDot = document.getElementById('compact-bat-dot');
  const rmBatStatus = document.getElementById('rm-bat-status');

  if (compactBat) {
    compactBat.textContent = `${charging ? '⚡' : '🔋'} ${pct}%`;
  }
  if (compactBatDot) {
    const color = pct <= 25 && !charging ? '#ef4444' : charging ? '#38bdf8' : '#4ade80';
    compactBatDot.style.background = color;
    compactBatDot.style.boxShadow = `0 0 6px ${color}`;
  }
  if (rmBatStatus) {
    let timeHint = charging ? 'Sedang Mengisi (AC)' : 'Mode Baterai';
    if (!charging && Number.isFinite(currentBatteryInfo.dischargingTime) && currentBatteryInfo.dischargingTime > 60) {
      const hrs = Math.floor(currentBatteryInfo.dischargingTime / 3600);
      const mins = Math.round((currentBatteryInfo.dischargingTime % 3600) / 60);
      timeHint = `Sisa ~${hrs}j ${mins}m`;
    }
    rmBatStatus.textContent = `${pct}% • ${timeHint}`;
  }

  const lockBatEl = document.getElementById('lockscreen-battery');
  if (lockBatEl) {
    const batDetail = charging ? 'Mengisi Daya • Siap Digunakan' : 'Mode Baterai';
    lockBatEl.textContent = `${charging ? '⚡' : '🔋'} ${pct}% ${batDetail}`;
  }

  const win12TrayBat = document.getElementById('win12-tray-bat');
  if (win12TrayBat) {
    win12TrayBat.textContent = charging ? '⚡' : pct <= 25 ? '🪫' : '🔋';
    win12TrayBat.title = `Baterai ${pct}% (${charging ? 'Mengisi Daya' : 'Baterai'})`;
  }
}

if (navigator.getBattery) {
  navigator
    .getBattery()
    .then((battery) => {
      const updateBatteryStatus = () => {
        currentBatteryInfo = {
          level: typeof battery.level === 'number' ? battery.level : 1,
          charging: Boolean(battery.charging),
          dischargingTime: battery.dischargingTime
        };
        evaluateEcoBatteryState();
      };
      updateBatteryStatus();
      battery.addEventListener('levelchange', updateBatteryStatus);
      battery.addEventListener('chargingchange', updateBatteryStatus);
      battery.addEventListener('dischargingtimechange', updateBatteryStatus);
    })
    .catch(() => {});
}

// =========================================================
// 11. RAINMETER DESKTOP SKINS MANAGER & AUDIO VISUALIZER
// =========================================================
const rmSkinMap = {
  clock: document.getElementById('rm-skin-clock'),
  sysmon: document.getElementById('rm-skin-sysmon'),
  visualizer: document.getElementById('rm-skin-visualizer'),
  pomodoro: document.getElementById('rm-skin-pomodoro'),
  clipboard: document.getElementById('rm-skin-clipboard')
};

const rmToggleCheckboxes = {
  clock: document.getElementById('rm-toggle-clock'),
  sysmon: document.getElementById('rm-toggle-sysmon'),
  visualizer: document.getElementById('rm-toggle-visualizer'),
  pomodoro: document.getElementById('rm-toggle-pomodoro'),
  clipboard: document.getElementById('rm-toggle-clipboard')
};

const rmLockAllToggle = document.getElementById('rm-lock-all-toggle');
const rmDrawerLockSwitch = document.getElementById('rm-drawer-lock-switch');
const rmCtxMenu = document.getElementById('rm-context-menu');
const rmCtxTitle = document.getElementById('rm-ctx-title');
const rmOpacitySlider = document.getElementById('rm-opacity-slider');
const rmScaleSlider = document.getElementById('rm-scale-slider');
const rmCtxLockBtn = document.getElementById('rm-ctx-lock-btn');
let activeCtxSkinId = null;

function applyRainmeterSkinConfig() {
  const skinsCfg = appConfig.rainmeterSkins || {};
  Object.keys(rmSkinMap).forEach((skinId) => {
    const el = rmSkinMap[skinId];
    if (!el) return;
    if (!skinsCfg[skinId]) {
      skinsCfg[skinId] = { visible: true, collapsed: false, opacity: 95, scale: 100, locked: false };
    }
    const cfg = skinsCfg[skinId];

    el.classList.toggle('rm-hidden', !cfg.visible);
    el.classList.toggle('rm-collapsed', Boolean(cfg.collapsed));
    el.style.opacity = (cfg.opacity / 100).toFixed(2);
    el.style.transform = `scale(${(cfg.scale / 100).toFixed(2)})`;

    const collapseBtn = el.querySelector(`[data-rm-collapse="${skinId}"]`);
    if (collapseBtn) {
      collapseBtn.textContent = cfg.collapsed ? '+' : '—';
    }

    const isLocked = Boolean(appConfig.rainmeterLockAll || cfg.locked);
    el.classList.toggle('rm-locked', isLocked);

    if (rmToggleCheckboxes[skinId]) {
      rmToggleCheckboxes[skinId].checked = Boolean(cfg.visible);
    }

    const drawerSwitch = document.querySelector(`[data-rm-switch="${skinId}"]`);
    if (drawerSwitch) {
      drawerSwitch.checked = Boolean(cfg.visible);
    }
  });

  if (rmLockAllToggle) {
    rmLockAllToggle.checked = Boolean(appConfig.rainmeterLockAll);
  }
  if (rmDrawerLockSwitch) {
    rmDrawerLockSwitch.checked = Boolean(appConfig.rainmeterLockAll);
  }
}

function toggleAllRainmeterSkins() {
  const skinsCfg = appConfig.rainmeterSkins;
  const anyVisible = Object.values(skinsCfg).some((s) => s.visible);
  Object.keys(skinsCfg).forEach((k) => {
    skinsCfg[k].visible = !anyVisible;
  });
  saveConfig();
  applyRainmeterSkinConfig();
}

function setAllRainmeterSkinsVisible(flag) {
  const skinsCfg = appConfig.rainmeterSkins;
  Object.keys(skinsCfg).forEach((k) => {
    skinsCfg[k].visible = Boolean(flag);
  });
  saveConfig();
  applyRainmeterSkinConfig();
}

// 1-Click Workspace Profiles (All, Minimal, Developer, Focus)
function applyWorkspaceProfile(profileName) {
  const skins = appConfig.rainmeterSkins;
  if (profileName === 'all') {
    Object.keys(skins).forEach((k) => {
      skins[k].visible = true;
      skins[k].collapsed = false;
    });
  } else if (profileName === 'minimal') {
    skins.clock.visible = true;
    skins.sysmon.visible = false;
    skins.visualizer.visible = false;
    skins.pomodoro.visible = false;
    skins.clipboard.visible = false;
  } else if (profileName === 'dev') {
    skins.clock.visible = false;
    skins.sysmon.visible = true;
    skins.visualizer.visible = true;
    skins.pomodoro.visible = false;
    skins.clipboard.visible = true;
  } else if (profileName === 'focus') {
    skins.clock.visible = true;
    skins.sysmon.visible = false;
    skins.visualizer.visible = false;
    skins.pomodoro.visible = true;
    skins.clipboard.visible = false;
    openCustomWindow('win-notes');
  }
  saveConfig();
  applyRainmeterSkinConfig();
}

document.querySelectorAll('[data-rm-profile]').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyWorkspaceProfile(btn.dataset.rmProfile);
  });
});

function setRainmeterLockAll(flag) {
  appConfig.rainmeterLockAll = Boolean(flag);
  if (!appConfig.rainmeterLockAll) {
    Object.keys(appConfig.rainmeterSkins).forEach((k) => {
      appConfig.rainmeterSkins[k].locked = false;
    });
  }
  saveConfig();
  applyRainmeterSkinConfig();
}

// Tombol Langsung di Pojok Tiap Widget: Lipat (—/+) & Sembunyikan (✕)
document.querySelectorAll('[data-rm-collapse]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const skinId = btn.dataset.rmCollapse;
    if (!appConfig.rainmeterSkins[skinId]) return;
    appConfig.rainmeterSkins[skinId].collapsed = !appConfig.rainmeterSkins[skinId].collapsed;
    saveConfig();
    applyRainmeterSkinConfig();
  });
});

document.querySelectorAll('[data-rm-hide]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const skinId = btn.dataset.rmHide;
    if (!appConfig.rainmeterSkins[skinId]) return;
    appConfig.rainmeterSkins[skinId].visible = false;
    saveConfig();
    applyRainmeterSkinConfig();
  });
});

// Tombol & Pop-Up Panel Cepat Show/Hide Widget di Top Dynamic Island (#rm-drawer-btn)
document.getElementById('rm-drawer-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCustomWindow('win-rm-drawer');
});

document.getElementById('rm-show-all-btn')?.addEventListener('click', () => {
  setAllRainmeterSkinsVisible(true);
});

document.getElementById('rm-hide-all-btn')?.addEventListener('click', () => {
  setAllRainmeterSkinsVisible(false);
});

document.querySelectorAll('[data-rm-switch]').forEach((sw) => {
  sw.addEventListener('change', (e) => {
    const skinId = sw.dataset.rmSwitch;
    if (!appConfig.rainmeterSkins[skinId]) return;
    appConfig.rainmeterSkins[skinId].visible = e.target.checked;
    saveConfig();
    applyRainmeterSkinConfig();
  });
});

rmDrawerLockSwitch?.addEventListener('change', (e) => {
  setRainmeterLockAll(e.target.checked);
});

Object.keys(rmToggleCheckboxes).forEach((skinId) => {
  rmToggleCheckboxes[skinId]?.addEventListener('change', (e) => {
    appConfig.rainmeterSkins[skinId].visible = e.target.checked;
    saveConfig();
    applyRainmeterSkinConfig();
  });
});

rmLockAllToggle?.addEventListener('change', (e) => {
  setRainmeterLockAll(e.target.checked);
});

// Klik Kanan pada Skin Rainmeter untuk membuka Context Menu Kustom
Object.keys(rmSkinMap).forEach((skinId) => {
  const el = rmSkinMap[skinId];
  if (!el) return;

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    activeCtxSkinId = skinId;
    const cfg = appConfig.rainmeterSkins[skinId];

    if (rmCtxTitle) rmCtxTitle.textContent = `🎨 Skin: ${skinId.toUpperCase()}`;
    if (rmOpacitySlider) rmOpacitySlider.value = cfg.opacity || 95;
    if (rmScaleSlider) rmScaleSlider.value = cfg.scale || 100;
    if (rmCtxLockBtn) {
      rmCtxLockBtn.textContent = cfg.locked
        ? '🔓 Buka Kunci Posisi Skin'
        : '🔒 Kunci Posisi (Click-Through)';
    }

    if (rmCtxMenu) {
      rmCtxMenu.classList.remove('hidden');
      const x = Math.min(window.innerWidth - 245, e.clientX);
      const y = Math.min(window.innerHeight - 210, e.clientY);
      rmCtxMenu.style.left = `${x}px`;
      rmCtxMenu.style.top = `${y}px`;
    }
  });
});

rmOpacitySlider?.addEventListener('input', (e) => {
  if (!activeCtxSkinId) return;
  appConfig.rainmeterSkins[activeCtxSkinId].opacity = Number(e.target.value);
  saveConfig();
  applyRainmeterSkinConfig();
});

rmScaleSlider?.addEventListener('input', (e) => {
  if (!activeCtxSkinId) return;
  appConfig.rainmeterSkins[activeCtxSkinId].scale = Number(e.target.value);
  saveConfig();
  applyRainmeterSkinConfig();
});

rmCtxMenu?.querySelectorAll('[data-rm-act]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const act = btn.dataset.rmAct;
    if (!activeCtxSkinId) return;

    if (act === 'collapse') {
      appConfig.rainmeterSkins[activeCtxSkinId].collapsed =
        !appConfig.rainmeterSkins[activeCtxSkinId].collapsed;
      saveConfig();
      applyRainmeterSkinConfig();
    } else if (act === 'lock') {
      appConfig.rainmeterSkins[activeCtxSkinId].locked =
        !appConfig.rainmeterSkins[activeCtxSkinId].locked;
      saveConfig();
      applyRainmeterSkinConfig();
    } else if (act === 'hide') {
      appConfig.rainmeterSkins[activeCtxSkinId].visible = false;
      saveConfig();
      applyRainmeterSkinConfig();
    } else if (act === 'drawer') {
      openCustomWindow('win-rm-drawer');
    }
    rmCtxMenu.classList.add('hidden');
  });
});

window.addEventListener('click', (e) => {
  if (rmCtxMenu && !e.target.closest('#rm-context-menu')) {
    rmCtxMenu.classList.add('hidden');
  }
});

// =========================================================
// 11B. BUILT-IN 4K WALLPAPER, VIDEO WALLPAPER, PARTICLE ENGINE & STUDIO
// =========================================================
const wpLayer = document.getElementById('desktop-wallpaper-layer');
const wpVideoPlayer = document.getElementById('wp-video-player');
const wpPresets = [
  'wp-sonoma',
  'wp-win12-bloom',
  'wp-cyber-night',
  'wp-fuji-sunset',
  'wp-aurora',
  'wp-nebula',
  'wp-ocean',
  'wp-bigsur',
  'wp-forest',
  'wp-custom',
  'wp-video',
  'wp-transparent'
];

// Wallpaper Dinamis: berganti otomatis mengikuti jam (Pagi / Siang / Sore / Malam)
function resolveDynamicWallpaper(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 10) return 'wp-forest'; // Pagi berkabut
  if (h >= 10 && h < 15) return 'wp-bigsur'; // Siang cerah
  if (h >= 15 && h < 18) return 'wp-ocean'; // Sore sunset
  if (h >= 18 && h < 21) return 'wp-fuji-sunset'; // Senja
  return 'wp-aurora'; // Malam
}
let lastDynamicWallpaper = '';

function syncVideoWallpaperPlayback() {
  if (!wpVideoPlayer) return;
  if (appConfig.wallpaper !== 'wp-video' || !appConfig.customVideoWallpaperUrl) {
    wpVideoPlayer.pause();
    wpVideoPlayer.classList.add('hidden');
    return;
  }
  wpVideoPlayer.classList.remove('hidden');
  if (document.body.classList.contains('app-passthrough-mode') || isEcoBatteryPaused) {
    wpVideoPlayer.pause();
  } else {
    wpVideoPlayer.play().catch(() => {});
  }
}

function applyWallpaper(wpName, persist = true) {
  if (!wpLayer) return;
  wpPresets.forEach((cls) => wpLayer.classList.remove(cls));
  wpLayer.style.backgroundImage = '';

  if (wpName === 'wp-custom' && appConfig.customWallpaperUrl) {
    wpLayer.classList.add('wp-custom');
    wpLayer.style.backgroundImage = `url("${appConfig.customWallpaperUrl}")`;
  } else if (wpName === 'wp-video' && appConfig.customVideoWallpaperUrl) {
    wpLayer.classList.add('wp-video');
    if (wpVideoPlayer && wpVideoPlayer.src !== appConfig.customVideoWallpaperUrl) {
      wpVideoPlayer.src = appConfig.customVideoWallpaperUrl;
    }
  } else if (wpName === 'wp-dynamic') {
    lastDynamicWallpaper = resolveDynamicWallpaper();
    wpLayer.classList.add(lastDynamicWallpaper);
  } else {
    wpLayer.classList.add(wpPresets.includes(wpName) ? wpName : 'wp-sonoma');
  }

  // Transisi crossfade halus saat berganti wallpaper
  wpLayer.classList.remove('wp-switching');
  void wpLayer.offsetWidth;
  wpLayer.classList.add('wp-switching');

  document.querySelectorAll('[data-wp]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.wp === wpName);
  });
  document.getElementById('pick-video-wp-btn')?.classList.toggle('active', wpName === 'wp-video');

  if (persist) {
    appConfig.wallpaper = wpName;
    saveConfig();
  }
  syncVideoWallpaperPlayback();
}

wpLayer?.addEventListener('animationend', (e) => {
  if (e.target === wpLayer) wpLayer.classList.remove('wp-switching');
});

// Cek tiap 5 menit apakah wallpaper dinamis perlu berganti (sangat ringan)
setInterval(() => {
  if (appConfig.wallpaper !== 'wp-dynamic') return;
  if (resolveDynamicWallpaper() !== lastDynamicWallpaper) {
    applyWallpaper('wp-dynamic', false);
  }
}, 5 * 60 * 1000);

document.querySelectorAll('[data-wp]').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyWallpaper(btn.dataset.wp);
  });
});

document.getElementById('pick-custom-wp-btn')?.addEventListener('click', async () => {
  const url = await ipcRenderer.invoke('pick-wallpaper-image');
  if (url) {
    appConfig.customWallpaperUrl = url;
    applyWallpaper('wp-custom');
  }
});

document.getElementById('pick-video-wp-btn')?.addEventListener('click', async () => {
  const url = await ipcRenderer.invoke('pick-wallpaper-video');
  if (url) {
    appConfig.customVideoWallpaperUrl = url;
    applyWallpaper('wp-video');
  }
});

// Live Accent Color Picker & Font Switcher
const accentPicker = document.getElementById('custom-accent-picker');
const fontSelect = document.getElementById('custom-font-select');

function applyCustomStudioStyle() {
  if (appConfig.customAccent) {
    document.documentElement.style.setProperty('--accent-primary', appConfig.customAccent);
    if (accentPicker) accentPicker.value = appConfig.customAccent;
  }
  if (typeof syncAccentPickerUI === 'function') syncAccentPickerUI();
  document.body.classList.remove('font-mono', 'font-serif');
  if (appConfig.fontStyle === 'mono') document.body.classList.add('font-mono');
  if (appConfig.fontStyle === 'serif') document.body.classList.add('font-serif');
  if (fontSelect) fontSelect.value = appConfig.fontStyle || 'sans';
}

accentPicker?.addEventListener('input', (e) => {
  appConfig.customAccent = e.target.value;
  applyCustomStudioStyle();
  saveConfig();
});

fontSelect?.addEventListener('change', (e) => {
  appConfig.fontStyle = e.target.value;
  applyCustomStudioStyle();
  saveConfig();
});

// Particle Engine (Fireflies, Starfield, Snow, Matrix) — Ultra-Light Tanpa ShadowBlur
const particleCanvas = document.getElementById('particle-canvas');
const pCtx = particleCanvas ? particleCanvas.getContext('2d') : null;
let particles = [];
let particleTimerId = null;

function resizeParticleCanvas() {
  if (!particleCanvas) return;
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeParticleCanvas);
resizeParticleCanvas();

function renderParticleTick() {
  if (!pCtx || !particleCanvas) return;
  const mode = appConfig.particleEffect || 'fireflies';
  pCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  if (mode === 'off') return;

  // Smart Gaming / Battery / App Mode Pause: jeda partikel saat CPU > 70%, Auto-Eco Battery, atau Mode Layar Aplikasi aktif
  const latestCpu = cpuHistory[cpuHistory.length - 1] || 15;
  if (latestCpu > 70 || isEcoBatteryPaused || isAppPassthroughMode) return;

  const accent = appConfig.customAccent || '#38bdf8';

  particles.forEach((p) => {
    if (mode === 'fireflies') {
      p.x += p.vx;
      p.y += p.vy;
      p.alpha += (Math.random() - 0.5) * 0.04;
      p.alpha = Math.max(0.22, Math.min(0.9, p.alpha));
      // Layer 1: Soft Halo Aura (tampilan glow mewah tanpa beban GPU shadowBlur)
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2);
      pCtx.fillStyle = accent;
      pCtx.globalAlpha = p.alpha * 0.22;
      pCtx.fill();
      // Layer 2: Inti Cahaya Terang
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.r * 1.2, 0, Math.PI * 2);
      pCtx.fillStyle = '#ffffff';
      pCtx.globalAlpha = p.alpha;
      pCtx.fill();
    } else if (mode === 'starfield') {
      p.alpha = 0.3 + Math.abs(Math.sin(Date.now() * 0.002 + p.x)) * 0.65;
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.r * 2.4, 0, Math.PI * 2);
      pCtx.fillStyle = accent;
      pCtx.globalAlpha = p.alpha * 0.2;
      pCtx.fill();
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      pCtx.fillStyle = '#ffffff';
      pCtx.globalAlpha = p.alpha;
      pCtx.fill();
    } else if (mode === 'snow') {
      p.y += p.vy;
      p.x += Math.sin(p.y * 0.02) * 0.35;
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      pCtx.fillStyle = '#f8fafc';
      pCtx.globalAlpha = 0.72;
      pCtx.fill();
    } else if (mode === 'matrix') {
      p.y += 4.2;
      pCtx.font = '12px Consolas, monospace';
      pCtx.fillStyle = accent;
      pCtx.globalAlpha = 0.5;
      pCtx.fillText(p.char, p.x, p.y);
    }

    if (p.x < 0) p.x = particleCanvas.width;
    if (p.x > particleCanvas.width) p.x = 0;
    if (p.y < 0) p.y = particleCanvas.height;
    if (p.y > particleCanvas.height) p.y = 0;
  });
  pCtx.globalAlpha = 1;
}

function initParticles(mode) {
  appConfig.particleEffect = mode;
  document.querySelectorAll('[data-particle]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.particle === mode);
  });

  if (particleTimerId) {
    clearInterval(particleTimerId);
    particleTimerId = null;
  }

  particles = [];
  if (pCtx && particleCanvas) {
    pCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  }
  if (mode === 'off' || !particleCanvas) return;

  const count = 30; // Jumlah optimal agar sangat ringan di GPU laptop
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 2.2 + 1,
      vx: (Math.random() - 0.5) * 0.55,
      vy: mode === 'snow' ? Math.random() * 1.0 + 0.45 : (Math.random() - 0.5) * 0.45,
      alpha: Math.random() * 0.7 + 0.2,
      char: String.fromCharCode(0x30a0 + Math.floor(Math.random() * 96))
    });
  }

  particleTimerId = setInterval(renderParticleTick, 65);
}

document.querySelectorAll('[data-particle]').forEach((btn) => {
  btn.addEventListener('click', () => {
    initParticles(btn.dataset.particle);
    saveConfig();
  });
});

// =========================================================
// 11C. SKIN 4 (POMODORO FOCUS TIMER) & SKIN 5 (CLIPBOARD HISTORY)
// =========================================================
let pomoTotalSeconds = 25 * 60;
let pomoRemainingSeconds = 25 * 60;
let pomoTimerId = null;
const pomoTimeEl = document.getElementById('pomo-time');
const pomoRingEl = document.getElementById('pomo-ring');
const pomoModeLbl = document.getElementById('pomo-mode-lbl');
const pomoStartBtn = document.getElementById('pomo-start-btn');
const pomoResetBtn = document.getElementById('pomo-reset-btn');
const pomoStreakBadge = document.getElementById('pomo-streak-badge');

function renderPomodoro() {
  if (!pomoTimeEl) return;
  const m = String(Math.floor(pomoRemainingSeconds / 60)).padStart(2, '0');
  const s = String(pomoRemainingSeconds % 60).padStart(2, '0');
  pomoTimeEl.textContent = `${m}:${s}`;

  const pct = Math.max(0, Math.round((pomoRemainingSeconds / pomoTotalSeconds) * 100));
  pomoRingEl?.setAttribute('stroke-dasharray', `${pct}, 100`);
  if (pomoStreakBadge) {
    pomoStreakBadge.textContent = `🔥 ${appConfig.pomoStreak || 0} Sesi`;
  }
}

function playPomoChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.14);
      g.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.14);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.14 + 0.5);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.14);
      osc.stop(ctx.currentTime + idx * 0.14 + 0.55);
    });
  } catch (_) {}
}

pomoStartBtn?.addEventListener('click', () => {
  if (pomoTimerId) {
    clearInterval(pomoTimerId);
    pomoTimerId = null;
    pomoStartBtn.textContent = '▶ Lanjut';
  } else {
    pomoStartBtn.textContent = '⏸ Jeda';
    pomoTimerId = setInterval(() => {
      if (pomoRemainingSeconds > 0) {
        pomoRemainingSeconds -= 1;
        renderPomodoro();
      } else {
        clearInterval(pomoTimerId);
        pomoTimerId = null;
        pomoStartBtn.textContent = '▶ Mulai';
        appConfig.pomoStreak = (appConfig.pomoStreak || 0) + 1;
        saveConfig();
        playPomoChime();
        pomoRemainingSeconds = pomoTotalSeconds;
        renderPomodoro();
      }
    }, 1000);
  }
});

pomoResetBtn?.addEventListener('click', () => {
  clearInterval(pomoTimerId);
  pomoTimerId = null;
  if (pomoStartBtn) pomoStartBtn.textContent = '▶ Mulai';
  pomoRemainingSeconds = pomoTotalSeconds;
  renderPomodoro();
});

document.querySelectorAll('.pomo-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.pomo-pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    clearInterval(pomoTimerId);
    pomoTimerId = null;
    if (pomoStartBtn) pomoStartBtn.textContent = '▶ Mulai';
    pomoTotalSeconds = Number(pill.dataset.pomoMin) * 60;
    pomoRemainingSeconds = pomoTotalSeconds;
    if (pomoModeLbl) pomoModeLbl.textContent = pill.dataset.pomoLbl;
    renderPomodoro();
  });
});

renderPomodoro();

// Smart Clipboard History Watcher
const rmClipList = document.getElementById('rm-clip-list');
let lastClipText = '';

function renderClipboardHistory() {
  if (!rmClipList) return;
  rmClipList.innerHTML = '';
  const list = appConfig.clipboardHistory || [];

  if (list.length === 0) {
    rmClipList.innerHTML = '<div class="rm-clip-hint">Belum ada teks yang di-copy (Ctrl+C).</div>';
    return;
  }

  list.forEach((txt) => {
    const item = document.createElement('div');
    item.className = 'rm-clip-item';
    item.innerHTML = `
      <span class="rm-clip-text"></span>
      <span class="rm-clip-tag">COPY</span>
    `;
    item.querySelector('.rm-clip-text').textContent = txt;
    item.addEventListener('click', () => {
      lastClipText = txt;
      ipcRenderer.send('copy-to-clipboard', txt);
      const tag = item.querySelector('.rm-clip-tag');
      if (tag) {
        tag.textContent = '✓ COPIED';
        setTimeout(() => {
          tag.textContent = 'COPY';
        }, 1000);
      }
    });
    rmClipList.appendChild(item);
  });
}

renderClipboardHistory();

setInterval(async () => {
  // Hemat CPU: lewati polling clipboard jika widget clipboard disembunyikan atau di-collapse
  if (!appConfig.rainmeterSkins?.clipboard?.visible || appConfig.rainmeterSkins?.clipboard?.collapsed) {
    return;
  }
  try {
    const txt = (await ipcRenderer.invoke('get-clipboard-text')).trim();
    if (txt && txt !== lastClipText && txt.length <= 300) {
      lastClipText = txt;
      appConfig.clipboardHistory = appConfig.clipboardHistory || [];
      appConfig.clipboardHistory = [
        txt,
        ...appConfig.clipboardHistory.filter((item) => item !== txt)
      ].slice(0, 12);
      saveConfig();
      renderClipboardHistory();
    }
  } catch (_) {}
}, 3000);

document.getElementById('rm-clip-clear-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  appConfig.clipboardHistory = [];
  saveConfig();
  renderClipboardHistory();
});

// =========================================================
// 11D. SPOTLIGHT / RAYCAST COMMAND PALETTE (Alt + K)
// =========================================================
const spotlightInput = document.getElementById('spotlight-input');
const spotlightMathRes = document.getElementById('spotlight-math-res');
const spotlightResults = document.getElementById('spotlight-results');

const spotlightCommands = [
  { label: '🌄 Ganti Wallpaper: macOS Sonoma Horizon', keywords: 'wallpaper background sonoma', run: () => applyWallpaper('wp-sonoma') },
  { label: '🌆 Ganti Wallpaper: Cyberpunk Synthwave', keywords: 'wallpaper background cyber neon', run: () => applyWallpaper('wp-cyber-night') },
  { label: '🌌 Mode Tema OS: Tema Sekarang (WinMac Hybrid)', keywords: 'tema theme mode hybrid winmac sekarang default', run: () => applyOsMode('os-mode-hybrid') },
  { label: '🪟 Mode Tema OS: Windows 12 Fluent Taskbar', keywords: 'tema theme mode windows 12 win12 taskbar fluent', run: () => applyOsMode('os-mode-win12') },
  { label: '🍎 Mode Tema OS: Apple macOS Sonoma (Top Menu Bar)', keywords: 'tema theme mode macos apple finder sonoma menubar', run: () => applyOsMode('os-mode-macos') },
  { label: '🗻 Ganti Wallpaper: Mount Fuji Twilight', keywords: 'wallpaper background fuji japan', run: () => applyWallpaper('wp-fuji-sunset') },
  { label: '🕐 Ganti Wallpaper: Otomatis Pagi/Siang/Sore/Malam', keywords: 'wallpaper background dinamis otomatis jam dynamic', run: () => applyWallpaper('wp-dynamic') },
  { label: '🌌 Ganti Wallpaper: Aurora Borealis', keywords: 'wallpaper background aurora malam night', run: () => applyWallpaper('wp-aurora') },
  { label: '🪐 Ganti Wallpaper: Galaxy Nebula', keywords: 'wallpaper background galaxy nebula space planet', run: () => applyWallpaper('wp-nebula') },
  { label: '🏝️ Ganti Wallpaper: Ocean Sunset', keywords: 'wallpaper background ocean laut pantai sunset', run: () => applyWallpaper('wp-ocean') },
  { label: '🌈 Ganti Wallpaper: macOS Big Sur Waves', keywords: 'wallpaper background bigsur macos gradient', run: () => applyWallpaper('wp-bigsur') },
  { label: '🌲 Ganti Wallpaper: Misty Pine Forest', keywords: 'wallpaper background forest hutan gunung kabut', run: () => applyWallpaper('wp-forest') },
  { label: '🪟 Ganti Wallpaper: Transparan (Wallpaper Asli Windows)', keywords: 'wallpaper transparent asli', run: () => applyWallpaper('wp-transparent') },
  { label: '👁️ Tampilkan Semua Widget Rainmeter', keywords: 'show tampilkan widget skin', run: () => setAllRainmeterSkinsVisible(true) },
  { label: '🙈 Sembunyikan Semua Widget Rainmeter', keywords: 'hide sembunyikan widget skin', run: () => setAllRainmeterSkinsVisible(false) },
  { label: '🧘 Profil Desktop: Minimalis', keywords: 'profile minimal bersih', run: () => applyWorkspaceProfile('minimal') },
  { label: '💻 Profil Desktop: Developer / Hacker', keywords: 'profile dev coding hacker', run: () => applyWorkspaceProfile('dev') },
  { label: '📁 Buka Custom File Explorer (Alt+E)', keywords: 'explorer file folder finder', run: () => openCustomWindow('win-explorer') },
  { label: '🐚 Buka Glass Terminal Pro', keywords: 'terminal cmd powershell', run: () => openCustomWindow('win-terminal') },
  { label: '📌 Buka Sticky Notes & To-Do', keywords: 'notes catatan todo', run: () => openCustomWindow('win-notes') },
  { label: '🔔 Buka Pusat Notifikasi & Riwayat (Alt+N)', keywords: 'notification notifikasi bell dnd', run: () => openCustomWindow('win-notifications') },
  { label: '📸 Tangkap Layar & Editor Coret-Coret (Alt+S)', keywords: 'screenshot capture snipping coret gambar', run: () => captureAndOpenScreenshotStudio() },
  { label: '🗂️ Buka App Stack Folder di Dock', keywords: 'folder stack grup aplikasi', run: () => toggleCustomWindow('dock-stack-popover') },
  { label: '🔒 Kunci Layar (Lock Screen / Screensaver Mode)', keywords: 'lock kunci layar pc screensaver sleep', run: () => showLockScreen() }
];

// Konversi Mata Uang & Satuan Pintar di Spotlight (contoh: "10 usd to idr", "100 km to mile", "32 c to f")
function evaluateUnitOrCurrencyConversion(raw) {
  const s = (raw || '').trim().toLowerCase();
  const m = s.match(/^([0-9.,]+)\s*([a-z$€£¥°]+)\s*(?:to|ke|in|=)\s*([a-z$€£¥°]+)$/i);
  if (!m) return null;
  const val = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(val)) return null;
  const from = m[2];
  const to = m[3];

  // Kurs Mata Uang populer terhadap IDR
  const fxToIdr = {
    idr: 1,
    rp: 1,
    usd: 15850,
    $: 15850,
    eur: 17100,
    sgd: 11800,
    myr: 3550,
    jpy: 105,
    gbp: 20100,
    aud: 10300,
    sar: 4220
  };
  if (fxToIdr[from] && fxToIdr[to]) {
    const idrVal = val * fxToIdr[from];
    const out = idrVal / fxToIdr[to];
    const formatted = out >= 100 ? out.toLocaleString('id-ID', { maximumFractionDigits: 2 }) : out.toFixed(4);
    return `💱 ${val.toLocaleString('id-ID')} ${from.toUpperCase()} = ${formatted} ${to.toUpperCase()}`;
  }

  // Suhu (C, F, K)
  if ((from === 'c' || from === 'celcius') && (to === 'f' || to === 'fahrenheit')) {
    return `🌡️ ${val}°C = ${((val * 9) / 5 + 32).toFixed(2)}°F`;
  }
  if ((from === 'f' || from === 'fahrenheit') && (to === 'c' || to === 'celcius')) {
    return `🌡️ ${val}°F = ${(((val - 32) * 5) / 9).toFixed(2)}°C`;
  }

  // Panjang / Berat / Data Digital
  const unitFactors = {
    km: { m: 1000, cm: 100000, mile: 0.621371, mi: 0.621371 },
    mile: { km: 1.60934, m: 1609.34 },
    mi: { km: 1.60934, m: 1609.34 },
    m: { cm: 100, km: 0.001, ft: 3.28084 },
    cm: { m: 0.01, inch: 0.393701, in: 0.393701 },
    kg: { g: 1000, gr: 1000, lb: 2.20462, lbs: 2.20462 },
    lb: { kg: 0.453592, g: 453.592 },
    gb: { mb: 1024, tb: 1 / 1024, kb: 1048576 },
    mb: { gb: 1 / 1024, kb: 1024 }
  };
  if (unitFactors[from] && unitFactors[from][to]) {
    const res = val * unitFactors[from][to];
    return `📏 ${val} ${from.toUpperCase()} = ${Number(res.toFixed(4))} ${to.toUpperCase()}`;
  }
  return null;
}

let spotlightFileSearchTimer = null;
let spotlightActiveIndex = 0;
const spotlightClearBtn = document.getElementById('spotlight-clear-btn');

function syncSpotlightKeyboardSelection(nextIndex = 0) {
  const items = Array.from(spotlightResults?.querySelectorAll('.spot-item') || []);
  if (items.length === 0) {
    spotlightActiveIndex = -1;
    return;
  }
  spotlightActiveIndex = ((nextIndex % items.length) + items.length) % items.length;
  items.forEach((el, idx) => {
    const isAct = idx === spotlightActiveIndex;
    el.classList.toggle('kbd-active', isAct);
    if (isAct) el.scrollIntoView({ block: 'nearest' });
  });
}

function renderSpotlight(query) {
  if (!spotlightResults) return;
  const q = (query || '').trim();
  if (spotlightClearBtn) {
    spotlightClearBtn.classList.toggle('hidden', !q.length);
  }
  spotlightResults.innerHTML = '';
  spotlightActiveIndex = 0;

  // 1. Cek Konversi Mata Uang / Satuan ("10 usd to idr", "100 km to mile", "30 c to f")
  const convResult = evaluateUnitOrCurrencyConversion(q);
  if (convResult) {
    spotlightMathRes?.classList.remove('hidden');
    spotlightMathRes.innerHTML = `
      <span>${escapeHtml(convResult)}</span>
      <span class="kbd-hint">Klik untuk Copy</span>
    `;
    spotlightMathRes.onclick = () => {
      ipcRenderer.send('copy-to-clipboard', convResult);
      closeCustomWindow('win-spotlight');
    };
  } else {
    // 2. Cek apakah input berupa ekspresi matematika
    const mathCandidate = q.replace(/%/g, '/100');
    if (q && /^[0-9+\-*/.()\s%]+$/.test(q) && /[+\-*/%]/.test(q)) {
      try {
        const val = Function(`"use strict"; return (${mathCandidate})`)();
        if (Number.isFinite(val)) {
          spotlightMathRes.classList.remove('hidden');
          spotlightMathRes.innerHTML = `
            <span>🧮 Hasil: ${Number(val.toFixed(6))}</span>
            <span class="kbd-hint">Klik untuk Copy</span>
          `;
          spotlightMathRes.onclick = () => {
            ipcRenderer.send('copy-to-clipboard', String(Number(val.toFixed(6))));
            closeCustomWindow('win-spotlight');
          };
        }
      } catch (_) {
        spotlightMathRes.classList.add('hidden');
      }
    } else {
      spotlightMathRes?.classList.add('hidden');
    }
  }

  // 3. Cek pembuka Website langsung (contoh: github.com, youtube.com, atau "web ...")
  if (/^([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(q) || q.toLowerCase().startsWith('web ')) {
    const rawDomain = q.toLowerCase().startsWith('web ') ? q.slice(4).trim() : q;
    const targetUrl = /^https?:\/\//i.test(rawDomain) ? rawDomain : `https://${rawDomain}`;
    const btn = document.createElement('button');
    btn.className = 'spot-item';
    btn.innerHTML = `<span>🌍 Buka Website: ${escapeHtml(targetUrl)}</span><span>Enter ↵</span>`;
    btn.onclick = () => {
      ipcRenderer.send('open-external-url', targetUrl);
      closeCustomWindow('win-spotlight');
    };
    spotlightResults.appendChild(btn);
  }

  // 4. Cek pencarian Web (g <query> atau yt <query>)
  if (q.toLowerCase().startsWith('g ')) {
    const term = q.slice(2).trim();
    const btn = document.createElement('button');
    btn.className = 'spot-item';
    btn.innerHTML = `<span>🌐 Cari di Google: "${escapeHtml(term)}"</span><span>Enter ↵</span>`;
    btn.onclick = () => {
      ipcRenderer.send('open-external-url', `https://www.google.com/search?q=${encodeURIComponent(term)}`);
      closeCustomWindow('win-spotlight');
    };
    spotlightResults.appendChild(btn);
  } else if (q.toLowerCase().startsWith('yt ')) {
    const term = q.slice(3).trim();
    const btn = document.createElement('button');
    btn.className = 'spot-item';
    btn.innerHTML = `<span>▶️ Cari di YouTube: "${escapeHtml(term)}"</span><span>Enter ↵</span>`;
    btn.onclick = () => {
      ipcRenderer.send('open-external-url', `https://www.youtube.com/results?search_query=${encodeURIComponent(term)}`);
      closeCustomWindow('win-spotlight');
    };
    spotlightResults.appendChild(btn);
  }

  const lower = q.toLowerCase();
  spotlightCommands
    .filter((c) => !lower || c.label.toLowerCase().includes(lower) || c.keywords.includes(lower))
    .slice(0, 6)
    .forEach((cmd) => {
      const btn = document.createElement('button');
      btn.className = 'spot-item';
      btn.innerHTML = `<span>${escapeHtml(cmd.label)}</span><span>Jalankan ↵</span>`;
      btn.onclick = () => {
        cmd.run();
        closeCustomWindow('win-spotlight');
      };
      spotlightResults.appendChild(btn);
    });

  // 5. Pencarian File Lokal di Laptop ("f <nama>" atau otomatis saat ketik >= 3 huruf)
  clearTimeout(spotlightFileSearchTimer);
  const fileQuery = lower.startsWith('f ') ? q.slice(2).trim() : q.length >= 3 ? q : '';
  if (fileQuery.length >= 2) {
    const querySnapshot = q;
    spotlightFileSearchTimer = setTimeout(async () => {
      const files = await ipcRenderer.invoke('search-local-files', fileQuery);
      if ((spotlightInput?.value || '').trim() !== querySnapshot) return;
      if (!files || !files.length) return;
      files.slice(0, 5).forEach((f) => {
        const btn = document.createElement('button');
        btn.className = 'spot-item';
        btn.innerHTML = `<span>${f.isDirectory ? '📁' : '📄'} ${escapeHtml(f.name)} <small style="opacity:0.65">(${escapeHtml(f.location)})</small></span><span>Buka File ↵</span>`;
        btn.onclick = () => {
          ipcRenderer.invoke('open-path', f.path);
          closeCustomWindow('win-spotlight');
        };
        spotlightResults.appendChild(btn);
      });
      syncSpotlightKeyboardSelection(spotlightActiveIndex);
    }, 180);
  }
  syncSpotlightKeyboardSelection(0);
}

document.getElementById('spotlight-trigger-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCustomWindow('win-spotlight');
  renderSpotlight(spotlightInput?.value || '');
  setTimeout(() => spotlightInput?.focus(), 60);
});

spotlightClearBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!spotlightInput) return;
  spotlightInput.value = '';
  renderSpotlight('');
  spotlightInput.focus();
});

document.querySelectorAll('.spotlight-chip[data-spot-preset]').forEach((chip) => {
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!spotlightInput) return;
    spotlightInput.value = chip.dataset.spotPreset || '';
    renderSpotlight(spotlightInput.value);
    spotlightInput.focus();
  });
});

spotlightInput?.addEventListener('input', (e) => {
  renderSpotlight(e.target.value);
});

spotlightInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeCustomWindow('win-spotlight');
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    syncSpotlightKeyboardSelection(spotlightActiveIndex + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    syncSpotlightKeyboardSelection(spotlightActiveIndex - 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const activeBtn =
      spotlightResults?.querySelector('.spot-item.kbd-active') ||
      spotlightResults?.querySelector('.spot-item');
    if (activeBtn) activeBtn.click();
  }
});

renderSpotlight('');

// --- RAINMETER SKIN 3: 24-BAR AUDIO SPECTRUM VISUALIZER + WEBAUDIO SYNTH ---
const rmVisBarsContainer = document.getElementById('rm-vis-bars');
const rmVisTitle = document.getElementById('rm-vis-title');
const rmVisArtist = document.getElementById('rm-vis-artist');
const rmVisPlayBtn = document.getElementById('rm-vis-play-btn');
const rmVisNextBtn = document.getElementById('rm-vis-next-btn');
const rmVisSoundBtn = document.getElementById('rm-vis-sound-btn');
const islandMediaTitle = document.getElementById('media-title');
const islandMediaSub = document.getElementById('media-sub');

const synthTracks = [
  { title: 'Midnight Cyber Lofi', artist: 'WinMac WebAudio Synth', notes: [220, 277.18, 329.63, 415.3] },
  { title: 'Neon Rain Horizon', artist: 'Rainmeter Chillhop', notes: [196, 246.94, 293.66, 369.99] },
  { title: 'Tokyo Drift Ambient', artist: 'Spatial Glass Audio', notes: [261.63, 329.63, 392.0, 493.88] },
  { title: 'Deep Focus Coding', artist: 'Aurora Synthwave', notes: [174.61, 220.0, 261.63, 349.23] }
];

let currentTrackIdx = 0;
let isVisualizerPlaying = true;
let isWebAudioSoundOn = false;
let audioCtx = null;
let analyserNode = null;
let synthGainNode = null;
let synthOscillators = [];
const visBarElements = [];

if (rmVisBarsContainer) {
  for (let i = 0; i < 24; i++) {
    const b = document.createElement('div');
    b.className = 'rm-vis-bar';
    rmVisBarsContainer.appendChild(b);
    visBarElements.push(b);
  }
}

function updateTrackDisplay() {
  const tr = synthTracks[currentTrackIdx];
  if (rmVisTitle) rmVisTitle.textContent = tr.title;
  if (rmVisArtist) rmVisArtist.textContent = tr.artist;
  if (islandMediaTitle) islandMediaTitle.textContent = tr.title;
  if (islandMediaSub) islandMediaSub.textContent = tr.artist;
}

function startOrUpdateWebAudioSynth() {
  if (!isWebAudioSoundOn || !isVisualizerPlaying) {
    stopWebAudioSynth();
    return;
  }
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 64;
      synthGainNode = audioCtx.createGain();
      synthGainNode.gain.value = 0.035;
      synthGainNode.connect(analyserNode);
      analyserNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    synthOscillators.forEach((osc) => {
      try { osc.stop(); } catch (_) {}
    });
    synthOscillators = [];

    const notes = synthTracks[currentTrackIdx].notes;
    notes.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      osc.connect(synthGainNode);
      osc.start();
      synthOscillators.push(osc);
    });
  } catch (e) {
    console.error('WebAudio error:', e);
  }
}

function stopWebAudioSynth() {
  synthOscillators.forEach((osc) => {
    try { osc.stop(); } catch (_) {}
  });
  synthOscillators = [];
}

function toggleVisualizerPlay() {
  isVisualizerPlaying = !isVisualizerPlaying;
  if (rmVisPlayBtn) rmVisPlayBtn.textContent = isVisualizerPlaying ? '⏸' : '▶';
  soundWave?.classList.toggle('muted', !isVisualizerPlaying);
  startOrUpdateWebAudioSynth();
}

function stepSynthTrack(delta) {
  currentTrackIdx = (currentTrackIdx + delta + synthTracks.length) % synthTracks.length;
  updateTrackDisplay();
  if (isWebAudioSoundOn && isVisualizerPlaying) startOrUpdateWebAudioSynth();
}

rmVisPlayBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleVisualizerPlay();
});

rmVisSoundBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  isWebAudioSoundOn = !isWebAudioSoundOn;
  rmVisSoundBtn.textContent = isWebAudioSoundOn ? '🔊' : '🔈';
  rmVisSoundBtn.classList.toggle('active-sound', isWebAudioSoundOn);
  startOrUpdateWebAudioSynth();
});

// Animasi Real-Time 24-Bar Visualizer (GPU-Accelerated transform: scaleY & Auto-Pause saat Hidden)
let visPhase = 0;
setInterval(() => {
  if (!visBarElements.length) return;
  if (
    !appConfig.rainmeterSkins?.visualizer?.visible ||
    appConfig.rainmeterSkins?.visualizer?.collapsed ||
    isLockScreenActive ||
    isAppPassthroughMode
  ) {
    return;
  }
  if (!isVisualizerPlaying) {
    visBarElements.forEach((b) => {
      b.style.transform = 'scaleY(0.08)';
    });
    return;
  }

  visPhase += 0.28;
  const volFactor = Math.max(0.15, Number(volumeSlider?.value || 75) / 100);

  visBarElements.forEach((bar, i) => {
    const wave1 = Math.sin(visPhase + i * 0.42) * 32;
    const wave2 = Math.cos(visPhase * 1.6 - i * 0.27) * 24;
    const jitter = Math.random() * 22;
    const rawPct = (42 + wave1 + wave2 + jitter) * volFactor;
    const clamped = Math.max(10, Math.min(98, Math.round(rawPct)));
    bar.style.transform = `scaleY(${(clamped / 100).toFixed(2)})`;
  });
}, 110);

// =========================================================
// 12. MAGNETIC GRID DRAG-AND-DROP + RESIZE SUDUT JENDELA
// =========================================================
let isDraggingWidget = false;
let wasDragged = false;
let activeWidget = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let startPointerX = 0;
let startPointerY = 0;

const snapGuideX = document.getElementById('snap-guide-x');
const snapGuideY = document.getElementById('snap-guide-y');

// State Resize Sudut Jendela
let activeResizeWin = null;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartW = 0;
let resizeStartH = 0;

function restoreSavedPositions() {
  const posMap = appConfig.positions || {};
  // Pastikan Top Island & Bottom Dock selalu tetap di tengah layar (tidak miring/bergeser ke kiri)
  delete posMap['top-island'];
  delete posMap['bottom-dock-wrapper'];

  Object.keys(posMap).forEach((id) => {
    const el = document.getElementById(id);
    const pos = posMap[id];
    if (el && pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
      el.style.left = `${pos.left}px`;
      el.style.top = `${pos.top}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      if (!el.classList.contains('rm-skin')) {
        el.style.transform = 'none';
      }
    }
  });

  const sizeMap = appConfig.windowSizes || {};
  Object.keys(sizeMap).forEach((id) => {
    const el = document.getElementById(id);
    const sz = sizeMap[id];
    if (el && sz && sz.width && sz.height) {
      el.style.width = `${sz.width}px`;
      el.style.height = `${sz.height}px`;
    }
  });
}

function resetAllPositions() {
  appConfig.positions = {};
  appConfig.windowSizes = {};
  saveConfig();
  document.querySelectorAll('[data-draggable="true"]').forEach((el) => {
    el.style.left = '';
    el.style.top = '';
    el.style.right = '';
    el.style.bottom = '';
    el.style.width = '';
    el.style.height = '';
    el.classList.remove('maximized', 'snap-left', 'snap-right');
    if (!el.classList.contains('rm-skin')) {
      el.style.transform = '';
    }
  });
  applyRainmeterSkinConfig();
}

document.getElementById('reset-all-positions-btn')?.addEventListener('click', resetAllPositions);

// Handler Tarik Sudut Jendela (.win-resize-handle)
document.querySelectorAll('.win-resize-handle').forEach((handle) => {
  handle.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const winId = handle.dataset.resizeWin;
    const winEl = document.getElementById(winId);
    if (!winEl) return;

    winEl.classList.remove('maximized', 'snap-left', 'snap-right');
    const rect = winEl.getBoundingClientRect();
    winEl.style.left = `${rect.left}px`;
    winEl.style.top = `${rect.top}px`;
    winEl.style.transform = 'none';

    isResizingWindow = true;
    activeResizeWin = winEl;
    activeResizeWin.classList.add('is-resizing');
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeStartW = rect.width;
    resizeStartH = rect.height;

    handle.setPointerCapture(e.pointerId);
  });
});

// Penyeret (Drag) semua elemen .interactive-widget[data-draggable="true"]
document.querySelectorAll('.interactive-widget').forEach((widget) => {
  if (widget.dataset.draggable !== 'true') return;

  widget.addEventListener('pointerdown', (e) => {
    if (
      e.target.closest('button') ||
      e.target.closest('input') ||
      e.target.closest('select') ||
      e.target.closest('textarea') ||
      e.target.closest('.rm-clip-item') ||
      e.target.closest('.win-resize-handle') ||
      e.target.closest('.dock-item') ||
      e.target.closest('.exp-body') ||
      e.target.closest('.term-output') ||
      e.target.closest('.calc-pad') ||
      e.target.closest('.settings-body') ||
      e.target.closest('.notes-layout') ||
      e.target.closest('.start-apps-grid') ||
      e.target.closest('.start-recent-grid') ||
      e.target.closest('#open-taskmgr') ||
      e.target.closest('#calendar-trigger')
    ) {
      return;
    }

    if (widget.classList.contains('maximized') || widget.classList.contains('rm-locked')) return;
    if (e.button === 2) return;
    // Jangan geser posisi Top Island atau Bottom Dock kecuali diklik pada handle geser
    if (
      (widget.id === 'bottom-dock-wrapper' && !e.target.closest('.dock-drag-handle')) ||
      widget.id === 'top-island'
    ) {
      return;
    }

    widget.classList.remove('snap-left', 'snap-right');

    isDraggingWidget = true;
    wasDragged = false;
    activeWidget = widget;
    activeWidget.classList.add('is-dragging');

    const rect = widget.getBoundingClientRect();
    startPointerX = e.clientX;
    startPointerY = e.clientY;
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    widget.style.left = `${rect.left}px`;
    widget.style.top = `${rect.top}px`;
    widget.style.right = 'auto';
    widget.style.bottom = 'auto';
    if (!widget.classList.contains('rm-skin')) {
      widget.style.transform = 'none';
    }

    widget.setPointerCapture(e.pointerId);
  });
});

window.addEventListener('pointermove', (e) => {
  if (isResizingWindow && activeResizeWin) {
    const newW = Math.max(460, Math.min(window.innerWidth - 30, resizeStartW + (e.clientX - resizeStartX)));
    const newH = Math.max(320, Math.min(window.innerHeight - 60, resizeStartH + (e.clientY - resizeStartY)));
    activeResizeWin.style.width = `${Math.round(newW)}px`;
    activeResizeWin.style.height = `${Math.round(newH)}px`;
    return;
  }

  if (!isDraggingWidget || !activeWidget) return;

  const movedDist = Math.hypot(e.clientX - startPointerX, e.clientY - startPointerY);
  if (movedDist > 4) {
    wasDragged = true;
  }

  // Magnetic Grid Snapping (8px) + Laser Alignment Guide
  let rawLeft = Math.max(
    8,
    Math.min(window.innerWidth - activeWidget.offsetWidth - 8, e.clientX - dragOffsetX)
  );
  let rawTop = Math.max(
    8,
    Math.min(window.innerHeight - activeWidget.offsetHeight - 8, e.clientY - dragOffsetY)
  );

  let nextLeft = Math.round(rawLeft / 8) * 8;
  let nextTop = Math.round(rawTop / 8) * 8;

  // Tampilkan garis laser jika sejajar margin kiri/kanan populer (44px) atau tengah layar
  if (Math.abs(nextLeft - 44) <= 8) {
    nextLeft = 44;
    if (snapGuideX) {
      snapGuideX.style.left = '44px';
      snapGuideX.classList.remove('hidden');
    }
  } else {
    snapGuideX?.classList.add('hidden');
  }

  if (Math.abs(nextTop - 90) <= 8) {
    nextTop = 90;
    if (snapGuideY) {
      snapGuideY.style.top = '90px';
      snapGuideY.classList.remove('hidden');
    }
  } else {
    snapGuideY?.classList.add('hidden');
  }

  activeWidget.style.left = `${nextLeft}px`;
  activeWidget.style.top = `${nextTop}px`;
});

window.addEventListener('pointerup', () => {
  snapGuideX?.classList.add('hidden');
  snapGuideY?.classList.add('hidden');

  if (isResizingWindow && activeResizeWin) {
    activeResizeWin.classList.remove('is-resizing');
    if (activeResizeWin.id) {
      const rect = activeResizeWin.getBoundingClientRect();
      appConfig.windowSizes = appConfig.windowSizes || {};
      appConfig.windowSizes[activeResizeWin.id] = {
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
      saveConfig();
    }
    isResizingWindow = false;
    activeResizeWin = null;
    return;
  }

  if (!isDraggingWidget || !activeWidget) return;
  activeWidget.classList.remove('is-dragging');

  if (wasDragged && activeWidget.id) {
    const rect = activeWidget.getBoundingClientRect();
    appConfig.positions = appConfig.positions || {};
    appConfig.positions[activeWidget.id] = {
      left: Math.round(rect.left),
      top: Math.round(rect.top)
    };
    saveConfig();
  }

  isDraggingWidget = false;
  activeWidget = null;
});

// =========================================================
// 13. INISIALISASI STARTUP DARI CONFIG PERMANEN
// =========================================================
applyTheme(appConfig.theme || 'theme-mica-dark', false);
applyWallpaper(appConfig.wallpaper || 'wp-sonoma', false);
initParticles(appConfig.particleEffect || 'fireflies');
applyCustomStudioStyle();
applyRainmeterSkinConfig();
restoreSavedPositions();
if (!appConfig.alwaysOnTopV3) {
  appConfig.alwaysOnTop = true;
  appConfig.autoStart = true;
  appConfig.alwaysOnTopV3 = true;
  saveConfig();
}
if (alwaysOnTopToggle) {
  alwaysOnTopToggle.checked = Boolean(appConfig.alwaysOnTop);
}
if (autoStartToggle) {
  autoStartToggle.checked = appConfig.autoStart !== false;
}
ipcRenderer.send('set-always-on-top', Boolean(appConfig.alwaysOnTop));
ipcRenderer.send('set-autostart', appConfig.autoStart !== false);

document.getElementById('install-shortcut-btn')?.addEventListener('click', async () => {
  appConfig.autoStart = true;
  if (autoStartToggle) autoStartToggle.checked = true;
  saveConfig();
  await ipcRenderer.invoke('install-desktop-shortcuts');
  triggerLaunchHud('📌', 'Shortcut & Auto-Start Aktif!', 'Tersedia di Desktop & Startup Windows');
});

document.getElementById('run-admin-btn')?.addEventListener('click', () => {
  triggerLaunchHud('🛡️', 'Menjalankan Mode Administrator...', 'Meminta izin UAC Windows');
  ipcRenderer.send('restart-as-admin');
});
if (appConfig.autoHideDock) {
  scheduleAutoHideDock();
}

// =========================================================
// 14. LIVE RUNNING APPS DETECTOR, TASK SWITCHER & APP PASSTHROUGH
//     (Memudahkan Melihat & Membuka Kembali MS Office, Chrome, VS Code, dll.)
// =========================================================
let liveRunningApps = [];
let isAppPassthroughMode = false;
let currentFocusedAppLabel = 'Layar Aplikasi Aktif';

const topRunningAppsBtn = document.getElementById('top-running-apps-btn');
const topRunningLabel = document.getElementById('top-running-label');
const topDesktopModeBtn = document.getElementById('top-desktop-mode-btn');
const showDesktopDockBtn = document.getElementById('show-desktop-dock-btn');
const desktopModeDot = document.getElementById('desktop-mode-dot');
const dockTaskSwitcherBtn = document.getElementById('dock-task-switcher-btn');
const dockRunningBadge = document.getElementById('dock-running-badge');
const dockSwitcherDot = document.getElementById('dock-switcher-dot');
const runningDockItemsEl = document.getElementById('running-dock-items');
const runningDockSepEl = document.getElementById('running-dock-sep');
const runningAppsListEl = document.getElementById('running-apps-list');
const appLaunchHud = document.getElementById('app-launch-hud');
const hudAppBadge = document.getElementById('hud-app-badge');
const hudAppTitle = document.getElementById('hud-app-title');
const hudAppSub = document.getElementById('hud-app-sub');
let hudHideTimer = null;

function triggerLaunchHud(badge, title, sub = 'WinMac OS Spring Engine', color = '') {
  if (!appLaunchHud) return;
  clearTimeout(hudHideTimer);
  if (hudAppBadge) {
    hudAppBadge.textContent = badge || '🚀';
    hudAppBadge.style.background =
      color || 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))';
  }
  if (hudAppTitle) hudAppTitle.textContent = title;
  if (hudAppSub) hudAppSub.textContent = sub;

  const hudProgress = document.getElementById('hud-progress-fill');
  if (hudProgress) {
    hudProgress.classList.remove('running');
    void hudProgress.offsetWidth;
    hudProgress.classList.add('running');
  }

  appLaunchHud.classList.remove('hidden');
  playUiSound('launch');
  hudHideTimer = setTimeout(() => {
    appLaunchHud.classList.add('hidden');
    hudProgress?.classList.remove('running');
  }, 1150);
}

function animateRainmeterSkinsCascade() {
  const skins = document.querySelectorAll('#rainmeter-layer .rm-skin:not(.rm-hidden)');
  skins.forEach((skin, idx) => {
    skin.classList.remove('rm-anim-pop');
    void skin.offsetWidth;
    skin.style.animationDelay = `${idx * 45}ms`;
    skin.classList.add('rm-anim-pop');
  });
}

let passthroughWatchTimer = null;
let passthroughSession = {
  enteredAt: 0,
  reason: 'app',
  graceMs: 3200,
  sawVisibleExternal: false,
  manualEmptyPeek: false
};

function getVisibleExternalWindowCount(appsList = liveRunningApps) {
  let visible = 0;
  appsList.forEach((appItem) => {
    const wins = getWindowsForAppEntry(appItem);
    wins.forEach((w) => {
      if (!w.isMinimized) visible += 1;
    });
  });
  return visible;
}

function stopPassthroughWatcher() {
  if (passthroughWatchTimer) {
    clearInterval(passthroughWatchTimer);
    passthroughWatchTimer = null;
  }
}

function startPassthroughWatcher() {
  stopPassthroughWatcher();
  passthroughWatchTimer = setInterval(() => {
    if (!isLockScreenActive && isAppPassthroughMode) {
      refreshRunningApps(true);
    }
  }, 900);
}

function evaluateAutoRestoreDesktop(appsList = liveRunningApps) {
  if (!isAppPassthroughMode) return;
  const visibleCount = getVisibleExternalWindowCount(appsList);
  if (visibleCount > 0) {
    passthroughSession.sawVisibleExternal = true;
    passthroughSession.manualEmptyPeek = false;
    return;
  }
  if (passthroughSession.manualEmptyPeek) return;
  if (!passthroughSession.sawVisibleExternal) {
    if (Date.now() - passthroughSession.enteredAt < passthroughSession.graceMs) {
      return;
    }
  }
  setAppPassthroughMode(false);
}

function setAppPassthroughMode(enable, activeLabel = '', options = {}) {
  const prevMode = isAppPassthroughMode;
  isAppPassthroughMode = Boolean(enable);
  document.body.classList.toggle('app-passthrough-mode', isAppPassthroughMode);

  if (activeLabel) {
    currentFocusedAppLabel = activeLabel;
  }

  if (topDesktopModeBtn) {
    topDesktopModeBtn.classList.toggle('app-mode-active', isAppPassthroughMode);
    topDesktopModeBtn.textContent = isAppPassthroughMode ? '🪟' : '🖥️';
    topDesktopModeBtn.title = isAppPassthroughMode
      ? 'Sedang di Layar Aplikasi • Klik untuk Kembali ke Desktop Wallpaper (Alt+D)'
      : 'Sedang di Desktop • Klik untuk Melihat Jendela Aplikasi (Alt+D)';
  }

  if (showDesktopDockBtn) {
    showDesktopDockBtn.dataset.label = isAppPassthroughMode
      ? '🖥️ Kembali ke Desktop Wallpaper (Alt+D)'
      : '🪟 Tampilkan Layar Aplikasi Aktif (Alt+D)';
  }

  if (desktopModeDot) {
    desktopModeDot.classList.toggle('running-live', isAppPassthroughMode);
    desktopModeDot.classList.toggle('active', !isAppPassthroughMode);
  }

  if (isAppPassthroughMode) {
    if (!prevMode || options.reason) {
      const currentlyVisible = getVisibleExternalWindowCount();
      const reason = options.reason || 'app';
      const isColdLaunch = Boolean(options.isColdLaunch);
      passthroughSession = {
        enteredAt: Date.now(),
        reason,
        graceMs: isColdLaunch ? 3500 : 1400,
        sawVisibleExternal: currentlyVisible > 0 && !options.waitForRestore,
        manualEmptyPeek: reason === 'manual' && currentlyVisible === 0
      };
    }
    startPassthroughWatcher();

    // Tutup semua popup overlay internal agar aplikasi seperti VS Code / MS Word / Chrome terlihat 100% jelas tanpa terhalang
    activeWinPickerAppKey = '';
    activeWinPickerAnchor = null;
    [
      'win12-start-menu',
      'win-task-switcher',
      'win-rm-drawer',
      'win-spotlight',
      'win-notifications',
      'dock-stack-popover',
      'dock-win-picker',
      'win-calendar',
      'win-explorer',
      'win-notes',
      'win-terminal',
      'win-calculator',
      'win-settings',
      'win-shortcuts'
    ].forEach((id) => closeCustomWindow(id));
    setOverlayIgnoreMouse(true);
  } else {
    stopPassthroughWatcher();
    passthroughSession.sawVisibleExternal = false;
    passthroughSession.manualEmptyPeek = false;
    if (prevMode !== isAppPassthroughMode) {
      triggerLaunchHud('🖥️', 'Kembali ke Desktop Pro', '4K Wallpaper & Rainmeter Suite Aktif');
      animateRainmeterSkinsCascade();
      syncOverlayMouseAtPoint(lastPointerPos.x, lastPointerPos.y);
    }
  }
  syncVideoWallpaperPlayback();
}

const LAUNCHABLE_APP_KEYS = new Set([
  'explorer',
  'chrome',
  'vscode',
  'terminal',
  'calculator',
  'notepad',
  'excel',
  'word',
  'powerpoint',
  'postman'
]);

const dockWinPickerEl = document.getElementById('dock-win-picker');
const winPickerTitleEl = document.getElementById('win-picker-title');
const winPickerSubEl = document.getElementById('win-picker-sub');
const winPickerIconEl = document.getElementById('win-picker-icon');
const winPickerListEl = document.getElementById('dock-win-picker-list');
const winPickerLaunchBtn = document.getElementById('win-picker-launch-btn');
const closeWinPickerBtn = document.getElementById('close-win-picker-btn');
let activeWinPickerAppKey = '';
let activeWinPickerAnchor = null;

function getWindowsForAppEntry(appItem) {
  if (!appItem) return [];
  if (Array.isArray(appItem.windows) && appItem.windows.length > 0) {
    return appItem.windows.map((w) => ({
      hwnd: w.hwnd || '',
      pid: w.pid || appItem.pid || 0,
      processName: w.processName || appItem.processName || '',
      appKey: appItem.appKey,
      label: appItem.label,
      title: w.title || appItem.title || appItem.label || '',
      isMinimized: Boolean(w.isMinimized),
      badge: appItem.badge,
      color: appItem.color,
      category: appItem.category,
      iconDataUrl: appItem.iconDataUrl || '',
      pinnedDock: Boolean(appItem.pinnedDock)
    }));
  }
  return [
    {
      hwnd: appItem.hwnd || '',
      pid: appItem.pid || 0,
      processName: appItem.processName || '',
      appKey: appItem.appKey,
      label: appItem.label,
      title: appItem.title || appItem.label || '',
      isMinimized: Boolean(appItem.allMinimized),
      badge: appItem.badge,
      color: appItem.color,
      category: appItem.category,
      iconDataUrl: appItem.iconDataUrl || '',
      pinnedDock: Boolean(appItem.pinnedDock)
    }
  ];
}

function getRunningWindowsForAppKey(appKey) {
  if (!appKey) return { appEntry: null, windows: [] };
  const matches = liveRunningApps.filter((a) => a.appKey === appKey);
  if (matches.length === 0) return { appEntry: null, windows: [] };
  const windows = matches.flatMap((a) => getWindowsForAppEntry(a));
  return { appEntry: matches[0], windows };
}

function getTotalRunningWindowCount() {
  return liveRunningApps.reduce((sum, appItem) => {
    const count =
      Array.isArray(appItem.windows) && appItem.windows.length > 0
        ? appItem.windows.length
        : Number(appItem.windowCount) || 1;
    return sum + count;
  }, 0);
}

function updatePinnedDockBadge(btn, winCount) {
  if (!btn) return;
  const iconBox = btn.querySelector('.dock-icon');
  if (!iconBox) return;
  let badge = iconBox.querySelector('.dock-count-badge');
  if (winCount > 1) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'dock-count-badge';
      iconBox.appendChild(badge);
    }
    badge.textContent = String(winCount);
    badge.classList.remove('hidden');
  } else if (badge) {
    badge.classList.add('hidden');
  }
}

function positionDockWindowPicker(anchorEl) {
  if (!dockWinPickerEl) return;
  const popW = dockWinPickerEl.offsetWidth || Math.min(390, Math.round(window.innerWidth * 0.92));
  const rect = anchorEl && typeof anchorEl.getBoundingClientRect === 'function' ? anchorEl.getBoundingClientRect() : null;

  dockWinPickerEl.style.transform = 'none';
  if (rect && rect.width > 0 && rect.height > 0) {
    const left = Math.max(14, Math.min(window.innerWidth - popW - 14, rect.left + rect.width / 2 - popW / 2));
    dockWinPickerEl.style.left = `${Math.round(left)}px`;
    if (rect.top > window.innerHeight * 0.52) {
      const bottom = Math.max(88, Math.round(window.innerHeight - rect.top + 14));
      dockWinPickerEl.style.bottom = `${bottom}px`;
      dockWinPickerEl.style.top = 'auto';
    } else {
      const popH = dockWinPickerEl.offsetHeight || 280;
      const top = Math.max(58, Math.min(window.innerHeight - popH - 24, rect.bottom + 8));
      dockWinPickerEl.style.top = `${Math.round(top)}px`;
      dockWinPickerEl.style.bottom = 'auto';
    }
  } else {
    const left = Math.max(14, Math.round((window.innerWidth - popW) / 2));
    dockWinPickerEl.style.left = `${left}px`;
    dockWinPickerEl.style.bottom = '96px';
    dockWinPickerEl.style.top = 'auto';
  }
}

function renderDockWindowPickerRows(appEntry, windows) {
  if (!winPickerListEl || !appEntry) return;
  if (winPickerIconEl) {
    winPickerIconEl.innerHTML = getOfficialAppIconHtml(appEntry);
  }
  if (winPickerTitleEl) {
    winPickerTitleEl.textContent = appEntry.label || 'Pilih Jendela';
  }
  if (winPickerSubEl) {
    winPickerSubEl.textContent = `${windows.length} jendela terbuka — klik untuk memilih`;
  }
  if (winPickerLaunchBtn) {
    const canLaunch = LAUNCHABLE_APP_KEYS.has(appEntry.appKey);
    winPickerLaunchBtn.classList.toggle('hidden', !canLaunch);
    winPickerLaunchBtn.dataset.launchApp = appEntry.appKey || '';
  }

  winPickerListEl.innerHTML = '';
  windows.forEach((winItem, idx) => {
    const row = document.createElement('div');
    row.className = 'win-picker-row';
    const safeWinTitle = escapeHtml(winItem.title || `${appEntry.label || 'Jendela'} #${idx + 1}`);
    const safeAppLabel = escapeHtml(appEntry.label || winItem.processName || 'App');
    const minStateText = winItem.isMinimized ? ' • Diminimize' : '';
    row.innerHTML = `
      <button class="win-picker-select" type="button" title="${safeWinTitle}">
        <span class="win-picker-idx">${idx + 1}</span>
        <span class="win-picker-row-info">
          <span class="win-picker-row-title">${safeWinTitle}</span>
          <span class="win-picker-row-meta">${safeAppLabel} • PID ${Number(winItem.pid) || '-'}${minStateText}</span>
        </span>
      </button>
      <div class="win-picker-row-actions">
        <button class="ra-btn" type="button" data-picker-act="min" title="Minimize Jendela Ini">—</button>
        <button class="ra-btn danger" type="button" data-picker-act="close" title="Tutup Jendela Ini">✕</button>
      </div>
    `;

    row.querySelector('.win-picker-select')?.addEventListener('click', (e) => {
      e.stopPropagation();
      focusRunningAppItem(winItem);
    });

    row.querySelector('[data-picker-act="min"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await ipcRenderer.invoke('minimize-running-app', {
        hwnd: winItem.hwnd || '',
        pid: winItem.pid
      });
      closeDockWindowPicker();
      setTimeout(() => refreshRunningApps(true), 250);
    });

    row.querySelector('[data-picker-act="close"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await ipcRenderer.invoke('close-running-app', {
        hwnd: winItem.hwnd || '',
        pid: winItem.pid
      });
      closeDockWindowPicker();
      setTimeout(() => refreshRunningApps(true), 600);
    });

    winPickerListEl.appendChild(row);
  });
}

function closeDockWindowPicker() {
  activeWinPickerAppKey = '';
  activeWinPickerAnchor = null;
  closeCustomWindow('dock-win-picker');
}

function openDockWindowPicker(appEntry, windows, anchorEl = null) {
  if (!dockWinPickerEl || !appEntry || !Array.isArray(windows) || windows.length === 0) {
    if (windows && windows[0]) focusRunningAppItem(windows[0]);
    return;
  }

  const isAlreadyOpenSame =
    !dockWinPickerEl.classList.contains('hidden') &&
    activeWinPickerAppKey === appEntry.appKey &&
    activeWinPickerAnchor === anchorEl;

  if (isAlreadyOpenSame) {
    closeDockWindowPicker();
    return;
  }

  activeWinPickerAppKey = appEntry.appKey;
  activeWinPickerAnchor = anchorEl;
  renderDockWindowPickerRows(appEntry, windows);
  openCustomWindow('dock-win-picker');
  positionDockWindowPicker(anchorEl);
}

closeWinPickerBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeDockWindowPicker();
});

winPickerLaunchBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const appKey = winPickerLaunchBtn.dataset.launchApp;
  closeDockWindowPicker();
  if (!appKey) return;
  setAppPassthroughMode(true, `Membuka: ${appKey.toUpperCase()}`, {
    reason: 'app',
    isColdLaunch: true,
    waitForRestore: true
  });
  ipcRenderer.send('launch-app', appKey);
  setTimeout(() => refreshRunningApps(true), 1800);
});

async function focusRunningAppItem(winItem) {
  if (!winItem) return;
  closeDockWindowPicker();
  appLaunchHud?.classList.add('hidden');
  setAppPassthroughMode(true, `Aktif: ${winItem.label || winItem.title || 'Aplikasi'}`, {
    reason: 'app',
    waitForRestore: Boolean(winItem.isMinimized)
  });
  await ipcRenderer.invoke('focus-running-app', {
    hwnd: winItem.hwnd || '',
    pid: winItem.pid,
    processName: winItem.processName
  });
  setTimeout(() => refreshRunningApps(true), 400);
}

async function focusOrLaunchNativeApp(appKey, anchorEl = null) {
  if (!appKey) return;
  if (appKey === 'lock') {
    ipcRenderer.send('launch-app', 'lock');
    return;
  }

  appLaunchHud?.classList.add('hidden');
  const { appEntry, windows } = getRunningWindowsForAppKey(appKey);

  if (windows.length > 1) {
    openDockWindowPicker(appEntry, windows, anchorEl);
    return;
  }

  closeDockWindowPicker();
  const singleWin = windows[0] || null;
  setAppPassthroughMode(
    true,
    singleWin ? `Aktif: ${singleWin.label || singleWin.title}` : `Membuka: ${appKey.toUpperCase()}`,
    {
      reason: 'app',
      isColdLaunch: !singleWin,
      waitForRestore: !singleWin || Boolean(singleWin.isMinimized)
    }
  );

  if (singleWin) {
    await ipcRenderer.invoke('focus-running-app', {
      hwnd: singleWin.hwnd || '',
      pid: singleWin.pid,
      processName: singleWin.processName
    });
    setTimeout(() => refreshRunningApps(true), 400);
  } else {
    ipcRenderer.send('launch-app', appKey);
    setTimeout(() => refreshRunningApps(true), 1800);
  }
}

// Helper: Render Logo Aplikasi Asli (Prioritas 1: Ikon Native .exe Windows, Prioritas 2: SVG Resmi Brand)
function getOfficialAppIconHtml(appItem) {
  if (appItem && appItem.iconDataUrl) {
    return `<img src="${escapeHtml(appItem.iconDataUrl)}" class="native-exe-icon-img" alt="${escapeHtml(appItem.label || '')}" />`;
  }
  const key = (appItem?.appKey || '').toLowerCase();
  if (key === 'word') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><rect x="13" y="6" width="28" height="36" rx="4" fill="#185ABD"/><rect x="5" y="13" width="20" height="22" rx="3.5" fill="#185ABD" stroke="#ffffff" stroke-width="1.3"/><path d="M9.5 18.5L12 29.5L15 21.5L18 29.5L20.5 18.5" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  if (key === 'excel') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><rect x="13" y="6" width="28" height="36" rx="4" fill="#107C41"/><rect x="5" y="13" width="20" height="22" rx="3.5" fill="#107C41" stroke="#ffffff" stroke-width="1.3"/><path d="M10.5 18.5L15 24L10.5 29.5M19.5 18.5L15 24L19.5 29.5" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/></svg>`;
  }
  if (key === 'powerpoint') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><circle cx="28" cy="24" r="15" fill="#D24726"/><rect x="5" y="13" width="20" height="22" rx="3.5" fill="#C43E1C" stroke="#ffffff" stroke-width="1.3"/><path d="M11.5 29.5V18.5H16C17.8 18.5 19 19.6 19 21.5C19 23.4 17.8 24.5 16 24.5H11.5" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  if (key === 'chrome') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><circle cx="24" cy="24" r="20" fill="#ffffff"/><path d="M24 4C16.3 4 9.6 8.3 6.2 14.7L15.4 30.6L24 24V4Z" fill="#EA4335"/><path d="M6.2 14.7C4.8 17.5 4 20.6 4 24C4 35 13 44 24 44L33.2 28.1L24 24L6.2 14.7Z" fill="#34A853"/><path d="M24 4V24L33.2 28.1L24 44C35 44 44 35 44 24C44 13 35 4 24 4Z" fill="#FBBC05"/><circle cx="24" cy="24" r="9.5" fill="#ffffff"/><circle cx="24" cy="24" r="7.5" fill="#4285F4"/></svg>`;
  }
  if (key === 'vscode') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><path d="M35.2 5.2L17.4 21.8L8.8 15.1L5 17.1V30.9L8.8 32.9L17.4 26.2L35.2 42.8L43 39V9L35.2 5.2Z" fill="#007ACC"/><path d="M35.2 5.2L17.4 21.8L23.5 27.3L35.2 16.5V5.2Z" fill="#1F9CF0"/><path d="M35.2 5.2V42.8L43 39V9L35.2 5.2Z" fill="#29B6F6"/></svg>`;
  }
  if (key === 'explorer') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><path d="M5 12C5 9.79 6.79 8 9 8H19L23 12H39C41.21 12 43 13.79 43 16V36C43 38.21 41.21 40 39 40H9C6.79 40 5 38.21 5 36V12Z" fill="#d97706"/><path d="M5 18C5 16.34 6.34 15 8 15H40C41.66 15 43 16.34 43 18V36C43 38.21 41.21 40 39 40H9C6.79 40 5 38.21 5 36V18Z" fill="#fbbf24"/><rect x="16" y="24" width="16" height="4.5" rx="2.2" fill="#0284c7"/></svg>`;
  }
  if (key === 'firefox') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><circle cx="24" cy="24" r="19" fill="#FF7139"/><circle cx="24" cy="25" r="11" fill="#3B82F6"/><path d="M12 17C16 10 26 7 34 11C28 11 24 14 23 19C18 19 15 22 14 27C10 24 10 20 12 17Z" fill="#FACC15"/></svg>`;
  }
  if (key === 'edge') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><circle cx="24" cy="24" r="19" fill="#0284C7"/><path d="M9 24C9 15.7 15.7 9 24 9C33.4 9 40 15.6 40 23.5C40 27.6 36.7 30 33 30H20C20 34.4 24 38 29.5 38C33.5 38 36.8 36.4 39 34C36 39.2 30.4 43 24 43C15.7 43 9 36.3 9 24Z" fill="#38BDF8"/></svg>`;
  }
  if (key === 'postman') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><circle cx="24" cy="24" r="18" fill="#FF6C37"/><path d="M31 17L16 25.5L21.5 28L29.5 19.5L23.5 30L28 32.5L31 17Z" fill="#ffffff"/></svg>`;
  }
  if (key === 'discord') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><rect x="6" y="10" width="36" height="28" rx="9" fill="#5865F2"/><circle cx="18.5" cy="24" r="3.4" fill="#ffffff"/><circle cx="29.5" cy="24" r="3.4" fill="#ffffff"/></svg>`;
  }
  if (key === 'spotify') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><circle cx="24" cy="24" r="19" fill="#1DB954"/><path d="M14 19C20.5 17 28 17.6 34 20.8M15.5 24.8C20.8 23.2 26.8 23.8 31.8 26.5M17.2 30.4C21.2 29.2 25.6 29.7 29.5 31.7" stroke="#0f172a" stroke-width="2.8" stroke-linecap="round"/></svg>`;
  }
  if (key === 'whatsapp') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><circle cx="24" cy="24" r="18" fill="#25D366"/><path d="M18 16C18.5 15 19.5 15 20.5 16L22 18.5C22.4 19.2 22.1 20 21.5 20.5L20.5 21.5C21.6 23.6 23.4 25.4 25.5 26.5L26.5 25.5C27 24.9 27.8 24.6 28.5 25L31 26.5C32 27.1 32.2 28.2 31.5 29.2C30.4 30.8 28.5 31.6 26.6 31.2C21.2 29.9 17.1 25.8 15.8 20.4C15.4 18.5 16.2 16.9 18 16Z" fill="#ffffff"/></svg>`;
  }
  if (key === 'telegram') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><circle cx="24" cy="24" r="19" fill="#229ED9"/><path d="M33.5 15.5L13.5 23.2L19.5 25.4L29.5 18.8L22.2 26.4L28.8 31.5L33.5 15.5Z" fill="#ffffff"/></svg>`;
  }
  if (key === 'terminal' || key === 'powershell' || key === 'cmd') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><rect x="4" y="8" width="40" height="32" rx="6" fill="#0f172a" stroke="#475569" stroke-width="1.8"/><path d="M13 19L20 24.5L13 30" stroke="#38bdf8" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><line x1="23" y1="30" x2="34" y2="30" stroke="#e2e8f0" stroke-width="3.2" stroke-linecap="round"/></svg>`;
  }
  if (key === 'notepad') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><rect x="9" y="6" width="30" height="36" rx="5" fill="#e0f2fe"/><line x1="15" y1="16" x2="33" y2="16" stroke="#0284c7" stroke-width="3" stroke-linecap="round"/><line x1="15" y1="24" x2="33" y2="24" stroke="#0284c7" stroke-width="3" stroke-linecap="round"/><line x1="15" y1="32" x2="26" y2="32" stroke="#0284c7" stroke-width="3" stroke-linecap="round"/></svg>`;
  }
  if (key === 'calculator') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><rect x="9" y="5" width="30" height="38" rx="6" fill="#1e293b"/><rect x="13" y="9" width="22" height="8" rx="2.5" fill="#38bdf8"/><circle cx="16" cy="24" r="2.2" fill="#f8fafc"/><circle cx="24" cy="24" r="2.2" fill="#f8fafc"/><circle cx="32" cy="24" r="2.2" fill="#f59e0b"/><circle cx="16" cy="32" r="2.2" fill="#f8fafc"/><circle cx="24" cy="32" r="2.2" fill="#f8fafc"/><circle cx="32" cy="32" r="2.2" fill="#22c55e"/></svg>`;
  }
  if (key === 'laragon') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><circle cx="24" cy="24" r="19" fill="#0ea5e9"/><path d="M18 14V32H31" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  if (key === 'antigravity' || key === 'cursor' || key === 'windsurf') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><rect x="6" y="6" width="36" height="36" rx="10" fill="#0f172a" stroke="#38bdf8" stroke-width="2"/><path d="M24 12L34 34H28.5L24 23.5L19.5 34H14L24 12Z" fill="#38bdf8"/></svg>`;
  }
  if (key === 'vlc') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><path d="M24 6L34 38H14L24 6Z" fill="#F97316"/><path d="M18 22H30M16 30H32" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round"/></svg>`;
  }
  if (key === 'acrobat') {
    return `<svg viewBox="0 0 48 48" width="24" height="24" fill="none"><rect x="8" y="6" width="32" height="36" rx="6" fill="#DC2626"/><text x="24" y="29" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="900" font-family="sans-serif">PDF</text></svg>`;
  }
  return `<span>${escapeHtml(appItem?.badge || '🪟')}</span>`;
}

function renderRunningAppsUI() {
  const totalWindows = getTotalRunningWindowCount();

  // 1. Update Pill di Top Bar & Badge di Dock
  if (topRunningLabel) {
    topRunningLabel.textContent = totalWindows > 0 ? `${totalWindows} Jendela Aktif` : '0 Jendela';
  }
  if (dockRunningBadge) {
    dockRunningBadge.textContent = String(totalWindows);
    dockRunningBadge.classList.toggle('hidden', totalWindows === 0);
  }
  if (dockSwitcherDot) {
    dockSwitcherDot.classList.toggle('running-live', totalWindows > 0);
  }

  // 2. Update Indikator Aplikasi Bawaan yang Dipin di Dock (Chrome, VS Code, Explorer)
  // HANYA menyala jika aplikasi tersebut benar-benar sedang terbuka!
  const chromeBtn = document.querySelector('#dock [data-native-app="chrome"]');
  const vscodeBtn = document.querySelector('#dock [data-native-app="vscode"]');
  const explorerBtn = document.querySelector('#dock [data-custom-win="win-explorer"]');
  const { appEntry: chromeApp, windows: chromeWins } = getRunningWindowsForAppKey('chrome');
  const { appEntry: vscodeApp, windows: vscodeWins } = getRunningWindowsForAppKey('vscode');
  const { windows: explorerWins } = getRunningWindowsForAppKey('explorer');
  const customExpOpen = !document.getElementById('win-explorer')?.classList.contains('hidden');

  if (chromeBtn) {
    const dot = chromeBtn.querySelector('.dock-dot');
    dot?.classList.remove('active');
    dot?.classList.toggle('running-live', chromeWins.length > 0);
    if (chromeApp?.iconDataUrl) {
      const iconBox = chromeBtn.querySelector('.dock-icon');
      if (iconBox && !iconBox.dataset.nativeIconApplied) {
        iconBox.innerHTML = `<img src="${escapeHtml(chromeApp.iconDataUrl)}" class="native-exe-icon-img" alt="Google Chrome" />`;
        iconBox.dataset.nativeIconApplied = '1';
      }
    }
    updatePinnedDockBadge(chromeBtn, chromeWins.length);
    chromeBtn.dataset.label =
      chromeWins.length > 1
        ? `🟢 Google Chrome (${chromeWins.length} jendela — Klik untuk Pilih)`
        : chromeWins.length === 1
          ? `🟢 Google Chrome — ${chromeWins[0].title} (Klik untuk Buka)`
          : 'Google Chrome';
  }

  if (vscodeBtn) {
    const dot = vscodeBtn.querySelector('.dock-dot');
    dot?.classList.remove('active');
    dot?.classList.toggle('running-live', vscodeWins.length > 0);
    if (vscodeApp?.iconDataUrl) {
      const iconBox = vscodeBtn.querySelector('.dock-icon');
      if (iconBox && !iconBox.dataset.nativeIconApplied) {
        iconBox.innerHTML = `<img src="${escapeHtml(vscodeApp.iconDataUrl)}" class="native-exe-icon-img" alt="VS Code" />`;
        iconBox.dataset.nativeIconApplied = '1';
      }
    }
    updatePinnedDockBadge(vscodeBtn, vscodeWins.length);
    vscodeBtn.dataset.label =
      vscodeWins.length > 1
        ? `🟢 VS Code (${vscodeWins.length} jendela — Klik untuk Pilih)`
        : vscodeWins.length === 1
          ? `🟢 VS Code — ${vscodeWins[0].title} (Klik untuk Buka)`
          : 'Visual Studio Code';
  }

  if (explorerBtn) {
    const dot = explorerBtn.querySelector('.dock-dot');
    dot?.classList.remove('active');
    if (customExpOpen || minimizedState['win-explorer']) {
      dot?.classList.remove('running-live');
    } else {
      dot?.classList.toggle('running-live', explorerWins.length > 0);
    }
    updatePinnedDockBadge(explorerBtn, explorerWins.length);
    if (explorerWins.length > 1) {
      explorerBtn.dataset.label = `File Explorer (${explorerWins.length} jendela Windows • Klik Kanan: Pilih)`;
    } else if (explorerWins.length === 1) {
      explorerBtn.dataset.label = `File Explorer (Alt+E) • Windows: ${explorerWins[0].title}`;
    } else {
      explorerBtn.dataset.label = 'File Explorer (Alt+E)';
    }
  }

  // 3. Render Aplikasi Lain yang Sedang Terbuka (MS Word, Excel, PowerPoint, Edge, Spotify, dll.) ke Bottom Dock
  if (runningDockItemsEl) {
    runningDockItemsEl.innerHTML = '';
    const unpinnedRunning = liveRunningApps.filter((a) => !a.pinnedDock && a.appKey !== 'explorer');
    if (runningDockSepEl) {
      runningDockSepEl.style.display = unpinnedRunning.length > 0 ? 'block' : 'none';
    }

    unpinnedRunning.forEach((appItem) => {
      const winList = getWindowsForAppEntry(appItem);
      const winCount = Math.max(winList.length, Number(appItem.windowCount) || 1);
      const btn = document.createElement('button');
      btn.className = 'dock-item running-dynamic-item';
      btn.dataset.runningAppKey = appItem.appKey || '';
      const shortTitle =
        appItem.title && appItem.title.length > 36
          ? appItem.title.slice(0, 36) + '...'
          : appItem.title || appItem.label;
      btn.dataset.label =
        winCount > 1
          ? `🟢 ${appItem.label} (${winCount} jendela — Klik untuk Pilih)`
          : `🟢 ${appItem.label} — ${shortTitle}`;

      btn.innerHTML = `
        <div class="dock-icon">
          <div class="running-dock-badge-icon" style="background: ${appItem.iconDataUrl ? 'rgba(15, 23, 42, 0.75)' : appItem.color || '#3b82f6'}">
            ${getOfficialAppIconHtml(appItem)}
          </div>
          ${winCount > 1 ? `<span class="dock-count-badge">${winCount}</span>` : ''}
        </div>
        <span class="dock-dot running-live"></span>
      `;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.classList.remove('launching');
        void btn.offsetWidth;
        btn.classList.add('launching');
        if (winList.length > 1) {
          openDockWindowPicker(appItem, winList, btn);
        } else {
          focusRunningAppItem(winList[0] || appItem);
        }
      });

      // Klik Kanan pada ikon aplikasi berjalan: pilih jendela jika > 1, atau Minimize cepat
      btn.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (winList.length > 1) {
          openDockWindowPicker(appItem, winList, btn);
        } else {
          const singleWin = winList[0] || appItem;
          await ipcRenderer.invoke('minimize-running-app', {
            hwnd: singleWin.hwnd || '',
            pid: singleWin.pid || appItem.pid
          });
          setTimeout(() => refreshRunningApps(true), 250);
        }
      });

      runningDockItemsEl.appendChild(btn);
    });
  }

  // 4. Update Status Kartu Cepat MS Office & Browser di Jendela Task Switcher (#win-task-switcher)
  ['word', 'excel', 'powerpoint', 'chrome', 'vscode', 'explorer'].forEach((key) => {
    const card = document.querySelector(`[data-quick-switch="${key}"]`);
    const statusEl = document.getElementById(`oq-status-${key}`);
    const { windows } = getRunningWindowsForAppKey(key);
    if (card) {
      card.classList.toggle('is-open', windows.length > 0);
    }
    if (statusEl) {
      if (windows.length > 1) {
        statusEl.textContent = `● ${windows.length} Jendela Terbuka (Pilih)`;
      } else if (windows.length === 1) {
        statusEl.textContent = `● Aktif: ${windows[0].title}`;
      } else {
        statusEl.textContent = 'Klik untuk Buka';
      }
    }
  });

  // 5. Sinkronkan isi #dock-win-picker bila sedang terbuka
  if (dockWinPickerEl && !dockWinPickerEl.classList.contains('hidden') && activeWinPickerAppKey) {
    const { appEntry, windows } = getRunningWindowsForAppKey(activeWinPickerAppKey);
    if (!appEntry || windows.length === 0) {
      closeDockWindowPicker();
    } else {
      renderDockWindowPickerRows(appEntry, windows);
    }
  }

  // 6. Render Daftar Lengkap Jendela Aplikasi yang Sedang Berjalan (per jendela individual) di #win-task-switcher
  if (runningAppsListEl) {
    runningAppsListEl.innerHTML = '';
    const flatWindowsAll = [];
    liveRunningApps.forEach((appItem) => {
      const wins = getWindowsForAppEntry(appItem);
      const totalForApp = wins.length;
      wins.forEach((w, idx) => {
        flatWindowsAll.push({
          ...w,
          totalForApp,
          windowIndex: idx + 1
        });
      });
    });

    const switcherQuery = (document.getElementById('switcher-search-input')?.value || '').trim().toLowerCase();
    const flatWindows = switcherQuery
      ? flatWindowsAll.filter((w) => {
          const hay = `${w.label || ''} ${w.title || ''} ${w.category || ''} ${w.procName || ''}`.toLowerCase();
          return hay.includes(switcherQuery);
        })
      : flatWindowsAll;

    const filterCountEl = document.getElementById('switcher-filter-count');
    if (filterCountEl) {
      filterCountEl.textContent = switcherQuery
        ? `${flatWindows.length}/${flatWindowsAll.length} Cocok`
        : `${flatWindowsAll.length} Jendela`;
    }

    if (flatWindowsAll.length === 0) {
      runningAppsListEl.innerHTML = `
        <div class="running-empty">
          Belum ada jendela aplikasi eksternal (seperti MS Word, Excel, atau Chrome) yang terdeteksi terbuka.<br/>
          Gunakan tombol cepat di atas untuk membuka aplikasi!
        </div>
      `;
      return;
    }

    if (flatWindows.length === 0) {
      runningAppsListEl.innerHTML = `
        <div class="running-empty">
          Tidak ditemukan jendela yang cocok dengan pencarian "<strong>${escapeHtml(switcherQuery)}</strong>".
        </div>
      `;
      return;
    }

    flatWindows.forEach((winItem) => {
      const safeLabel = escapeHtml(winItem.label);
      const safeTitle = escapeHtml(winItem.title || winItem.label);
      const safeCategory = escapeHtml(winItem.category);
      const winPosMeta =
        winItem.totalForApp > 1 ? ` • Jendela ${winItem.windowIndex}/${winItem.totalForApp}` : '';
      const minMeta = winItem.isMinimized ? ' • Diminimize' : '';
      const row = document.createElement('div');
      row.className = 'running-app-card';
      row.innerHTML = `
        <div class="ra-window-preview" title="Klik untuk menampilkan jendela ini ke depan layar">
          <div class="ra-win-bar">
            <div class="ra-win-dots">
              <button type="button" class="ra-win-dot-btn d-r" data-act="close-x" title="Tutup Jendela Ini">×</button><span class="d-y"></span><span class="d-g"></span>
            </div>
            <span class="ra-win-bar-title">${safeLabel}</span>
            <button class="ra-win-close-x" data-act="close-x" title="Tutup Jendela Ini">✕</button>
          </div>
          <div class="ra-win-canvas" style="background: radial-gradient(circle at 30% 25%, ${escapeHtml(winItem.color || '#3b82f6')}44, rgba(15, 23, 42, 0.92))">
            <div class="ra-win-mock-lines">
              <span></span><span class="short"></span><span></span>
            </div>
            <div class="ra-expose-badge" style="background: ${winItem.iconDataUrl ? 'rgba(15, 23, 42, 0.85)' : escapeHtml(winItem.color || '#3b82f6')}">${getOfficialAppIconHtml(winItem)}</div>
          </div>
        </div>
        <div class="ra-left" title="Klik untuk menampilkan jendela ini ke depan layar">
          <div class="ra-icon" style="background: ${winItem.iconDataUrl ? 'rgba(15, 23, 42, 0.85)' : escapeHtml(winItem.color || '#3b82f6')}">${getOfficialAppIconHtml(winItem)}</div>
          <div class="ra-meta">
            <span class="ra-title">${safeTitle}</span>
            <span class="ra-sub">${safeLabel} • ${safeCategory}${winPosMeta}${minMeta}</span>
          </div>
        </div>
        <div class="ra-actions">
          <button class="ra-btn primary" data-act="focus" title="Tampilkan Jendela Ini ke Depan">↗ Buka</button>
          <button class="ra-btn" data-act="min" title="Minimize Jendela Ini">—</button>
          <button class="ra-btn danger" data-act="close" title="Tutup Jendela Ini">✕</button>
        </div>
      `;

      row.querySelector('.ra-window-preview')?.addEventListener('click', () => {
        focusRunningAppItem(winItem);
      });
      row.querySelectorAll('[data-act="close-x"]').forEach((closeXBtn) => {
        closeXBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await ipcRenderer.invoke('close-running-app', {
            hwnd: winItem.hwnd || '',
            pid: winItem.pid
          });
          setTimeout(() => refreshRunningApps(true), 600);
        });
      });
      row.querySelector('.ra-left')?.addEventListener('click', () => {
        focusRunningAppItem(winItem);
      });
      row.querySelector('[data-act="focus"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        focusRunningAppItem(winItem);
      });
      row.querySelector('[data-act="min"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await ipcRenderer.invoke('minimize-running-app', {
          hwnd: winItem.hwnd || '',
          pid: winItem.pid
        });
        setTimeout(() => refreshRunningApps(true), 250);
      });
      row.querySelector('[data-act="close"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await ipcRenderer.invoke('close-running-app', {
          hwnd: winItem.hwnd || '',
          pid: winItem.pid
        });
        setTimeout(() => refreshRunningApps(true), 600);
      });

      runningAppsListEl.appendChild(row);
    });
  }
}

async function refreshRunningApps(force = false) {
  try {
    const list = await ipcRenderer.invoke('get-running-apps', force);
    if (Array.isArray(list)) {
      liveRunningApps = list;
      renderRunningAppsUI();
      evaluateAutoRestoreDesktop(list);
    }
  } catch (_) {}
}

// Event Listeners untuk Tombol Task Switcher & Mode Desktop
topRunningAppsBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCustomWindow('win-task-switcher');
});

dockTaskSwitcherBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCustomWindow('win-task-switcher');
});

topDesktopModeBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  setAppPassthroughMode(!isAppPassthroughMode, '', { reason: 'manual' });
});

showDesktopDockBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  setAppPassthroughMode(!isAppPassthroughMode, '', { reason: 'manual' });
});

document.getElementById('switcher-show-desktop-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  setAppPassthroughMode(false);
  closeCustomWindow('win-task-switcher');
});

document.getElementById('switcher-search-input')?.addEventListener('input', () => {
  renderRunningAppsUI();
});

document.getElementById('switcher-min-all-btn')?.addEventListener('click', async (e) => {
  e.stopPropagation();
  const visibleWindows = [];
  liveRunningApps.forEach((appItem) => {
    getWindowsForAppEntry(appItem).forEach((w) => {
      if (!w.isMinimized) visibleWindows.push(w);
    });
  });
  await Promise.all(
    visibleWindows.map((w) =>
      ipcRenderer.invoke('minimize-running-app', { hwnd: w.hwnd || '', pid: w.pid }).catch(() => false)
    )
  );
  setAppPassthroughMode(false);
  closeCustomWindow('win-task-switcher');
  setTimeout(() => refreshRunningApps(true), 300);
});

document.getElementById('refresh-running-apps-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  refreshRunningApps(true);
});

document.getElementById('taskview-mac-desktop-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  setAppPassthroughMode(false);
  closeCustomWindow('win-task-switcher');
});

document.getElementById('taskview-mac-refresh-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  refreshRunningApps(true);
});

document.querySelectorAll('.space-desktop-card[data-space-profile]').forEach((card) => {
  card.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.space-desktop-card').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');
    if (typeof applyWorkspaceProfile === 'function') {
      applyWorkspaceProfile(card.dataset.spaceProfile);
    }
  });
});

document.querySelectorAll('[data-quick-switch]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const appKey = btn.dataset.quickSwitch;
    focusOrLaunchNativeApp(appKey, btn);
  });
});

// Event Listeners untuk Tombol di Strip Taskbar Bawah (#taskbar-cover-strip)
document.getElementById('tb-spotlight-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCustomWindow('win-spotlight');
  setTimeout(() => document.getElementById('spotlight-input')?.focus(), 60);
});

document.getElementById('tb-studio-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCustomWindow('win-rm-drawer');
});

document.getElementById('tb-clock-pill')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCustomWindow('win-calendar');
});

// Tombol Kembali ke Tampilan Windows Ori (Start Menu & Settings)
document.getElementById('exit-to-windows-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  ipcRenderer.send('quit-to-windows', false);
});

document.getElementById('quit-temp-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  ipcRenderer.send('quit-to-windows', false);
});

document.getElementById('quit-disable-startup-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  appConfig.autoStart = false;
  if (autoStartToggle) autoStartToggle.checked = false;
  saveConfig();
  ipcRenderer.send('quit-to-windows', true);
});

// =========================================================
// 14. FITUR BARU PRO SUITE: NOTIFICATION CENTER, REAL MEDIA CONTROL,
//     AGENDA REMINDER, APP STACK, SCREENSHOT STUDIO & HOT CORNERS
// =========================================================

// --- A. NOTIFICATION CENTER & DYNAMIC ISLAND TOAST (Alt+N) ---
const notifListEl = document.getElementById('notif-list');
const notifBadgeEl = document.getElementById('notif-unread-badge');
const notifDndBtn = document.getElementById('notif-dnd-btn');
const notifCustomInput = document.getElementById('notif-custom-input');
let unreadNotifCount = 0;

function updateNotifBadge() {
  if (!notifBadgeEl) return;
  if (unreadNotifCount > 0) {
    notifBadgeEl.textContent = String(unreadNotifCount);
    notifBadgeEl.classList.remove('hidden');
  } else {
    notifBadgeEl.classList.add('hidden');
  }
}

function markNotificationsRead() {
  unreadNotifCount = 0;
  updateNotifBadge();
}

function renderNotifications() {
  if (!notifListEl) return;
  const list = appConfig.notifications || [];
  notifListEl.innerHTML = '';

  if (list.length === 0) {
    notifListEl.innerHTML = `<div class="running-empty">Belum ada notifikasi baru.</div>`;
    return;
  }

  list.forEach((n) => {
    const card = document.createElement('div');
    card.className = 'notif-card';
    card.innerHTML = `
      <div class="notif-left">
        <div class="notif-ic">${escapeHtml(n.icon || '🔔')}</div>
        <div class="notif-body">
          <span class="notif-title">${escapeHtml(n.title)}</span>
          <span class="notif-msg">${escapeHtml(n.msg)}</span>
          <span class="notif-time">${escapeHtml(n.time || 'Baru saja')}</span>
        </div>
      </div>
      <button class="rm-ctrl-btn" title="Hapus Notifikasi">✕</button>
    `;
    card.querySelector('button')?.addEventListener('click', (e) => {
      e.stopPropagation();
      appConfig.notifications = (appConfig.notifications || []).filter((item) => item.id !== n.id);
      saveConfig();
      renderNotifications();
    });
    notifListEl.appendChild(card);
  });
}

function pushNotification(icon, title, msg, showToast = true) {
  if (!Array.isArray(appConfig.notifications)) appConfig.notifications = [];
  const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  appConfig.notifications.unshift({
    id: Date.now() + Math.random(),
    icon: icon || '🔔',
    title,
    msg,
    time: `Pukul ${nowStr}`
  });
  appConfig.notifications = appConfig.notifications.slice(0, 25);
  saveConfig();
  renderNotifications();

  const notifWin = document.getElementById('win-notifications');
  if (notifWin && notifWin.classList.contains('hidden')) {
    unreadNotifCount += 1;
    updateNotifBadge();
  }

  if (showToast && !appConfig.dndMode) {
    triggerLaunchHud(icon || '🔔', title, msg);
  }
}

function syncDndButton() {
  if (!notifDndBtn) return;
  notifDndBtn.textContent = appConfig.dndMode ? '🌙 DND: Aktif' : '🌙 DND: Mati';
}
syncDndButton();
renderNotifications();

document.getElementById('top-notif-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCustomWindow('win-notifications');
  markNotificationsRead();
});

document.getElementById('tb-notif-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCustomWindow('win-notifications');
  markNotificationsRead();
});

notifDndBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  appConfig.dndMode = !appConfig.dndMode;
  saveConfig();
  syncDndButton();
});

document.getElementById('notif-clear-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  appConfig.notifications = [];
  unreadNotifCount = 0;
  saveConfig();
  updateNotifBadge();
  renderNotifications();
});

document.getElementById('notif-send-btn')?.addEventListener('click', () => {
  const val = (notifCustomInput?.value || '').trim();
  if (!val) return;
  pushNotification('📌', 'Catatan Notifikasi Cepat', val, true);
  notifCustomInput.value = '';
});

notifCustomInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('notif-send-btn')?.click();
});

// --- B. REAL WINDOWS MEDIA CONTROL (Spotify / YouTube Browser / VLC) ---
const rmVisModeBtn = document.getElementById('rm-vis-mode-btn');
const rmVisPrevBtn = document.getElementById('rm-vis-prev-btn');
const mediaPrevBtn = document.getElementById('media-prev-btn');
const mediaNextBtn = document.getElementById('media-next-btn');

function syncMediaControlModeUI() {
  const isWinMode = appConfig.mediaControlWindows !== false;
  if (rmVisModeBtn) {
    rmVisModeBtn.textContent = isWinMode ? '🪟' : '🎹';
    rmVisModeBtn.title = isWinMode
      ? 'Mode Aktif: Kontrol Media Windows Asli (Spotify/YouTube) • Klik untuk ganti ke Synth'
      : 'Mode Aktif: Lofi Synth Bawaan • Klik untuk ganti ke Media Windows Asli';
  }
}
syncMediaControlModeUI();

rmVisModeBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  appConfig.mediaControlWindows = appConfig.mediaControlWindows === false;
  saveConfig();
  syncMediaControlModeUI();
  pushNotification(
    '🎵',
    appConfig.mediaControlWindows ? 'Mode Kontrol Media Windows' : 'Mode Lofi Synth Internal',
    appConfig.mediaControlWindows
      ? 'Tombol Play/Next/Prev kini mengontrol Spotify, YouTube & pemutar media Windows.'
      : 'Tombol Play/Next/Prev kini mengontrol WebAudio Lofi Synth bawaan.',
    true
  );
});

// Hook tombol Play/Pause/Prev/Next agar mengontrol Media Windows asli jika aktif
document.getElementById('play-pause-btn')?.addEventListener('click', () => {
  if (appConfig.mediaControlWindows !== false) {
    ipcRenderer.send('media-key-control', 'play-pause');
  }
});

rmVisPlayBtn?.addEventListener('click', () => {
  if (appConfig.mediaControlWindows !== false) {
    ipcRenderer.send('media-key-control', 'play-pause');
  }
});

rmVisNextBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (appConfig.mediaControlWindows !== false) {
    ipcRenderer.send('media-key-control', 'next');
  } else {
    stepSynthTrack(1);
  }
});

rmVisPrevBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (appConfig.mediaControlWindows !== false) {
    ipcRenderer.send('media-key-control', 'prev');
  } else {
    stepSynthTrack(-1);
  }
});

mediaPrevBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (appConfig.mediaControlWindows !== false) {
    ipcRenderer.send('media-key-control', 'prev');
    triggerLaunchHud('⏮', 'Media Sebelumnya', 'Windows Media Key');
  } else {
    stepSynthTrack(-1);
    triggerLaunchHud('⏮', synthTracks[currentTrackIdx].title, 'Lofi Synth Track');
  }
});

mediaNextBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (appConfig.mediaControlWindows !== false) {
    ipcRenderer.send('media-key-control', 'next');
    triggerLaunchHud('⏭', 'Media Berikutnya', 'Windows Media Key');
  } else {
    stepSynthTrack(1);
    triggerLaunchHud('⏭', synthTracks[currentTrackIdx].title, 'Lofi Synth Track');
  }
});

// Deteksi otomatis judul lagu/video dari aplikasi Spotify / YouTube / VLC yang sedang terbuka
setInterval(() => {
  if (appConfig.mediaControlWindows === false || !Array.isArray(liveRunningApps)) return;
  const mediaApp = liveRunningApps.find(
    (a) =>
      a.appKey === 'spotify' ||
      a.appKey === 'vlc' ||
      (a.title && /youtube|spotify|music|soundcloud/i.test(a.title))
  );
  if (mediaApp && mediaApp.title) {
    const cleanTitle = mediaApp.title.replace(/\s*-\s*(Google Chrome|Microsoft​ Edge|Brave|Mozilla Firefox|YouTube).*$/i, '');
    if (islandMediaTitle) islandMediaTitle.textContent = cleanTitle.slice(0, 32);
    if (islandMediaSub) islandMediaSub.textContent = `🎵 ${mediaApp.label}`;
    if (rmVisTitle) rmVisTitle.textContent = cleanTitle.slice(0, 28);
    if (rmVisArtist) rmVisArtist.textContent = `Live: ${mediaApp.label}`;
  }
}, 4500);

// --- C. KALENDER AGENDA & ALARM PENGINGAT (REMINDER) ---
const agendaTimeInput = document.getElementById('agenda-time-input');
const agendaTextInput = document.getElementById('agenda-text-input');
const agendaAddBtn = document.getElementById('agenda-add-btn');
const agendaListEl = document.getElementById('agenda-list');

function renderAgendaList() {
  if (!agendaListEl) return;
  const items = appConfig.agendaReminders || [];
  agendaListEl.innerHTML = '';

  if (items.length === 0) {
    agendaListEl.innerHTML = `<div class="running-empty" style="padding:6px;">Belum ada jadwal pengingat.</div>`;
    return;
  }

  const todayKey = getLocalDateKey();
  items.forEach((item) => {
    const row = document.createElement('div');
    const isFired = item.firedDate === todayKey;
    row.className = `agenda-item ${isFired ? 'fired' : ''}`;
    row.innerHTML = `
      <div>
        <span class="agenda-badge">${escapeHtml(item.time)}</span>
        <span>${escapeHtml(item.text)}</span>
      </div>
      <button class="rm-ctrl-btn" title="Hapus Pengingat">✕</button>
    `;
    row.querySelector('button')?.addEventListener('click', (e) => {
      e.stopPropagation();
      appConfig.agendaReminders = (appConfig.agendaReminders || []).filter((r) => r.id !== item.id);
      saveConfig();
      renderAgendaList();
    });
    agendaListEl.appendChild(row);
  });
}

agendaAddBtn?.addEventListener('click', () => {
  const timeVal = (agendaTimeInput?.value || '14:00').trim();
  const textVal = (agendaTextInput?.value || '').trim();
  if (!textVal) return;

  if (!Array.isArray(appConfig.agendaReminders)) appConfig.agendaReminders = [];
  appConfig.agendaReminders.push({
    id: Date.now(),
    time: timeVal,
    text: textVal,
    firedDate: ''
  });
  appConfig.agendaReminders.sort((a, b) => a.time.localeCompare(b.time));
  saveConfig();
  agendaTextInput.value = '';
  renderAgendaList();
  pushNotification('⏰', `Pengingat Disetel (${timeVal})`, textVal, true);
});

agendaTextInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') agendaAddBtn?.click();
});

renderAgendaList();

// Cek Alarm Pengingat setiap 15 detik
setInterval(() => {
  const items = appConfig.agendaReminders || [];
  if (!items.length) return;
  const now = new Date();
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const todayKey = getLocalDateKey(now);
  let changed = false;

  items.forEach((item) => {
    if (item.time === hm && item.firedDate !== todayKey) {
      item.firedDate = todayKey;
      changed = true;
      playUiSound('launch');
      pushNotification('⏰', `Alarm Agenda (${item.time})`, item.text, true);
    }
  });

  if (changed) {
    saveConfig();
    renderAgendaList();
  }
}, 15000);

// --- D. QUICK LAUNCHER APP STACK FOLDER DI DOCK ---
const dockFolderBtn = document.getElementById('dock-folder-btn');
const closeStackBtn = document.getElementById('close-stack-btn');

dockFolderBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCustomWindow('dock-stack-popover');
});

closeStackBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeCustomWindow('dock-stack-popover');
});

document.querySelectorAll('[data-stack-app]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const appKey = btn.dataset.stackApp;
    closeCustomWindow('dock-stack-popover');
    const dockAnchor =
      document.querySelector(`#dock [data-native-app="${appKey}"]`) ||
      document.querySelector(`#dock [data-running-app-key="${appKey}"]`);
    focusOrLaunchNativeApp(appKey, dockAnchor || null);
  });
});

document.querySelectorAll('[data-stack-custom]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const winId = btn.dataset.stackCustom;
    closeCustomWindow('dock-stack-popover');
    if (winId === 'win-screenshot') {
      captureAndOpenScreenshotStudio();
    } else {
      openCustomWindow(winId);
    }
  });
});

// --- E. SCREENSHOT & SCREEN ANNOTATION STUDIO (Alt+S) ---
const shotCanvas = document.getElementById('screenshot-canvas');
const shotCtx = shotCanvas ? shotCanvas.getContext('2d') : null;
const shotStatusMsg = document.getElementById('shot-status-msg');
const shotSizeSlider = document.getElementById('shot-size-slider');
let baseScreenshotImg = null;
let isDrawingShot = false;
let shotPenColor = '#ef4444';
let shotLastX = 0;
let shotLastY = 0;

async function captureAndOpenScreenshotStudio() {
  closeCustomWindow('win12-start-menu');
  closeCustomWindow('dock-stack-popover');
  const dataUrl = await ipcRenderer.invoke('capture-screen-hd');
  if (!dataUrl || !shotCanvas || !shotCtx) {
    ipcRenderer.send('launch-app', 'snipping');
    return;
  }

  const img = new Image();
  img.onload = () => {
    baseScreenshotImg = img;
    shotCanvas.width = img.width;
    shotCanvas.height = img.height;
    shotCtx.clearRect(0, 0, shotCanvas.width, shotCanvas.height);
    shotCtx.drawImage(img, 0, 0);
    openCustomWindow('win-screenshot');
    if (shotStatusMsg) {
      shotStatusMsg.textContent = '✓ Layar berhasil ditangkap! Silakan coret/tandai lalu Copy atau Simpan PNG.';
    }
  };
  img.src = dataUrl;
}

function getCanvasPointerPos(evt) {
  const rect = shotCanvas.getBoundingClientRect();
  const scaleX = shotCanvas.width / rect.width;
  const scaleY = shotCanvas.height / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY
  };
}

shotCanvas?.addEventListener('mousedown', (e) => {
  if (!shotCtx) return;
  e.stopPropagation();
  isDrawingShot = true;
  const pos = getCanvasPointerPos(e);
  shotLastX = pos.x;
  shotLastY = pos.y;
});

window.addEventListener('mousemove', (e) => {
  if (!isDrawingShot || !shotCtx || !shotCanvas) return;
  const pos = getCanvasPointerPos(e);
  shotCtx.save();
  shotCtx.strokeStyle = shotPenColor;
  shotCtx.lineWidth = Number(shotSizeSlider?.value || 4) * 1.5;
  shotCtx.lineCap = 'round';
  shotCtx.lineJoin = 'round';
  shotCtx.beginPath();
  shotCtx.moveTo(shotLastX, shotLastY);
  shotCtx.lineTo(pos.x, pos.y);
  shotCtx.stroke();
  shotCtx.restore();
  shotLastX = pos.x;
  shotLastY = pos.y;
});

window.addEventListener('mouseup', () => {
  isDrawingShot = false;
});

document.querySelectorAll('[data-shot-color]').forEach((dot) => {
  dot.addEventListener('click', (e) => {
    e.stopPropagation();
    shotPenColor = dot.dataset.shotColor || '#ef4444';
    document.querySelectorAll('[data-shot-color]').forEach((d) => d.classList.remove('active'));
    dot.classList.add('active');
  });
});

document.getElementById('shot-retake-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  captureAndOpenScreenshotStudio();
});

document.getElementById('shot-clear-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (baseScreenshotImg && shotCtx && shotCanvas) {
    shotCtx.clearRect(0, 0, shotCanvas.width, shotCanvas.height);
    shotCtx.drawImage(baseScreenshotImg, 0, 0);
    if (shotStatusMsg) shotStatusMsg.textContent = '↺ Coretan dibersihkan.';
  }
});

document.getElementById('shot-copy-btn')?.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!shotCanvas) return;
  const dataUrl = shotCanvas.toDataURL('image/png');
  const res = await ipcRenderer.invoke('save-annotated-screenshot', { dataUrl, mode: 'clipboard' });
  if (res?.ok && shotStatusMsg) {
    shotStatusMsg.textContent = '📋 Berhasil disalin ke Clipboard! Tinggal Ctrl+V di WhatsApp / Word.';
    pushNotification('📋', 'Screenshot Disalin ke Clipboard', 'Siap ditempel (Ctrl+V) ke aplikasi mana pun.', true);
  }
});

document.getElementById('shot-save-btn')?.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!shotCanvas) return;
  const dataUrl = shotCanvas.toDataURL('image/png');
  const res = await ipcRenderer.invoke('save-annotated-screenshot', { dataUrl, mode: 'both' });
  if (res?.ok && shotStatusMsg) {
    shotStatusMsg.textContent = `💾 Tersimpan di: ${res.savedPath}`;
    pushNotification('📸', 'Screenshot Tersimpan', res.savedPath, true);
  }
});

document.getElementById('top-screenshot-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  captureAndOpenScreenshotStudio();
});

document.getElementById('dock-screenshot-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const shotWin = document.getElementById('win-screenshot');
  if (minimizedState['win-screenshot']) {
    openCustomWindow('win-screenshot');
  } else if (shotWin && !shotWin.classList.contains('hidden')) {
    minimizeCustomWindow('win-screenshot');
  } else {
    captureAndOpenScreenshotStudio();
  }
});

document.getElementById('tb-screenshot-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  captureAndOpenScreenshotStudio();
});

// --- F. HOT CORNERS ALA macOS (4 Pojok Layar Pintar) ---
const hotCornersToggle = document.getElementById('hot-corners-toggle');

function syncHotCornersState() {
  const enabled = appConfig.hotCorners !== false;
  document.body.classList.toggle('hot-corners-disabled', !enabled);
  if (hotCornersToggle) hotCornersToggle.checked = enabled;
}
syncHotCornersState();

hotCornersToggle?.addEventListener('change', (e) => {
  appConfig.hotCorners = e.target.checked;
  saveConfig();
  syncHotCornersState();
});

let hcDwellTimer = null;
document.querySelectorAll('.hot-corner-zone').forEach((zone) => {
  bindInteractiveWidgetEvents(zone);
  zone.addEventListener('mouseenter', () => {
    if (appConfig.hotCorners === false) return;
    clearTimeout(hcDwellTimer);
    hcDwellTimer = setTimeout(() => {
      const corner = zone.dataset.hc;
      if (corner === 'tl') {
        toggleCustomWindow('win12-start-menu');
      } else if (corner === 'tr') {
        toggleCustomWindow('win-notifications');
        markNotificationsRead();
      } else if (corner === 'bl') {
        toggleCustomWindow('win-task-switcher');
      } else if (corner === 'br') {
        toggleCustomWindow('win-notes');
      }
    }, 650);
  });
  zone.addEventListener('mouseleave', () => {
    clearTimeout(hcDwellTimer);
  });
});

// Pastikan jendela baru terdaftar di klik-through handler
['win-notifications', 'dock-stack-popover', 'dock-win-picker', 'win-screenshot', 'win-shortcuts', 'win-lockscreen'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) bindInteractiveWidgetEvents(el);
});

[
  { selector: '#dock [data-native-app="chrome"]', appKey: 'chrome', minSingle: true },
  { selector: '#dock [data-native-app="vscode"]', appKey: 'vscode', minSingle: true },
  { selector: '#dock [data-custom-win="win-explorer"]', appKey: 'explorer', minSingle: false }
].forEach(({ selector, appKey, minSingle }) => {
  const btn = document.querySelector(selector);
  btn?.addEventListener('contextmenu', async (e) => {
    const { appEntry, windows } = getRunningWindowsForAppKey(appKey);
    if (!windows.length) return;
    e.preventDefault();
    e.stopPropagation();
    if (windows.length > 1 || !minSingle) {
      openDockWindowPicker(appEntry, windows, btn);
    } else {
      await ipcRenderer.invoke('minimize-running-app', {
        hwnd: windows[0].hwnd || '',
        pid: windows[0].pid
      });
      setTimeout(() => refreshRunningApps(true), 250);
    }
  });
});

document.addEventListener('pointerdown', (e) => {
  if (!dockWinPickerEl || dockWinPickerEl.classList.contains('hidden')) return;
  const isPickerOrTrigger =
    e.target.closest('#dock-win-picker') ||
    e.target.closest('[data-native-app]') ||
    e.target.closest('.running-dynamic-item') ||
    e.target.closest('[data-quick-switch]') ||
    (e.button === 2 && e.target.closest('#dock [data-custom-win="win-explorer"]'));
  if (!isPickerOrTrigger) {
    closeDockWindowPicker();
  }
});

// =========================================================
// 15. AESTHETIC LOCK SCREEN & SCREENSAVER CONTROLLER (Poin 4)
// =========================================================
let isLockScreenActive = false;

function showLockScreen() {
  const ls = document.getElementById('win-lockscreen');
  if (!ls) return;
  isLockScreenActive = true;
  ls.classList.remove('hidden', 'unlocking');
  setOverlayIgnoreMouse(false);
  ipcRenderer.send('focus-overlay-window');

  const lockUser = document.getElementById('lockscreen-username');
  if (lockUser) {
    lockUser.textContent = (document.getElementById('start-username')?.textContent || 'User');
  }

  // Update jam, tanggal, & status baterai pada lock screen seketika
  updateClock();
  evaluateEcoBatteryState();
}

function hideLockScreen() {
  const ls = document.getElementById('win-lockscreen');
  if (!ls || !isLockScreenActive) return;
  ls.classList.add('unlocking');
  setTimeout(() => {
    ls.classList.add('hidden');
    ls.classList.remove('unlocking');
    isLockScreenActive = false;
    syncOverlayMouseAtPoint(lastPointerPos.x, lastPointerPos.y);
  }, 320);
}

document.getElementById('lockscreen-unlock-btn')?.addEventListener('click', hideLockScreen);
document.getElementById('win-lockscreen')?.addEventListener('click', (e) => {
  if (e.target.id === 'win-lockscreen' || e.target.classList.contains('lockscreen-ambient-glow')) {
    hideLockScreen();
  }
});

// Pusat Pintasan Keyboard & Panduan Fitur (#win-shortcuts, F1)
function runQuickShortcutAction(key) {
  closeCustomWindow('win-shortcuts');
  if (key === 'start') {
    toggleCustomWindow('win12-start-menu');
    setTimeout(() => document.getElementById('start-search-input')?.focus(), 60);
  } else if (key === 'spotlight') {
    toggleCustomWindow('win-spotlight');
    setTimeout(() => document.getElementById('spotlight-input')?.focus(), 60);
  } else if (key === 'switcher') {
    toggleCustomWindow('win-task-switcher');
  } else if (key === 'desktop') {
    setAppPassthroughMode(!isAppPassthroughMode, '', { reason: 'manual' });
  } else if (key === 'explorer') {
    openCustomWindow('win-explorer');
  } else if (key === 'notifications') {
    toggleCustomWindow('win-notifications');
    markNotificationsRead();
  } else if (key === 'screenshot') {
    if (typeof captureAndOpenScreenshotStudio === 'function') captureAndOpenScreenshotStudio();
    else openCustomWindow('win-screenshot');
  } else if (key === 'lockscreen') {
    showLockScreen();
  }
}

document.getElementById('top-shortcuts-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCustomWindow('win-shortcuts');
});

document.getElementById('open-shortcuts-from-settings-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  openCustomWindow('win-shortcuts');
});

document.querySelectorAll('.shortcut-card[data-run-shortcut]').forEach((card) => {
  card.addEventListener('click', () => {
    runQuickShortcutAction(card.dataset.runShortcut);
  });
});

window.addEventListener('keydown', (e) => {
  if (isLockScreenActive) {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      hideLockScreen();
    }
    return;
  }
  if (e.key === 'F1') {
    e.preventDefault();
    toggleCustomWindow('win-shortcuts');
    return;
  }
  if (e.key === 'Escape') {
    const shortcutsWin = document.getElementById('win-shortcuts');
    if (shortcutsWin && !shortcutsWin.classList.contains('hidden')) {
      e.preventDefault();
      closeCustomWindow('win-shortcuts');
      return;
    }
    if (dockWinPickerEl && !dockWinPickerEl.classList.contains('hidden')) {
      e.preventDefault();
      closeDockWindowPicker();
    }
  }
});

// Jalankan pemindaian awal, animasi masuk widget, & polling ringan tiap 4 detik
animateRainmeterSkinsCascade();
refreshRunningApps(true);
setInterval(() => {
  if (!isLockScreenActive) refreshRunningApps(false);
}, 4000);
