const { contextBridge, ipcRenderer } = require('electron');

const VALID_SEND_CHANNELS = new Set([
  'set-ignore-mouse-events',
  'focus-overlay-window',
  'set-always-on-top',
  'set-autostart',
  'restart-as-admin',
  'quit-to-windows',
  'set-system-volume',
  'set-system-brightness',
  'media-key-control',
  'copy-to-clipboard',
  'open-external-url',
  'launch-app'
]);

const VALID_INVOKE_CHANNELS = new Set([
  'install-desktop-shortcuts',
  'get-sys-stats',
  'get-ping-latency',
  'search-local-files',
  'capture-screen-hd',
  'save-annotated-screenshot',
  'pick-app-shortcut',
  'get-app-icon',
  'get-user-Bookmarks',
  'read-directory',
  'preview-file',
  'explorer-create-folder',
  'explorer-create-file',
  'explorer-save-text-file',
  'explorer-rename',
  'explorer-paste-item',
  'explorer-trash',
  'explorer-show-in-folder',
  'get-clipboard-text',
  'pick-wallpaper-image',
  'pick-wallpaper-video',
  'open-path',
  'run-terminal-cmd',
  'get-installed-apps',
  'open-app-path',
  'export-notes-file',
  'get-running-apps',
  'focus-running-app',
  'minimize-running-app',
  'close-running-app'
]);

const VALID_RECEIVE_CHANNELS = new Set([
  'shortcut-trigger',
  'sync-always-on-top'
]);

contextBridge.exposeInMainWorld('electronIPC', {
  send: (channel, ...args) => {
    if (VALID_SEND_CHANNELS.has(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },
  invoke: (channel, ...args) => {
    if (VALID_INVOKE_CHANNELS.has(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Blocked IPC invoke channel: ${channel}`));
  },
  on: (channel, listener) => {
    if (!VALID_RECEIVE_CHANNELS.has(channel) || typeof listener !== 'function') return;
    const subscription = (_event, ...args) => listener(null, ...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  }
});
