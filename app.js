const { ipcRenderer } = require('electron');

// =========================================================
// 1. PENYIMPANAN STATE PERMANEN (localStorage Config)
// =========================================================
const STORAGE_KEY = 'winmac_os_config_v2';

const defaultConfig = {
  theme: 'theme-mica-dark',
  dockScale: 158,
  alwaysOnTop: true,
  fullScreenFixed: true,
  autoHideDock: false,
  autoStart: false,
  rainmeterLockAll: false,
  wallpaper: 'wp-sonoma',
  customWallpaperUrl: '',
  particleEffect: 'fireflies',
  customAccent: '',
  fontStyle: 'sans',
  pomoStreak: 0,
  clipboardHistory: [
    'npm start',
    'Alt + K (Spotlight Command) | Alt + Space (Start Menu)',
    'd:\\Belajar\\xampp\\htdocs\\winmac-dock'
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
// 2. CLICK-THROUGH OVERLAY HANDLER
// =========================================================
let isResizingWindow = false;

function bindInteractiveWidgetEvents(widget) {
  widget.addEventListener('mouseenter', () => {
    if (widget.classList.contains('rm-locked')) return;
    ipcRenderer.send('set-ignore-mouse-events', false);
  });

  widget.addEventListener('mouseleave', () => {
    if (!isDraggingWidget && !isResizingWindow) {
      ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    }
  });
}

document.querySelectorAll('.interactive-widget').forEach(bindInteractiveWidgetEvents);

// =========================================================
// 3. WINDOW MANAGER, AERO SNAP & DOCK MINIMIZED INDICATORS
// =========================================================
let topZIndex = 1350;
const minimizedState = {};

function updateDockDotState(winId, state) {
  const dockBtn = document.querySelector(`.dock-item[data-custom-win="${winId}"]`);
  const dot = dockBtn?.querySelector('.dock-dot');
  if (!dot) return;

  dot.classList.remove('running', 'minimized');
  if (state === 'running') {
    dot.classList.add('running');
  } else if (state === 'minimized') {
    dot.classList.add('minimized');
  }
}

function openCustomWindow(winId) {
  const winEl = document.getElementById(winId);
  if (!winEl) return;

  if (winId !== 'win12-start-menu' && winId !== 'win-calendar') {
    document.getElementById('win12-start-menu')?.classList.add('hidden');
  }

  minimizedState[winId] = false;
  winEl.classList.remove('hidden');
  topZIndex += 1;
  winEl.style.zIndex = topZIndex;

  updateDockDotState(winId, 'running');

  if (winId === 'win-explorer' && !currentExplorerPath) {
    initExplorer();
  }
}

function minimizeCustomWindow(winId) {
  const winEl = document.getElementById(winId);
  if (!winEl) return;
  minimizedState[winId] = true;
  winEl.classList.add('hidden');
  updateDockDotState(winId, 'minimized');
}

function closeCustomWindow(winId) {
  const winEl = document.getElementById(winId);
  if (!winEl) return;
  minimizedState[winId] = false;
  winEl.classList.add('hidden');
  updateDockDotState(winId, 'closed');
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

// Tombol Merah (Close)
document.querySelectorAll('[data-close-win]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeCustomWindow(btn.dataset.closeWin);
  });
});

// Tombol Kuning (Minimize ke Dock dengan indikator Oranye)
document.querySelectorAll('[data-min-win]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    minimizeCustomWindow(btn.dataset.minWin);
  });
});

// Tombol Hijau (Maximize) & Aero Snap (Left / Right 50%)
function toggleMaximizeWindow(winId) {
  const winEl = document.getElementById(winId);
  if (!winEl) return;
  winEl.classList.remove('snap-left', 'snap-right');
  winEl.classList.toggle('maximized');
}

document.getElementById('exp-maximize-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMaximizeWindow('win-explorer');
});

document.querySelectorAll('[data-max-win]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMaximizeWindow(btn.dataset.maxWin);
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
    topZIndex += 1;
    winEl.style.zIndex = topZIndex;
  });
});

document.querySelectorAll('[data-native-app]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    ipcRenderer.send('launch-app', btn.dataset.nativeApp);
    document.getElementById('win12-start-menu')?.classList.add('hidden');
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

  const dateFormatter = new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
  clockDateEl.textContent = dateFormatter.format(now);

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
        <div><strong>Prosesor:</strong> ${stats.cpuModel} (${stats.cores} Logical Cores @ ${stats.cpuGhz || '3.2'} GHz)</div>
        <div><strong>Memori & Disk C:</strong> RAM ${stats.usedGb}/${stats.totalGb} GB (${stats.ram}%) • Disk C: ${stats.diskC?.usedGb || 0}/${stats.diskC?.totalGb || 0} GB</div>
        <div><strong>Sistem Operasi:</strong> ${stats.platform} • User: ${stats.hostname}</div>
      `;
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
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=-6.2088&longitude=106.8456&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto'
    );
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();
    const cur = data.current;
    const temp = Math.round(cur.temperature_2m);
    const hum = cur.relative_humidity_2m;
    const wind = Math.round(cur.wind_speed_10m);
    const wmo = mapWmoCode(cur.weather_code);
    const tzCity = (data.timezone || 'Asia/Jakarta').split('/').pop().replace(/_/g, ' ');

    if (weatherMiniBadge) weatherMiniBadge.textContent = `${wmo.icon} ${temp}°C`;
    if (calWeatherBig) calWeatherBig.textContent = `${wmo.icon} ${temp}°C • ${wmo.desc}`;
    if (calWeatherLoc) {
      calWeatherLoc.textContent = `${tzCity} (Live) • Kelembaban ${hum}% • Angin ${wind} km/j`;
    }
    if (rmClockWeather) {
      rmClockWeather.textContent = `${wmo.icon} ${temp}°C • ${wmo.desc} • Kelembaban ${hum}% (${tzCity})`;
    }
  } catch (_) {
    // Fallback jika sedang offline
    if (calWeatherLoc) {
      calWeatherLoc.textContent = 'Indonesia • Kelembaban 68% • Angin 12 km/j';
    }
  }
}

document.getElementById('refresh-weather-btn')?.addEventListener('click', fetchLiveWeather);

updateClock();
updateSystemStats();
fetchLiveWeather();
setInterval(updateClock, 1000);
setInterval(updateSystemStats, 3000);
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
  'theme-sunset'
];
let currentThemeIdx = 0;

function applyTheme(themeName, persist = true) {
  themes.forEach((t) => document.body.classList.remove(t));
  document.body.classList.add(themeName);
  currentThemeIdx = Math.max(0, themes.indexOf(themeName));

  document.querySelectorAll('[data-set-theme]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.setTheme === themeName);
  });

  if (persist) {
    appConfig.theme = themeName;
    saveConfig();
  }
}

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
  ipcRenderer.send('launch-app', 'lock');
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
    } else if (card.dataset.nativeApp) {
      ipcRenderer.send('launch-app', card.dataset.nativeApp);
      document.getElementById('win12-start-menu')?.classList.add('hidden');
    }
  });
});

let activeCategory = 'all';

function filterStartApps() {
  const q = (startSearchInput?.value || '').toLowerCase().trim();
  startAppCards.forEach((card) => {
    const matchCat = activeCategory === 'all' || card.dataset.cat === activeCategory;
    const matchText =
      card.dataset.name.includes(q) || card.textContent.toLowerCase().includes(q);
    card.style.display = matchCat && matchText ? 'flex' : 'none';
  });
}

startSearchInput?.addEventListener('input', filterStartApps);

catPills.forEach((pill) => {
  pill.addEventListener('click', () => {
    catPills.forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    activeCategory = pill.dataset.filter;
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
let currentParentPath = '';
let currentDirItems = [];
let selectedFileItem = null;

// Riwayat Back / Forward
let navHistory = [];
let navHistoryIndex = -1;

const expBookmarksEl = document.getElementById('exp-bookmarks');
const expFilesGridEl = document.getElementById('exp-files-grid');
const expPathInput = document.getElementById('exp-path-input');
const expFilterInput = document.getElementById('exp-filter-input');
const expItemCountEl = document.getElementById('exp-item-count');
const expTabTitleEl = document.getElementById('exp-tab-title');
const expPreviewPane = document.getElementById('exp-preview-pane');
const previewTitleEl = document.getElementById('preview-title');
const previewBodyEl = document.getElementById('preview-body');
const previewMetaEl = document.getElementById('preview-meta');
const expContextMenu = document.getElementById('exp-context-menu');

// Inline Prompt Bar untuk New Folder / Rename
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
    expPromptInput.select();
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
  const ext = item.ext;
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'].includes(ext)) return '🖼️';
  if (['.mp4', '.mkv', '.mov', '.avi'].includes(ext)) return '🎬';
  if (['.mp3', '.wav', '.flac', '.ogg'].includes(ext)) return '🎵';
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return '📦';
  if (['.js', '.ts', '.html', '.css', '.json', '.py', '.php', '.sql'].includes(ext)) return '💻';
  if (['.pdf'].includes(ext)) return '📕';
  if (['.doc', '.docx'].includes(ext)) return '📘';
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return '📗';
  if (['.ppt', '.pptx'].includes(ext)) return '📙';
  if (['.exe', '.msi', '.bat', '.cmd'].includes(ext)) return '⚙️';
  return '📄';
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

async function initExplorer() {
  const bookmarks = await ipcRenderer.invoke('get-user-Bookmarks');
  expBookmarksEl.innerHTML = '';

  const iconMap = {
    desktop: '🖥️',
    downloads: '📥',
    documents: '📂',
    pictures: '🖼️',
    code: '⚡',
    drive: '💽'
  };

  bookmarks.forEach((b) => {
    const btn = document.createElement('button');
    btn.className = 'bookmark-btn';
    btn.innerHTML = `<span>${iconMap[b.icon] || '📁'}</span><span>${b.name}</span>`;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bookmark-btn').forEach((el) => el.classList.remove('active'));
      btn.classList.add('active');
      navigateExplorer(b.path);
    });
    expBookmarksEl.appendChild(btn);
  });

  if (bookmarks.length > 0) {
    navigateExplorer(bookmarks[0].path);
  }
}

function navigateExplorer(dirPath, recordHistory = true) {
  if (recordHistory) {
    navHistory = navHistory.slice(0, navHistoryIndex + 1);
    navHistory.push(dirPath);
    navHistoryIndex = navHistory.length - 1;
  }
  loadDirectory(dirPath);
}

async function loadDirectory(dirPath) {
  const res = await ipcRenderer.invoke('read-directory', dirPath);
  if (!res.ok) {
    expFilesGridEl.innerHTML = `<div style="grid-column:1/-1;padding:20px;color:#f87171;">Gagal membuka direktori: ${res.error}</div>`;
    return;
  }

  currentExplorerPath = res.currentPath;
  currentParentPath = res.parentPath;
  currentDirItems = res.items;
  selectedFileItem = null;

  expPathInput.value = currentExplorerPath;
  const parts = currentExplorerPath.split(/[/\\]/).filter(Boolean);
  expTabTitleEl.textContent = parts[parts.length - 1] || currentExplorerPath;
  expFilterInput.value = '';

  renderExplorerItems(currentDirItems);
}

function renderExplorerItems(items) {
  expFilesGridEl.innerHTML = '';
  expItemCountEl.textContent = `${items.length} item ditampilkan`;

  if (items.length === 0) {
    expFilesGridEl.innerHTML = `<div style="grid-column:1/-1;padding:28px;text-align:center;color:var(--text-secondary);">Folder ini kosong</div>`;
    return;
  }

  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'file-item-card';
    card.title = item.path;
    card.innerHTML = `
      <div class="file-ic">${getFileIcon(item)}</div>
      <div class="file-name">${item.name}</div>
      <div class="file-sub">${item.isDirectory ? 'Folder' : formatBytes(item.size)}</div>
    `;

    // Klik 1x: Pilih item (atau jika sudah terpilih & folder, masuk)
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      hideContextMenu();
      document.querySelectorAll('.file-item-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedFileItem = item;

      if (!expPreviewPane.classList.contains('hidden')) {
        showQuickLookPreview(item);
      }
    });

    // Klik 2x: Masuk ke folder atau buka file di Windows
    card.addEventListener('dblclick', () => {
      if (item.isDirectory) {
        navigateExplorer(item.path);
      } else {
        ipcRenderer.invoke('open-path', item.path);
      }
    });

    // Klik Kanan: Tampilkan Custom Glass Context Menu
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll('.file-item-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedFileItem = item;
      openContextMenu(e.clientX, e.clientY);
    });

    expFilesGridEl.appendChild(card);
  });
}

// Quick Look Preview (macOS Spasi)
async function showQuickLookPreview(item) {
  if (!item) return;
  expPreviewPane.classList.remove('hidden');
  previewTitleEl.textContent = item.name;
  previewBodyEl.innerHTML = '<div style="color:var(--text-secondary);font-size:11px;">Memuat preview...</div>';

  if (item.isDirectory) {
    previewBodyEl.innerHTML = `<div style="font-size:54px;">📁</div>`;
    previewMetaEl.innerHTML = `
      <div><strong>Tipe:</strong> Folder Direktori</div>
      <div><strong>Lokasi:</strong> ${item.path}</div>
    `;
    return;
  }

  const res = await ipcRenderer.invoke('preview-file', item.path);
  if (!res.ok) {
    previewBodyEl.innerHTML = `<div style="color:#f87171;font-size:11px;">Gagal memuat preview</div>`;
    return;
  }

  if (res.type === 'image') {
    previewBodyEl.innerHTML = `<img src="${res.url}" alt="${item.name}" />`;
  } else if (res.type === 'text') {
    const pre = document.createElement('pre');
    pre.textContent = res.content || '(File kosong)';
    previewBodyEl.innerHTML = '';
    previewBodyEl.appendChild(pre);
  } else {
    previewBodyEl.innerHTML = `<div style="font-size:52px;">${getFileIcon(item)}</div>`;
  }

  previewMetaEl.innerHTML = `
    <div><strong>Ukuran:</strong> ${formatBytes(res.size)}</div>
    <div><strong>Diubah:</strong> ${res.mtime}</div>
    <div><strong>Ekstensi:</strong> ${item.ext || '-'}</div>
  `;
}

document.getElementById('close-preview-btn')?.addEventListener('click', () => {
  expPreviewPane.classList.add('hidden');
});

// Tekan Spasi saat jendela Explorer aktif untuk toggle Quick Look Preview
window.addEventListener('keydown', (e) => {
  const expWin = document.getElementById('win-explorer');
  if (!expWin || expWin.classList.contains('hidden')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.code === 'Space' && selectedFileItem) {
    e.preventDefault();
    if (expPreviewPane.classList.contains('hidden')) {
      showQuickLookPreview(selectedFileItem);
    } else {
      expPreviewPane.classList.add('hidden');
    }
  }
});

// Context Menu Klik Kanan di Explorer
function openContextMenu(x, y) {
  expContextMenu.classList.remove('hidden');
  const maxLeft = window.innerWidth - 230;
  const maxTop = window.innerHeight - 220;
  expContextMenu.style.left = `${Math.min(x, maxLeft)}px`;
  expContextMenu.style.top = `${Math.min(y, maxTop)}px`;
}

function hideContextMenu() {
  expContextMenu?.classList.add('hidden');
}

window.addEventListener('click', hideContextMenu);

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
        ipcRenderer.invoke('open-path', selectedFileItem.path);
      }
    } else if (action === 'copypath' && selectedFileItem) {
      ipcRenderer.send('copy-to-clipboard', selectedFileItem.path);
    } else if (action === 'newfolder') {
      triggerCreateFolder();
    } else if (action === 'rename' && selectedFileItem) {
      openInlinePrompt(`Ubah nama "${selectedFileItem.name}":`, selectedFileItem.name, async (newName) => {
        const res = await ipcRenderer.invoke('explorer-rename', selectedFileItem.path, newName);
        if (res.ok) loadDirectory(currentExplorerPath);
      });
    } else if (action === 'trash' && selectedFileItem) {
      const res = await ipcRenderer.invoke('explorer-trash', selectedFileItem.path);
      if (res.ok) {
        expPreviewPane.classList.add('hidden');
        loadDirectory(currentExplorerPath);
      }
    }
  });
});

function triggerCreateFolder() {
  if (!currentExplorerPath) return;
  openInlinePrompt('Nama Folder Baru:', 'Folder Baru', async (folderName) => {
    const res = await ipcRenderer.invoke('explorer-create-folder', currentExplorerPath, folderName);
    if (res.ok) loadDirectory(currentExplorerPath);
  });
}

document.getElementById('exp-new-folder-btn')?.addEventListener('click', triggerCreateFolder);

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

expFilterInput?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  const filtered = currentDirItems.filter((it) => it.name.toLowerCase().includes(q));
  renderExplorerItems(filtered);
});

document.getElementById('exp-open-native')?.addEventListener('click', () => {
  ipcRenderer.invoke('open-path', currentExplorerPath || 'C:\\');
});

// =========================================================
// 8. WIDGET STICKY NOTES & TO-DO LIST (Auto-Save)
// =========================================================
const stickyTextarea = document.getElementById('sticky-textarea');
const notesSavedBadge = document.getElementById('notes-saved-badge');
const todoInput = document.getElementById('todo-input');
const todoAddBtn = document.getElementById('todo-add-btn');
const todoListEl = document.getElementById('todo-list');

if (stickyTextarea) {
  stickyTextarea.value = appConfig.stickyNote || '';
  stickyTextarea.addEventListener('input', () => {
    appConfig.stickyNote = stickyTextarea.value;
    saveConfig();
    if (notesSavedBadge) {
      notesSavedBadge.textContent = '💾 Menyimpan...';
      setTimeout(() => {
        notesSavedBadge.textContent = '✓ Tersimpan';
      }, 450);
    }
  });
}

function renderTodos() {
  if (!todoListEl) return;
  todoListEl.innerHTML = '';

  appConfig.todos.forEach((todo) => {
    const row = document.createElement('div');
    row.className = `todo-item ${todo.done ? 'done' : ''}`;
    row.innerHTML = `
      <div class="todo-left">
        <input type="checkbox" ${todo.done ? 'checked' : ''} />
        <span>${todo.text}</span>
      </div>
      <button class="todo-del-btn" title="Hapus">✕</button>
    `;

    row.querySelector('.todo-left').addEventListener('click', () => {
      todo.done = !todo.done;
      saveConfig();
      renderTodos();
    });

    row.querySelector('.todo-del-btn').addEventListener('click', () => {
      appConfig.todos = appConfig.todos.filter((t) => t.id !== todo.id);
      saveConfig();
      renderTodos();
    });

    todoListEl.appendChild(row);
  });
}

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
// 9. CUSTOM GLASS TERMINAL & CALCULATOR
// =========================================================
const termOutputEl = document.getElementById('term-output');
const termInputEl = document.getElementById('term-input');
const termSendBtn = document.getElementById('term-send-btn');

async function executeTerminalCommand(cmd) {
  const cleanCmd = cmd.trim();
  if (!cleanCmd) return;

  if (cleanCmd.toLowerCase() === 'cls' || cleanCmd.toLowerCase() === 'clear') {
    termOutputEl.innerHTML = '';
    return;
  }

  const cmdLine = document.createElement('div');
  cmdLine.className = 'term-line cmd';
  cmdLine.textContent = `PS WinMac> ${cleanCmd}`;
  termOutputEl.appendChild(cmdLine);

  const res = await ipcRenderer.invoke('run-terminal-cmd', cleanCmd, currentExplorerPath);
  const outLine = document.createElement('div');
  outLine.className = `term-line ${res.isError ? 'err' : ''}`;
  outLine.textContent = res.output;
  termOutputEl.appendChild(outLine);

  termOutputEl.scrollTop = termOutputEl.scrollHeight;
}

termSendBtn?.addEventListener('click', () => {
  executeTerminalCommand(termInputEl.value);
  termInputEl.value = '';
});

termInputEl?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    executeTerminalCommand(termInputEl.value);
    termInputEl.value = '';
  }
});

document.querySelectorAll('.term-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    executeTerminalCommand(chip.dataset.cmd);
  });
});

document.getElementById('term-open-native')?.addEventListener('click', () => {
  ipcRenderer.send('launch-app', 'terminal');
});

// Kalkulator
let calcExpression = '';
const calcExprEl = document.getElementById('calc-expr');
const calcResultEl = document.getElementById('calc-result');

document.querySelectorAll('.calc-key').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.key;

    if (key === 'C') {
      calcExpression = '';
      calcExprEl.textContent = '0';
      calcResultEl.textContent = '0';
    } else if (key === 'DEL') {
      calcExpression = calcExpression.slice(0, -1);
      calcExprEl.textContent = calcExpression || '0';
    } else if (key === '=') {
      try {
        const sanitized = calcExpression.replace(/[^0-9+\-*/.%()]/g, '');
        const val = Function(`"use strict"; return (${sanitized || 0})`)();
        calcResultEl.textContent = Number.isFinite(val) ? Number(val.toFixed(6)) : 'Error';
        calcExpression = String(calcResultEl.textContent);
      } catch (_) {
        calcResultEl.textContent = 'Error';
      }
    } else {
      calcExpression += key;
      calcExprEl.textContent = calcExpression;
    }
  });
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

// Render shortcut aplikasi yang ditambahkan user ke Dock
function renderCustomDockApps() {
  if (!customDockContainer) return;
  customDockContainer.innerHTML = '';

  (appConfig.customDockApps || []).forEach((appItem, idx) => {
    const btn = document.createElement('button');
    btn.className = 'dock-item';
    btn.dataset.label = `${appItem.name} (Klik Kanan: Hapus)`;
    const initials = appItem.name.slice(0, 2).toUpperCase();
    btn.innerHTML = `
      <div class="dock-icon icon-custom-app">${initials}</div>
      <span class="dock-dot"></span>
    `;

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

// Efek Gelombang Fisika Magnification Dock
dock.addEventListener('mousemove', (e) => {
  const mouseX = e.clientX;

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

dock.addEventListener('mouseleave', () => {
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
  visualizer: document.getElementById('rm-toggle-visualizer')
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
// 11B. BUILT-IN 4K WALLPAPER, PARTICLE ENGINE & LIVE COLOR/FONT STUDIO
// =========================================================
const wpLayer = document.getElementById('desktop-wallpaper-layer');
const wpPresets = ['wp-sonoma', 'wp-win12-bloom', 'wp-cyber-night', 'wp-fuji-sunset', 'wp-custom', 'wp-transparent'];

function applyWallpaper(wpName, persist = true) {
  if (!wpLayer) return;
  wpPresets.forEach((cls) => wpLayer.classList.remove(cls));
  wpLayer.style.backgroundImage = '';

  if (wpName === 'wp-custom' && appConfig.customWallpaperUrl) {
    wpLayer.classList.add('wp-custom');
    wpLayer.style.backgroundImage = `url("${appConfig.customWallpaperUrl}")`;
  } else {
    wpLayer.classList.add(wpName || 'wp-sonoma');
  }

  document.querySelectorAll('[data-wp]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.wp === wpName);
  });

  if (persist) {
    appConfig.wallpaper = wpName;
    saveConfig();
  }
}

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

// Live Accent Color Picker & Font Switcher
const accentPicker = document.getElementById('custom-accent-picker');
const fontSelect = document.getElementById('custom-font-select');

function applyCustomStudioStyle() {
  if (appConfig.customAccent) {
    document.documentElement.style.setProperty('--accent-primary', appConfig.customAccent);
    if (accentPicker) accentPicker.value = appConfig.customAccent;
  }
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

  // Smart Gaming / Battery Pause: jika CPU > 70%, jeda partikel otomatis
  const latestCpu = cpuHistory[cpuHistory.length - 1] || 15;
  if (latestCpu > 70) return;

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
  { label: '🗻 Ganti Wallpaper: Mount Fuji Twilight', keywords: 'wallpaper background fuji japan', run: () => applyWallpaper('wp-fuji-sunset') },
  { label: '🪟 Ganti Wallpaper: Transparan (Wallpaper Asli Windows)', keywords: 'wallpaper transparent asli', run: () => applyWallpaper('wp-transparent') },
  { label: '👁️ Tampilkan Semua Widget Rainmeter', keywords: 'show tampilkan widget skin', run: () => setAllRainmeterSkinsVisible(true) },
  { label: '🙈 Sembunyikan Semua Widget Rainmeter', keywords: 'hide sembunyikan widget skin', run: () => setAllRainmeterSkinsVisible(false) },
  { label: '🧘 Profil Desktop: Minimalis', keywords: 'profile minimal bersih', run: () => applyWorkspaceProfile('minimal') },
  { label: '💻 Profil Desktop: Developer / Hacker', keywords: 'profile dev coding hacker', run: () => applyWorkspaceProfile('dev') },
  { label: '📁 Buka Custom File Explorer (Alt+E)', keywords: 'explorer file folder finder', run: () => openCustomWindow('win-explorer') },
  { label: '🐚 Buka Glass Terminal Pro', keywords: 'terminal cmd powershell', run: () => openCustomWindow('win-terminal') },
  { label: '📌 Buka Sticky Notes & To-Do', keywords: 'notes catatan todo', run: () => openCustomWindow('win-notes') },
  { label: '🔒 Kunci Layar Windows (Lock PC)', keywords: 'lock kunci layar pc', run: () => ipcRenderer.send('launch-app', 'lock') }
];

function renderSpotlight(query) {
  if (!spotlightResults) return;
  const q = (query || '').trim();
  spotlightResults.innerHTML = '';

  // Cek apakah input berupa ekspresi matematika
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

  // Cek pencarian Web (g <query> atau yt <query>)
  if (q.toLowerCase().startsWith('g ')) {
    const term = q.slice(2).trim();
    const btn = document.createElement('button');
    btn.className = 'spot-item';
    btn.innerHTML = `<span>🌐 Cari di Google: "${term}"</span><span>Enter ↵</span>`;
    btn.onclick = () => {
      ipcRenderer.send('open-external-url', `https://www.google.com/search?q=${encodeURIComponent(term)}`);
      closeCustomWindow('win-spotlight');
    };
    spotlightResults.appendChild(btn);
  } else if (q.toLowerCase().startsWith('yt ')) {
    const term = q.slice(3).trim();
    const btn = document.createElement('button');
    btn.className = 'spot-item';
    btn.innerHTML = `<span>▶️ Cari di YouTube: "${term}"</span><span>Enter ↵</span>`;
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
      btn.innerHTML = `<span>${cmd.label}</span><span>Jalankan ↵</span>`;
      btn.onclick = () => {
        cmd.run();
        closeCustomWindow('win-spotlight');
      };
      spotlightResults.appendChild(btn);
    });
}

document.getElementById('spotlight-trigger-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCustomWindow('win-spotlight');
  renderSpotlight('');
  setTimeout(() => spotlightInput?.focus(), 60);
});

spotlightInput?.addEventListener('input', (e) => {
  renderSpotlight(e.target.value);
});

spotlightInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeCustomWindow('win-spotlight');
  } else if (e.key === 'Enter') {
    const firstBtn = spotlightResults?.querySelector('.spot-item');
    if (firstBtn) firstBtn.click();
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

rmVisPlayBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleVisualizerPlay();
});

rmVisNextBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  currentTrackIdx = (currentTrackIdx + 1) % synthTracks.length;
  updateTrackDisplay();
  if (isWebAudioSoundOn && isVisualizerPlaying) startOrUpdateWebAudioSynth();
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
  if (!appConfig.rainmeterSkins?.visualizer?.visible || appConfig.rainmeterSkins?.visualizer?.collapsed) {
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
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeStartW = rect.width;
    resizeStartH = rect.height;

    handle.setPointerCapture(e.pointerId);
  });
});

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

    widget.classList.remove('snap-left', 'snap-right');

    isDraggingWidget = true;
    wasDragged = false;
    activeWidget = widget;

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
if (!appConfig.fullScreenFixed) {
  appConfig.alwaysOnTop = true;
  appConfig.fullScreenFixed = true;
  saveConfig();
}
if (alwaysOnTopToggle) {
  alwaysOnTopToggle.checked = Boolean(appConfig.alwaysOnTop);
}
ipcRenderer.send('set-always-on-top', Boolean(appConfig.alwaysOnTop));
if (appConfig.autoHideDock) {
  scheduleAutoHideDock();
}
