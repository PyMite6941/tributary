// The only bridge between the UI and the main process. The renderer gets these functions and nothing else.
const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

contextBridge.exposeInMainWorld('tributary', {
  platform: process.platform,
  getState: () => call('state:get'),
  listProviders: () => call('providers:list'),
  testAccount: (draft) => call('account:test', draft),
  addAccount: (draft) => call('account:add', draft),
  updateAccount: (id, patch) => call('account:update', id, patch),
  removeAccount: (id) => call('account:remove', id),
  reconnectAccount: (id) => call('account:reconnect', id),
  reauthAccount: (id, draft) => call('account:reauth', id, draft),
  listKeys: () => call('keys:list'),
  addKey: (provider, draft) => call('keys:add', provider, draft),
  removeKey: (id) => call('keys:remove', id),
  updateKey: (id, patch) => call('keys:update', id, patch),
  setActiveKey: (provider, id) => call('keys:setActive', provider, id),
  setAutoSwitch: (provider, on) => call('keys:setAutoSwitch', provider, on),
  openEnvFile: () => call('keys:openEnv'),
  saveRules: (rules) => call('rules:save', rules),
  saveSettings: (s) => call('settings:save', s),
  getBody: (key) => call('mail:body', key),
  setSeen: (key, seen) => call('mail:seen', key, seen),
  setFlagged: (key, flagged) => call('mail:flag', key, flagged),
  move: (key, kind) => call('mail:move', key, kind),
  openExternal: (url) => call('open:external', url),
  getAppInfo: () => call('app:info'),
  uninstall: () => call('app:uninstall'),
  eraseAll: () => call('app:eraseAll'),
  quit: () => call('app:quit'),
  openDataFolder: () => call('app:openData'),
  checkForUpdates: () => call('app:checkUpdate'),
  onState: (fn) => {
    const h = (_e, s) => fn(s);
    ipcRenderer.on('state', h);
    return () => ipcRenderer.removeListener('state', h);
  },
  onOpenSettings: (fn) => {
    const h = () => fn();
    ipcRenderer.on('ui:settings', h);
    return () => ipcRenderer.removeListener('ui:settings', h);
  },
  onOpenMessage: (fn) => {
    const h = (_e, key) => fn(key);
    ipcRenderer.on('mail:open', h);
    return () => ipcRenderer.removeListener('mail:open', h);
  },
});
