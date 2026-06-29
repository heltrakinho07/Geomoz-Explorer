const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');

/**
 * Export GeoJSON data to a file
 */
async function exportGeoJSON(geojsonData, defaultFilename = 'export.geojson') {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultFilename,
    filters: [
      { name: 'GeoJSON Files', extensions: ['geojson', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true };
  }

  try {
    const content = JSON.stringify(geojsonData, null, 2);
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Export data to CSV format
 */
async function exportCSV(data, headers, defaultFilename = 'export.csv') {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultFilename,
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true };
  }

  try {
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        const value = row[header];
        // Escape quotes and wrap in quotes if contains comma
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value ?? '';
      }).join(','))
    ].join('\n');

    fs.writeFileSync(result.filePath, csvContent, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Export image/map screenshot
 */
async function exportImage(imageData, defaultFilename = 'map-export.png') {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultFilename,
    filters: [
      { name: 'PNG Images', extensions: ['png'] },
      { name: 'JPEG Images', extensions: ['jpg', 'jpeg'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true };
  }

  try {
    // imageData should be a Buffer or base64 string
    const buffer = Buffer.isBuffer(imageData) 
      ? imageData 
      : Buffer.from(imageData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    
    fs.writeFileSync(result.filePath, buffer);
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Export report as PDF (requires additional setup, placeholder)
 */
async function exportPDF(reportData, defaultFilename = 'report.pdf') {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultFilename,
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true };
  }

  try {
    // PDF generation would require a library like puppeteer or pdfkit
    // For now, this is a placeholder
    throw new Error('PDF export not yet implemented');
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Export settings/configuration
 */
async function exportSettings(settings, defaultFilename = 'geomoz-settings.json') {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultFilename,
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true };
  }

  try {
    const content = JSON.stringify(settings, null, 2);
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Import settings/configuration
 */
async function importSettings() {
  const result = await dialog.showOpenDialog({
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  try {
    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    const settings = JSON.parse(content);
    return { success: true, settings, filePath: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  exportGeoJSON,
  exportCSV,
  exportImage,
  exportPDF,
  exportSettings,
  importSettings
};
