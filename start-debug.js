#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starte Debug-System...\n');

// Funktion zum Starten eines Servers
function startServer(scriptName, port, description) {
  console.log(`📡 Starte ${description} auf Port ${port}...`);
  
  const server = spawn('node', [scriptName], {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  server.on('error', (error) => {
    console.error(`❌ Fehler beim Starten von ${description}:`, error.message);
  });
  
  server.on('exit', (code) => {
    if (code !== 0) {
      console.error(`❌ ${description} beendet mit Code ${code}`);
    }
  });
  
  return server;
}

// Prüfe, ob .env Datei existiert
const fs = require('fs');
const envPath = path.join(__dirname, '.env');

if (!fs.existsSync(envPath)) {
  console.error('❌ .env Datei nicht gefunden!');
  console.log('💡 Bitte erstellen Sie eine .env Datei mit den erforderlichen Umgebungsvariablen:');
  console.log('');
  console.log('CONTENTFUL_SPACE_ID=your_space_id');
  console.log('CONTENTFUL_MANAGEMENT_TOKEN=your_management_token');
  console.log('CONTENTFUL_ENVIRONMENT_ID=master');
  console.log('OPENAI_API_KEY=your_openai_api_key');
  console.log('PORT=3001');
  console.log('');
  process.exit(1);
}

// Starte beide Server
const mainServer = startServer('server.js', 3001, 'Haupt-Server');
const debugServer = startServer('debug-server.js', 3002, 'Debug-Server');

console.log('\n✅ Beide Server gestartet!');
console.log('');
console.log('🌐 Haupt-Server: http://localhost:3001');
console.log('🔧 Debug-Server: http://localhost:3002');
console.log('');
console.log('📊 Debug-Endpunkte:');
console.log('  - System-Status: http://localhost:3001/api/debug/system-status');
console.log('  - Contentful-Test: http://localhost:3001/api/debug/contentful');
console.log('  - Debug-Logs: http://localhost:3001/api/debug/logs');
console.log('  - Upload-Diagnose: http://localhost:3001/api/debug/upload-diagnosis');
console.log('');
console.log('🔧 Debug-Server Endpunkte:');
console.log('  - System-Check: http://localhost:3002/api/debug/system-check');
console.log('  - Contentful-Test: http://localhost:3002/api/debug/contentful');
console.log('  - Netzwerk-Test: http://localhost:3002/api/debug/network');
console.log('  - Upload-Simulation: http://localhost:3002/api/debug/upload-simulation');
console.log('');
console.log('📱 Frontend: http://localhost:3001 (mit Debug-Panel)');
console.log('');
console.log('🔄 Drücken Sie Ctrl+C zum Beenden...\n');

// Graceful Shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Beende Server...');
  mainServer.kill('SIGINT');
  debugServer.kill('SIGINT');
  
  setTimeout(() => {
    console.log('✅ Server beendet');
    process.exit(0);
  }, 1000);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Beende Server...');
  mainServer.kill('SIGTERM');
  debugServer.kill('SIGTERM');
  
  setTimeout(() => {
    console.log('✅ Server beendet');
    process.exit(0);
  }, 1000);
}); 