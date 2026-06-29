const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: (name) => ipcRenderer.invoke('get-app-path', name),
  
  // File dialogs
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  // File operations
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  
  // Backend
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  
  // Database - Saved views
  dbSaveView: (viewData) => ipcRenderer.invoke('db-save-view', viewData),
  dbGetViews: () => ipcRenderer.invoke('db-get-views'),
  dbDeleteView: (id) => ipcRenderer.invoke('db-delete-view', id),
  
  // Database - Cached data
  dbCacheData: (dataType, key, data, ttlSeconds) => ipcRenderer.invoke('db-cache-data', dataType, key, data, ttlSeconds),
  dbGetCachedData: (dataType, key) => ipcRenderer.invoke('db-get-cached-data', dataType, key),
  dbClearExpiredCache: () => ipcRenderer.invoke('db-clear-expired-cache'),
  
  // Database - Export history
  dbAddExportHistory: (exportType, filePath, parameters) => ipcRenderer.invoke('db-add-export-history', exportType, filePath, parameters),
  dbGetExportHistory: (limit) => ipcRenderer.invoke('db-get-export-history', limit),
  
  // Database - Settings
  dbSetSetting: (key, value) => ipcRenderer.invoke('db-set-setting', key, value),
  dbGetSetting: (key) => ipcRenderer.invoke('db-get-setting', key),
  dbGetAllSettings: () => ipcRenderer.invoke('db-get-all-settings'),
  
  // Export operations
  exportGeoJSON: (geojsonData, defaultFilename) => ipcRenderer.invoke('export-geojson', geojsonData, defaultFilename),
  exportCSV: (data, headers, defaultFilename) => ipcRenderer.invoke('export-csv', data, headers, defaultFilename),
  exportImage: (imageData, defaultFilename) => ipcRenderer.invoke('export-image', imageData, defaultFilename),
  exportPDF: (reportData, defaultFilename) => ipcRenderer.invoke('export-pdf', reportData, defaultFilename),
  exportSettings: (settings, defaultFilename) => ipcRenderer.invoke('export-settings', settings, defaultFilename),
  importSettings: () => ipcRenderer.invoke('import-settings'),
  
  // Events
  onBackendStatus: (callback) => ipcRenderer.on('backend-status', callback),
  removeBackendStatusListener: (callback) => ipcRenderer.removeListener('backend-status', callback)
});
