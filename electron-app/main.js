const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const os = require('os');
const { initDatabase, closeDatabase, ...dbOps } = require('./database');
const { exportGeoJSON, exportCSV, exportImage, exportPDF, exportSettings, importSettings } = require('./export-utils');

let mainWindow;
let backendProcess;

// Backend configuration
const BACKEND_PORT = 5003;
const BACKEND_HOST = '127.0.0.1';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    },
    icon: path.join(__dirname, 'resources', 'icon.png')
  });

  // Load the React app from the development server or built files
  const isDev = process.argv.includes('--dev');
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // In a packaged app the bundled frontend lives under process.resourcesPath
    // (electron-builder extraResources), not next to the asar-packed main.js.
    const frontendRoot = app.isPackaged ? process.resourcesPath : __dirname;
    mainWindow.loadFile(path.join(frontendRoot, 'frontend', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Probe whether something is already listening on the backend host/port.
// Resolves true if a connection succeeds within the timeout, false otherwise.
function isBackendListening(host, port, timeout = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

async function startBackend() {
  // If a backend is already listening (e.g. started outside Electron in dev),
  // reuse it instead of spawning a second one that would fail to bind the port.
  if (await isBackendListening(BACKEND_HOST, BACKEND_PORT)) {
    console.log(`Backend already listening on ${BACKEND_HOST}:${BACKEND_PORT}, reusing existing backend`);
    return;
  }

  // In a packaged app the bundled backend lives under process.resourcesPath
  // (electron-builder extraResources), not next to the asar-packed main.js.
  const resourcesRoot = app.isPackaged ? process.resourcesPath : __dirname;
  const backendPath = path.join(resourcesRoot, 'backend', 'geomoz-explorer');
  const venvPath = path.join(backendPath, 'venv');
  
  // Determine Python executable based on OS
  let pythonExe;
  if (os.platform() === 'win32') {
    pythonExe = path.join(venvPath, 'Scripts', 'python.exe');
  } else {
    pythonExe = path.join(venvPath, 'bin', 'python');
  }

  // If venv doesn't exist, use system Python
  if (!fs.existsSync(pythonExe)) {
    pythonExe = 'python3';
  }

  const apiScript = path.join(backendPath, 'api.py');
  
  // Set environment variables for backend.
  // The renderer runs from a file:// origin (or a custom app origin), so requests
  // to the bundled localhost backend are cross-origin with an Origin of "null".
  // This backend is local-only and not exposed to the network, so allow any origin.
  const env = {
    ...process.env,
    CORS_ORIGINS: '*',
    PORT: BACKEND_PORT.toString()
  };

  backendProcess = spawn(pythonExe, ['-m', 'uvicorn', 'api:app', '--host', BACKEND_HOST, '--port', BACKEND_PORT.toString()], {
    cwd: backendPath,
    env: env,
    stdio: 'pipe'
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`Backend stdout: ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`Backend stderr: ${data}`);
  });

  backendProcess.on('error', (err) => {
    // A spawn failure (e.g. python not found) must never crash the main process.
    console.error(`Failed to start backend process: ${err.message}`);
    backendProcess = null;
  });

  backendProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

// App lifecycle
app.whenReady().then(() => {
  initDatabase();
  createWindow();
  startBackend().catch((err) => {
    console.error(`startBackend failed: ${err.message}`);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopBackend();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
  closeDatabase();
});

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-app-path', (event, name) => {
  return app.getPath(name);
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('file-exists', async (event, filePath) => {
  return fs.existsSync(filePath);
});

ipcMain.handle('get-backend-url', () => {
  return `http://${BACKEND_HOST}:${BACKEND_PORT}`;
});

// Database operations - Saved views
ipcMain.handle('db-save-view', (event, viewData) => {
  return dbOps.saveView(viewData);
});

ipcMain.handle('db-get-views', () => {
  return dbOps.getViews();
});

ipcMain.handle('db-delete-view', (event, id) => {
  return dbOps.deleteView(id);
});

// Database operations - Cached data
ipcMain.handle('db-cache-data', (event, dataType, key, data, ttlSeconds) => {
  return dbOps.cacheData(dataType, key, data, ttlSeconds);
});

ipcMain.handle('db-get-cached-data', (event, dataType, key) => {
  return dbOps.getCachedData(dataType, key);
});

ipcMain.handle('db-clear-expired-cache', () => {
  return dbOps.clearExpiredCache();
});

// Database operations - Export history
ipcMain.handle('db-add-export-history', (event, exportType, filePath, parameters) => {
  return dbOps.addExportHistory(exportType, filePath, parameters);
});

ipcMain.handle('db-get-export-history', (event, limit) => {
  return dbOps.getExportHistory(limit);
});

// Database operations - Settings
ipcMain.handle('db-set-setting', (event, key, value) => {
  return dbOps.setSetting(key, value);
});

ipcMain.handle('db-get-setting', (event, key) => {
  return dbOps.getSetting(key);
});

ipcMain.handle('db-get-all-settings', () => {
  return dbOps.getAllSettings();
});

// Export operations
ipcMain.handle('export-geojson', async (event, geojsonData, defaultFilename) => {
  return await exportGeoJSON(geojsonData, defaultFilename);
});

ipcMain.handle('export-csv', async (event, data, headers, defaultFilename) => {
  return await exportCSV(data, headers, defaultFilename);
});

ipcMain.handle('export-image', async (event, imageData, defaultFilename) => {
  return await exportImage(imageData, defaultFilename);
});

ipcMain.handle('export-pdf', async (event, reportData, defaultFilename) => {
  return await exportPDF(reportData, defaultFilename);
});

ipcMain.handle('export-settings', async (event, settings, defaultFilename) => {
  return await exportSettings(settings, defaultFilename);
});

ipcMain.handle('import-settings', async () => {
  return await importSettings();
});
