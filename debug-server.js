// Umfassendes Debugging-System für den Server
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const contentful = require('contentful-management');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3002; // Anderer Port als Hauptserver

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ===== DEBUGGING FUNKTIONEN =====

// 1. Umgebungsvariablen-Check
function checkEnvironmentVariables() {
  console.log('\n=== UMWELTVARIABLEN CHECK ===');
  
  const requiredVars = [
    'CONTENTFUL_SPACE_ID',
    'CONTENTFUL_MANAGEMENT_TOKEN',
    'CONTENTFUL_ENVIRONMENT_ID',
    'OPENAI_API_KEY'
  ];
  
  const optionalVars = [
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_API_KEY',
    'GOOGLE_REFRESH_TOKEN'
  ];
  
  console.log('Erforderliche Variablen:');
  requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      console.log(`✅ ${varName}: ${value.substring(0, 10)}...`);
    } else {
      console.log(`❌ ${varName}: FEHLT`);
    }
  });
  
  console.log('\nOptionale Variablen:');
  optionalVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      console.log(`✅ ${varName}: ${value.substring(0, 10)}...`);
    } else {
      console.log(`⚠️  ${varName}: Nicht gesetzt`);
    }
  });
  
  console.log('=== ENDE UMWELTVARIABLEN CHECK ===\n');
}

// 2. Contentful-Verbindungstest
async function testContentfulConnection() {
  console.log('\n=== CONTENTFUL VERBINDUNGSTEST ===');
  
  try {
    console.log('Initialisiere Contentful Client...');
    const client = contentful.createClient({
      accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });
    
    console.log('Teste Space-Zugriff...');
    const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
    console.log(`✅ Space gefunden: ${space.name}`);
    
    console.log('Teste Environment-Zugriff...');
    const environment = await space.getEnvironment(process.env.CONTENTFUL_ENVIRONMENT_ID || 'master');
    console.log(`✅ Environment gefunden: ${environment.name}`);
    
    console.log('Teste Content-Type-Zugriff...');
    const contentTypes = await environment.getContentTypes();
    console.log(`✅ Content-Types gefunden: ${contentTypes.items.length}`);
    
    console.log('Teste Asset-Zugriff...');
    const assets = await environment.getAssets();
    console.log(`✅ Assets gefunden: ${assets.items.length}`);
    
    console.log('Teste Entry-Zugriff...');
    const entries = await environment.getEntries();
    console.log(`✅ Entries gefunden: ${entries.items.length}`);
    
    return {
      success: true,
      space: space.name,
      environment: environment.name,
      contentTypes: contentTypes.items.length,
      assets: assets.items.length,
      entries: entries.items.length
    };
    
  } catch (error) {
    console.error('❌ Contentful-Verbindungstest fehlgeschlagen:', error.message);
    console.error('Stack Trace:', error.stack);
    
    // Detaillierte Fehleranalyse
    if (error.message.includes('401')) {
      console.error('🔍 Ursache: Ungültiger Management Token');
    } else if (error.message.includes('403')) {
      console.error('🔍 Ursache: Fehlende Berechtigungen');
    } else if (error.message.includes('404')) {
      console.error('🔍 Ursache: Space ID oder Environment ID nicht gefunden');
    } else if (error.message.includes('429')) {
      console.error('🔍 Ursache: Rate Limit überschritten');
    }
    
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

// 3. Netzwerk-Diagnose
async function testNetworkConnectivity() {
  console.log('\n=== NETZWERK-DIAGNOSE ===');
  
  const tests = [
    {
      name: 'Contentful API',
      url: 'https://api.contentful.com',
      method: 'GET'
    },
    {
      name: 'Google Drive API',
      url: 'https://www.googleapis.com',
      method: 'GET'
    },
    {
      name: 'OpenAI API',
      url: 'https://api.openai.com',
      method: 'GET'
    }
  ];
  
  const results = [];
  
  for (const test of tests) {
    try {
      console.log(`Teste ${test.name}...`);
      const startTime = Date.now();
      
      const response = await fetch(test.url, {
        method: test.method,
        headers: {
          'User-Agent': 'Debug-Server/1.0'
        },
        timeout: 10000
      });
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      console.log(`✅ ${test.name}: ${response.status} (${responseTime}ms)`);
      
      results.push({
        name: test.name,
        success: true,
        status: response.status,
        responseTime: responseTime
      });
      
    } catch (error) {
      console.log(`❌ ${test.name}: ${error.message}`);
      
      results.push({
        name: test.name,
        success: false,
        error: error.message
      });
    }
  }
  
  console.log('=== ENDE NETZWERK-DIAGNOSE ===\n');
  return results;
}

// 4. Dateisystem-Check
function checkFileSystem() {
  console.log('\n=== DATEISYSTEM-CHECK ===');
  
  const directories = [
    'uploads',
    'temp_images',
    'client/build',
    'Briefing Ordner'
  ];
  
  const files = [
    'package.json',
    'server.js',
    'briefing-importer.js',
    '.env'
  ];
  
  console.log('Verzeichnisse:');
  directories.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      console.log(`✅ ${dir}: ${stats.isDirectory() ? 'Verzeichnis' : 'Datei'}`);
    } else {
      console.log(`❌ ${dir}: Nicht gefunden`);
    }
  });
  
  console.log('\nDateien:');
  files.forEach(file => {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      console.log(`✅ ${file}: ${(stats.size / 1024).toFixed(1)}KB`);
    } else {
      console.log(`❌ ${file}: Nicht gefunden`);
    }
  });
  
  console.log('=== ENDE DATEISYSTEM-CHECK ===\n');
}

// 5. Google Drive API Test
async function testGoogleDriveAPI() {
  console.log('\n=== GOOGLE DRIVE API TEST ===');
  
  try {
    // Prüfe Credentials
    let applicationCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const apiKey = process.env.GOOGLE_API_KEY;
    
    if (!applicationCredentials && !apiKey) {
      console.log('⚠️  Keine Google API Credentials gefunden');
      return {
        success: false,
        error: 'Keine Google API Credentials konfiguriert'
      };
    }
    
    console.log('Initialisiere Google Drive API...');
    
    let auth;
    if (applicationCredentials) {
      let credentials;
      
      if (applicationCredentials.startsWith('{')) {
        credentials = JSON.parse(applicationCredentials);
      } else {
        const credentialsPath = path.resolve(applicationCredentials.replace(/^["']|["']$/g, ''));
        if (fs.existsSync(credentialsPath)) {
          credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
          console.log('✅ Google Credentials geladen');
        } else {
          throw new Error(`Credentials-Datei nicht gefunden: ${credentialsPath}`);
        }
      }
      
      auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
      });
    } else {
      auth = new google.auth.GoogleAuth({
        key: apiKey,
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
      });
    }
    
    const driveService = google.drive({ version: 'v3', auth });
    
    console.log('Teste Google Drive API-Zugriff...');
    const response = await driveService.files.list({
      pageSize: 1,
      fields: 'files(id,name)'
    });
    
    console.log(`✅ Google Drive API funktioniert: ${response.data.files.length} Dateien gefunden`);
    
    return {
      success: true,
      filesFound: response.data.files.length
    };
    
  } catch (error) {
    console.error('❌ Google Drive API Test fehlgeschlagen:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// 6. OpenAI API Test
async function testOpenAIAPI() {
  console.log('\n=== OPENAI API TEST ===');
  
  try {
    const OpenAI = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    console.log('Teste OpenAI API...');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: "Antworte nur mit 'OK'"
        }
      ],
      max_tokens: 10
    });
    
    console.log(`✅ OpenAI API funktioniert: ${response.choices[0].message.content}`);
    
    return {
      success: true,
      response: response.choices[0].message.content
    };
    
  } catch (error) {
    console.error('❌ OpenAI API Test fehlgeschlagen:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// 7. Upload-Simulation
async function testUploadSimulation() {
  console.log('\n=== UPLOAD-SIMULATION ===');
  
  try {
    // Erstelle Test-Briefing
    const testBriefing = `Slug: /test-debug
MT: Test Debug Page
MD: Test Debug Description

H1: Test Überschrift

Dies ist ein Test-Briefing für Debugging-Zwecke.

[Produkt]

Weitere Inhalte nach dem Produkt-Marker.

Bildlink: https://via.placeholder.com/300x200/FF0000/FFFFFF?text=Test+Image

Häufig gestellte Fragen

H3: Test Frage 1?
Test Antwort 1.

H3: Test Frage 2?
Test Antwort 2.`;

    console.log('Test-Briefing erstellt');
    
    // Simuliere Bildlink-Extraktion
    const imageLinks = testBriefing.match(/Bildlink:\s*(.+)/g);
    console.log(`Gefundene Bildlinks: ${imageLinks ? imageLinks.length : 0}`);
    
    // Simuliere Contentful-Upload
    const client = contentful.createClient({
      accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });
    
    const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
    const environment = await space.getEnvironment(process.env.CONTENTFUL_ENVIRONMENT_ID || 'master');
    
    console.log('✅ Upload-Simulation erfolgreich');
    
    return {
      success: true,
      briefingLength: testBriefing.length,
      imageLinksFound: imageLinks ? imageLinks.length : 0
    };
    
  } catch (error) {
    console.error('❌ Upload-Simulation fehlgeschlagen:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// 8. Detaillierte Fehleranalyse
function analyzeError(error) {
  console.log('\n=== FEHLERANALYSE ===');
  
  console.log('Fehlertyp:', error.constructor.name);
  console.log('Nachricht:', error.message);
  console.log('Code:', error.code);
  console.log('Stack:', error.stack);
  
  // Spezifische Fehleranalyse
  if (error.message.includes('Failed to fetch')) {
    console.log('🔍 Ursache: Netzwerk-Problem oder CORS-Issue');
    console.log('💡 Lösung: Prüfe Server-Status und CORS-Konfiguration');
  }
  
  if (error.message.includes('401')) {
    console.log('🔍 Ursache: Authentifizierungsfehler');
    console.log('💡 Lösung: Prüfe API-Tokens und Berechtigungen');
  }
  
  if (error.message.includes('413')) {
    console.log('🔍 Ursache: Datei zu groß');
    console.log('💡 Lösung: Reduziere Dateigröße oder erhöhe Limits');
  }
  
  if (error.message.includes('timeout')) {
    console.log('🔍 Ursache: Timeout bei API-Anfrage');
    console.log('💡 Lösung: Erhöhe Timeout-Werte oder optimiere Anfragen');
  }
  
  console.log('=== ENDE FEHLERANALYSE ===\n');
}

// ===== API ENDPUNKTE =====

// Vollständiger System-Check
app.get('/api/debug/system-check', async (req, res) => {
  try {
    console.log('\n🚀 STARTE VOLLSTÄNDIGEN SYSTEM-CHECK...');
    
    const results = {
      timestamp: new Date().toISOString(),
      environment: checkEnvironmentVariables(),
      contentful: await testContentfulConnection(),
      network: await testNetworkConnectivity(),
      filesystem: checkFileSystem(),
      googleDrive: await testGoogleDriveAPI(),
      openai: await testOpenAIAPI(),
      upload: await testUploadSimulation()
    };
    
    // Gesamtstatus bestimmen
    const allTests = [
      results.contentful.success,
      results.network.every(test => test.success),
      results.googleDrive.success,
      results.openai.success,
      results.upload.success
    ];
    
    results.overallStatus = allTests.every(test => test === true) ? 'OK' : 'PROBLEMS';
    results.passedTests = allTests.filter(test => test === true).length;
    results.totalTests = allTests.length;
    
    console.log(`\n📊 SYSTEM-CHECK ABGESCHLOSSEN:`);
    console.log(`Status: ${results.overallStatus}`);
    console.log(`Tests bestanden: ${results.passedTests}/${results.totalTests}`);
    
    res.json({
      success: true,
      data: results
    });
    
  } catch (error) {
    console.error('❌ System-Check fehlgeschlagen:', error);
    analyzeError(error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Contentful-spezifischer Test
app.get('/api/debug/contentful', async (req, res) => {
  try {
    const result = await testContentfulConnection();
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    analyzeError(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Netzwerk-Test
app.get('/api/debug/network', async (req, res) => {
  try {
    const results = await testNetworkConnectivity();
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    analyzeError(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Upload-Simulation
app.get('/api/debug/upload-simulation', async (req, res) => {
  try {
    const result = await testUploadSimulation();
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    analyzeError(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Live-Logging
app.get('/api/debug/logs', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Debug-Logging gestartet' })}\n\n`);

  // Ping alle 30 Sekunden
  const pingInterval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(pingInterval);
  });
});

// ===== SERVER START =====

app.listen(PORT, () => {
  console.log(`🔧 Debug-Server läuft auf Port ${PORT}`);
  console.log(`📊 System-Check verfügbar unter: http://localhost:${PORT}/api/debug/system-check`);
  console.log(`🔍 Contentful-Test verfügbar unter: http://localhost:${PORT}/api/debug/contentful`);
  console.log(`🌐 Netzwerk-Test verfügbar unter: http://localhost:${PORT}/api/debug/network`);
  console.log(`📤 Upload-Simulation verfügbar unter: http://localhost:${PORT}/api/debug/upload-simulation`);
  console.log(`📝 Live-Logs verfügbar unter: http://localhost:${PORT}/api/debug/logs`);
});

// Automatischer System-Check beim Start
setTimeout(async () => {
  console.log('\n🔄 Führe automatischen System-Check durch...');
  await testContentfulConnection();
  await testNetworkConnectivity();
  console.log('✅ Automatischer System-Check abgeschlossen\n');
}, 2000); 