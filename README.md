# 🌌 WinMac Desktop OS Suite Pro (Windows 12 × macOS Sonoma × Rainmeter × Wallpaper Engine)

Aplikasi **Desktop Customization & Overlay Shell** mandiri yang super ringan untuk Windows 10/11 — menggabungkan estetika **Windows 12 Glassmorphism**, **macOS Dynamic Island & Floating Dock**, **Rainmeter Desktop Widgets**, **Live Running Apps Switcher (Win32)**, serta **Wallpaper Engine (4K Scenic, Live Video `.mp4`/`.webm` & Particle Effects)** menggunakan Electron + HTML/CSS/JavaScript modern.

---

## ✨ Fitur Utama (Versi Terbaru)

### 1. 🖥️ Aplikasi Desktop `.exe` Mandiri + Auto-Start Windows (Tanpa CMD!)
- **[WinMac Desktop OS.exe](./WinMac%20Desktop%20OS.exe)** *(~15 KB)*: Satu-satunya file aplikasi utama (GUI native Windows tanpa jendela CMD hitam).
- **Otomatis Pasang Shortcut & Auto-Start**: Begitu kamu membuka `WinMac Desktop OS.exe` pertama kali, aplikasi otomatis membuat *shortcut* di Desktop dan mendaftarkan dirinya ke **Windows Startup** agar langsung aktif setiap kali PC dinyalakan/di-*restart*.
- **Mode Administrator**: Bisa dijalankan lewat klik kanan `WinMac Desktop OS.exe` ➔ **Run as administrator**, atau klik tombol **`🛡️ Run as Admin`** di dalam menu **Settings (`⚙️`)** / System Tray.
- **Kembali ke Windows Original**: Cukup klik tombol **`🪟 Windows Ori`** di pojok kanan bawah **Start Menu** WinMac (atau **`🚫 Matikan Auto-Start & Keluar`** di menu Settings).

### 2. 🪟 Detektor Aplikasi Aktif & Live Win32 Window Switcher (`Alt + W`)
- Mendeteksi secara *real-time* semua aplikasi Windows yang sedang terbuka (**MS Word, Excel, PowerPoint, Google Chrome, VS Code, File Explorer, Spotify, WhatsApp, dll.**).
- Menampilkan **indikator titik hijau menyala** dan *badge* jumlah jendela langsung di **Bottom Dock** dan **Top Dynamic Island** (`🟢 X Aplikasi Aktif`).
- **Mode Layar Aplikasi (`Alt + D`) + Custom Taskbar Strip**: Saat membuka aplikasi seperti VS Code atau MS Word, wallpaper otomatis transparan sementara **Top Bar, Compact Dock, dan Custom Taskbar Deck** tetap tampil elegan menutup Taskbar bawaan Windows 11 100% tanpa menghalangi area kerja aplikasi.

### 3. 🏝️ Floating Top Dynamic Island
- **Mode Ringkas**: Indikator CPU & RAM *real-time*, cuaca *live* (Open-Meteo API), jam digital, tanggal, tombol **Aplikasi Aktif (`Alt+W`)**, tombol **Desktop/App Mode (`Alt+D`)**, dan visualizer audio.
- **Mode Ekspansi**: Kartu *Now Playing* dengan kontrol *WebAudio Ambient Lofi Synth*, *circular gauge* CPU/RAM, 4 *Quick Toggles* (Wi-Fi, Bluetooth, Notes, Snipping Tool), serta *slider* **Master Volume Windows** & **Brightness Dimmer**.

### 4. 🛸 macOS Floating Dock + Spring Physics & Genie Animations
- Efek **Dock Magnification** berbasis gelombang kosinus yang mulus + **Icon Bounce (`dockBounce`)** saat aplikasi diluncurkan.
- Animasi jendela **macOS Genie Minimize (`winGenieMinimize`)**, **Spring Pop Open (`winSpringOpen`)**, dan **VisionOS Launch HUD (`#app-launch-hud`)** di tengah layar.
- **🔊 Spatial UI Sound Effects (WebAudio 0 MB)**: Efek suara sintetis lembut ala macOS/VisionOS saat membuka, *minimize*, atau menutup jendela (bisa dinyalakan/dimatikan di Settings).

### 5. 🌦️ 5 Rainmeter-Style Desktop Widgets
Semua widget memiliki tombol **Lipat (`—`)**, **Sembunyikan (`✕`)**, *Magnetic Grid Snapping* (`8px`), serta menu klik kanan untuk mengatur **Transparansi**, **Ukuran (Scale)**, dan **Lock (`Click-Through`)**:
1. **🕒 Chrono / Mond Desktop Clock**: Tipografi hari besar, jam lengkap hingga detik, cuaca *live*, dan *quote* harian.
2. **⚡ SysMonitor Pro**: Grafik *sparkline* beban CPU *real-time*, penggunaan RAM, kapasitas *drive* `C:\` & `D:\`, baterai, *ping latency*, serta kecepatan *Download/Upload*.
3. **🎵 Audio Spectrum Visualizer**: 24-bar spektrum frekuensi *real-time* + *WebAudio Lofi Synth* bawaan.
4. **🍅 Pomodoro Focus Timer**: Lingkaran hitung mundur **25m Fokus / 5m Rehat** dengan bunyi lonceng *WebAudio* dan pencatat *streak* harian.
5. **📋 Smart Clipboard History**: Merekam otomatis 12 teks terakhir yang di-*copy* (`Ctrl+C`) untuk disalin ulang dengan 1 klik.

### 6. 🖼️ 13 Mode Background, 3 Mode Tema OS, 8 Tema Kaca & Smart Eco-Battery
- **3 Mode Tema OS Utama**: Beralih instan antara **WinMac Hybrid** (Dynamic Island + Floating Dock), **Windows 12 Fluent** (Taskbar Kapsul & System Tray kanan), dan **Apple macOS Sonoma** (Top Menu Bar penuh ` Finder` + Launchpad + 3D Glass Dock).
- **8 Tema Glassmorphism + Real-Time Customizer**: *Dark Acrylic*, *Cyber Aurora*, *Light Mica*, *Sonoma Frost*, *Sunset Gold*, *Emerald Forest*, *Rose Quartz*, dan *AMOLED Black*, dilengkapi slider **Blur**, **Opacity**, dan **Custom Accent Color Picker**.
- **13 Mode Background**: **🕐 Otomatis Pagi/Siang/Sore/Malam** (berganti sendiri mengikuti jam), *macOS Sonoma Horizon*, *Windows 12 Midnight Bloom*, *macOS Big Sur Waves*, *Aurora Borealis*, *Galaxy Nebula*, *Ocean Sunset*, *Misty Pine Forest*, *Cyberpunk Synthwave*, *Mount Fuji Twilight*, **📂 Gambar Kustom PC**, **🎬 Video Live Wallpaper (`.mp4`/`.webm`)**, atau **🪟 Transparan Asli**.
- Semua background dibuat murni dengan CSS/SVG (0 MB gambar). Animasinya (aurora bergerak, bintang berkelip, kabut hutan, kilau laut) hanya memakai `transform`/`opacity` yang dirender GPU, dan **otomatis berhenti** saat kamu sedang di Mode Layar Aplikasi atau Eco Battery aktif.
- **5 Pilihan Efek Partikel (`<canvas>` Ultra-Ringan)**: *Fireflies (Kunang-kunang Neon)*, *Starfield*, *Snowfall*, *Cyber Matrix Rain*, dan *Mati*.
- **🔋 Auto-Eco Battery & Gaming Saver**: Otomatis menjeda animasi partikel & video wallpaper saat baterai laptop `< 25%` (tanpa charger), saat CPU `> 70%`, atau saat sedang fokus di dalam aplikasi kerja.

### 7. 🚀 Fitur Produktivitas & Utilitas Pro Suite
1. **🔔 Notification Center & Dynamic Island Toast (`Alt + N`)**: Menampilkan notifikasi *real-time* di Dynamic Island lengkap dengan riwayat aktivitas, catatan cepat, dan mode **🌙 Do Not Disturb (DND)**.
2. **🎵 Kontrol Media Sistem Windows Asli**: Mengontrol *Play/Pause*, *Next Track*, dan *Prev Track* untuk **Spotify, YouTube di Browser, & VLC** secara langsung serta mendeteksi judul lagu/video yang sedang diputar.
3. **⏰ Kalender + Pencarian Kota Cuaca + Agenda Alarm**: Cari cuaca kota mana saja (Open-Meteo Geocoding) dan jadwalkan pengingat harian (`HH:MM`) dengan bunyi alarm & notifikasi otomatis.
4. **🔋 Detail Baterai & Ping Latency Live**: Indikator persentase baterai, status pengisian (`⚡ AC` / estimasi sisa waktu), dan *ping latency* di Top Dynamic Island, SysMonitor Pro, & Lock Screen.
5. **📐 Hot Corners ala macOS**: Arahkan kursor ke 4 pojok layar untuk aksi instan (Kiri-Atas: Start Menu, Kanan-Atas: Notifikasi, Kiri-Bawah: Task Switcher, Kanan-Bawah: Catatan Cepat / Quick Notes).
6. **🗂️ Quick App Stack Folder di Dock**: Popover grup aplikasi cepat bergaya macOS App Stack di Bottom Dock.
7. **⚡ Spotlight Super Pintar (`Alt + K`)**: Mendukung **konversi mata uang & satuan** (`10 usd to idr`, `100 km to mile`, `32 c to f`), **pencarian file lokal di laptop** (`f <nama file>`), pembuka website langsung (`github.com`), dan kalkulator.
8. **📸 Screenshot & Editor Coret-Coret Studio (`Alt + S`)**: Tangkap layar HD instan, beri coretan/tanda dengan pena warna neon, lalu **Copy ke Clipboard (`Ctrl+V`)** atau **Simpan PNG** ke folder `Pictures/WinMac-Screenshots`.
9. **🔍 Start Menu Auto-Scan Aplikasi (A–Z) & Aesthetic Lock Screen**: Memindai otomatis aplikasi Windows terpasang secara alfabetis dengan ikon asli, plus mode layar kunci (*Lock Screen*) lengkap dengan jam besar, cuaca, dan status baterai.
10. **📁 Custom Explorer Pro, Terminal History & Notes Export**: File Explorer mendukung *Grid/List View*, pengurutan, *Copy/Cut/Paste/Duplicate/Rename/Trash*, serta *Quick Look Inline Text Editor*; Terminal Pro mendukung riwayat perintah (`↑`/`↓`) & indikator folder kerja; dan Notes mendukung filter To-Do (*Semua/Aktif/Selesai*) serta ekspor ke file `.md`.

---

## ⌨️ Pintasan Keyboard Global (Shortcuts)

| Pintasan | Fungsi |
| :--- | :--- |
| `Alt + Space` | Membuka / Menutup **Windows 12 Start Menu** |
| `Alt + W` | Membuka / Menutup **Pusat Aplikasi Sedang Terbuka (Live Task Switcher)** |
| `Alt + D` | Beralih antara **Desktop Wallpaper penuh** vs **Mode Layar Aplikasi Kerja** |
| `Alt + N` | Membuka / Menutup **Pusat Notifikasi & Riwayat (`Notification Center`)** |
| `Alt + S` | Menangkap Layar & Membuka **Screenshot Editor Coret-Coret Studio** |
| `Alt + K` | Membuka / Menutup **Spotlight Command, Cari File & Konversi Mata Uang/Satuan** |
| `Alt + E` | Membuka / Menutup **Custom File Explorer × macOS Finder** |
| `Spasi` *(di Explorer)* | Membuka **Quick Look Preview** untuk file gambar/kode yang dipilih |

---

## 🚀 Cara Instalasi & Penggunaan (Tanpa CMD)

1. **Clone repositori & instal dependensi (cukup 1 kali):**
   ```bash
   git clone https://github.com/bagongvit/winmac-dock.git
   cd winmac-dock
   npm install
   ```

2. **Jalankan sebagai Aplikasi Desktop (Tanpa CMD):**
   - Langsung klik 2x **`WinMac Desktop OS.exe`** (atau klik kanan ➔ **Run as administrator**). Aplikasi otomatis memasang shortcut di Desktop Windows dan mengaktifkan Auto-Start saat PC restart.

3. **Cara Kembali ke Tampilan Windows Original Kapan Saja:**
   - Klik tombol **`🪟 Windows Ori`** di pojok kanan bawah **Start Menu** WinMac (`Alt + Space`), atau
   - Buka **Settings (`⚙️`)** ➔ klik **`🚫 Matikan Auto-Start & Keluar`**.

---

## 📂 Struktur Proyek (Rapi & Ringkas)

- `WinMac Desktop OS.exe` — Aplikasi utama Windows GUI Launcher (tanpa CMD, mendukung Run as Admin & Auto-Startup).
- `winmac.ico` — Ikon resmi aplikasi & System Tray.
- `main.js` — Main process Electron (Overlay `screen-saver`, Win32 Window Switcher, IPC File System, Audio/Brightness OS, Auto-Startup & Global Shortcuts).
- `preload.js` — Context Isolation bridge yang mengamankan komunikasi IPC antara `main.js` dan `app.js`.
- `index.html` — Struktur UI untuk Wallpaper Layer, Video Wallpaper, 5 Rainmeter Skins, Top Dynamic Island, Custom Taskbar Strip, Floating Dock, & Lock Screen.
- `style.css` — Desain **8 Tema Glassmorphism** + kustomisasi blur/opasitas, **3 Mode Tema OS** (WinMac Hybrid / Windows 12 / macOS), animasi *Spring/Genie*, dan *scenic* 4K backgrounds.
- `app.js` — Logika interaktif, *Live Running Apps Detector*, *Spatial WebAudio SFX*, *Battery Eco Saver*, dan *Particle Canvas Engine*.
- `package.json` — Konfigurasi dependensi Electron & target build.
