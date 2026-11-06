# 🌌 WinMac Desktop OS Suite Pro (Windows 12 × macOS × Rainmeter)

Aplikasi *Desktop Customization & Overlay Shell* mandiri untuk Windows 10/11 yang menggabungkan estetika **Windows 12 Glassmorphism**, **macOS Dynamic Island & Floating Dock**, **Rainmeter Desktop Widgets**, serta **Wallpaper Engine Particle Effects** menggunakan Electron + HTML/CSS/JavaScript modern.

---

## ✨ Fitur Utama

### 1. 🏝️ Floating Top Dynamic Island
- **Mode Ringkas**: Indikator CPU & RAM *real-time*, cuaca *live* (Open-Meteo API), jam digital, tanggal, dan visualizer audio.
- **Mode Ekspansi**: Kartu *Now Playing* dengan kontrol *WebAudio Ambient Lofi Synth*, *circular gauge* CPU/RAM, 4 *Quick Toggles* (Wi-Fi, Bluetooth, Notes, Snipping Tool), serta *slider* **Master Volume Windows** & **Brightness Dimmer**.

### 2. 🛸 macOS Floating Dock + Auto-Hide
- Efek **Dock Magnification** berbasis fisika gelombang kosinus yang mulus.
- Indikator titik status aplikasi: **Biru Cyan** (aktif terbuka) vs **Oranye** (*minimized*).
- Tombol **`+`** untuk menambahkan aplikasi `.exe` / *shortcut* favorit dari PC secara permanen.
- Dukungan **Smart Auto-Hide** saat kursor menjauh dari tepi bawah layar.

### 3. 🌦️ 5 Rainmeter-Style Desktop Widgets
Semua widget memiliki tombol **Lipat (`—`)**, **Sembunyikan (`✕`)**, *Magnetic Grid Snapping* (`8px`), serta menu klik kanan untuk mengatur **Transparansi**, **Ukuran (Scale)**, dan **Lock (`Click-Through`)**:
1. **🕒 Chrono / Mond Desktop Clock**: Tipografi hari besar, jam lengkap hingga detik, cuaca *live*, dan *quote* harian.
2. **⚡ SysMonitor Pro**: Grafik *sparkline* beban CPU *real-time*, penggunaan RAM, kapasitas *drive* `C:\` & `D:\`, serta kecepatan *Download/Upload*.
3. **🎵 Audio Spectrum Visualizer**: 24-bar spektrum frekuensi *real-time* + *WebAudio Lofi Synth* bawaan.
4. **🍅 Pomodoro Focus Timer**: Lingkaran hitung mundur **25m Fokus / 5m Rehat** dengan bunyi lonceng *WebAudio* dan pencatat *streak* harian.
5. **📋 Smart Clipboard History**: Merekam otomatis 12 teks terakhir yang di-*copy* (`Ctrl+C`) untuk disalin ulang dengan 1 klik.

### 4. 🖼️ Built-in 4K Aesthetic Backgrounds & Live Particles
- **6 Pilihan Background**: *macOS Sonoma Horizon*, *Windows 12 Midnight Bloom*, *Cyberpunk Synthwave*, *Mount Fuji Twilight*, *Custom Image dari PC*, atau *Transparan (Wallpaper Asli Windows)*.
- **5 Efek Partikel (`<canvas>`)**: *Fireflies (Kunang-kunang Neon)*, *Starfield*, *Snowfall*, *Cyber Matrix Rain*, dilengkapi *Smart CPU Auto-Pause*.

### 5. 🖥️ Custom OS Apps & Spotlight Command Bar
- **⚡ Spotlight / Raycast Command Bar (`Alt + K`)**: Kalkulator kilat, pencarian Google (`g ...`) / YouTube (`yt ...`), dan eksekusi perintah cepat.
- **🚀 Custom Windows 12 Start Menu (`Alt + Space`)**: Pencarian aplikasi, filter kategori, dan folder *recent*.
- **📁 Custom File Explorer × Finder (`Alt + E`)**: Navigasi *Back/Forward*, *New Folder*, *Rename*, *Delete to Recycle Bin*, dan **Quick Look Preview (`Spasi`)** untuk gambar & kode.
- **🐚 Glass Terminal Pro, 🧮 Glass Calculator, 📌 Sticky Notes & To-Do List, 📅 Kalender Bulanan**.

---

## ⌨️ Pintasan Keyboard Global (Shortcuts)

| Pintasan | Fungsi |
| :--- | :--- |
| `Alt + Space` | Membuka / Menutup **Windows 12 Start Menu** |
| `Alt + E` | Membuka / Menutup **Custom File Explorer** |
| `Alt + K` | Membuka / Menutup **Spotlight Command & Kalkulator Kilat** |
| `Spasi` *(di Explorer)* | Membuka **Quick Look Preview** untuk file yang dipilih |

---

## 🚀 Cara Instalasi & Menjalankan

1. **Clone repositori ini:**
   ```bash
   git clone https://github.com/USERNAME_ANDA/winmac-dock.git
   cd winmac-dock
   ```

2. **Instal dependensi:**
   ```bash
   npm install
   ```

3. **Jalankan aplikasi:**
   ```bash
   npm start
   ```

---

## 📂 Struktur Proyek

- `package.json` — Konfigurasi proyek Electron & skrip build.
- `main.js` — Main process Electron (Window transparan, IPC File System, Audio/Brightness OS, Clipboard, System Tray & Global Shortcuts).
- `index.html` — Struktur UI untuk Wallpaper Layer, 5 Rainmeter Skins, Top Dynamic Island, Custom OS Windows, dan Floating Dock.
- `style.css` — Desain 5 Tema Glassmorphism, animasi *Dock Magnification*, dan *scenic* 4K backgrounds.
- `app.js` — Logika interaktif, *Particle Canvas Engine*, *WebAudio Synth*, *Live Weather API*, dan penyimpanan permanen (`localStorage`).
