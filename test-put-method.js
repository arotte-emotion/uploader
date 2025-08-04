// Lade Umgebungsvariablen
require('dotenv').config();

const contentful = require('contentful-management');
const fetch = require('node-fetch');

// Prüfe ob das Access Token verfügbar ist
if (!process.env.CONTENTFUL_MANAGEMENT_TOKEN) {
  console.error('❌ CONTENTFUL_MANAGEMENT_TOKEN nicht gefunden!');
  console.error('📋 Stellen Sie sicher, dass die .env-Datei vorhanden ist und das Token enthält.');
  process.exit(1);
}

const client = contentful.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
});

// Test-Funktion für PUT-Methode
async function testPUTMethod() {
  try {
    console.log('🧪 Teste PUT-Methode für Ghost-Entry-Bereinigung...');
    console.log(`🔑 Token verfügbar: ${process.env.CONTENTFUL_MANAGEMENT_TOKEN ? 'Ja' : 'Nein'}`);
    
    const space = await client.getSpace('is4lb5trkwgp');
    const environment = await space.getEnvironment('production');
    
    console.log(`\n📋 Test-Konfiguration:`);
    console.log(`  Space ID: ${space.sys.id}`);
    console.log(`  Environment: ${environment.sys.id}`);
    
    // Teste die Content-Type-ID-Ermittlung
    console.log(`\n🔍 Teste Content-Type-ID-Ermittlung...`);
    const contentTypeId = await getContentTypeId(environment, 'pageStandard');
    console.log(`  Content-Type-ID für pageStandard: ${contentTypeId}`);
    
    // Teste die PUT-Methode mit einer echten Ghost-Entry-ID
    // Hier können Sie eine echte Ghost-Entry-ID einsetzen
    const testGhostEntryId = '3TN0x24UpMYyVvcnA7hqhJ'; // Echte Ghost-Entry-ID aus dem Import
    
    if (testGhostEntryId === 'test-ghost-entry-id') {
      console.log(`\n⚠️  Keine echte Ghost-Entry-ID für Test verfügbar`);
      console.log(`  Um einen echten Test durchzuführen, ersetzen Sie testGhostEntryId mit einer echten Ghost-Entry-ID`);
      console.log(`  Beispiel: const testGhostEntryId = '5KsDBWseXY6QegucYAoacS';`);
    } else {
      console.log(`\n🔧 Teste PUT-Methode mit Ghost-Entry-ID: ${testGhostEntryId}`);
      await testCreateEntryWithSpecificId(environment, 'pageStandard', testGhostEntryId);
    }
    
    console.log(`\n✅ Test abgeschlossen`);
    
  } catch (error) {
    console.error('❌ Test-Fehler:', error.message);
    if (error.response) {
      console.error('📋 HTTP Status:', error.response.status);
      console.error('📋 Response:', error.response.data);
    }
  }
}

// Hilfsfunktion zum Ermitteln der Content-Type-ID
async function getContentTypeId(environment, contentTypeName) {
  try {
    const contentType = await environment.getContentType(contentTypeName);
    return contentType.sys.id;
  } catch (error) {
    console.error(`Fehler beim Ermitteln der Content-Type-ID für ${contentTypeName}:`, error.message);
    const fallbackIds = {
      'pageStandard': 'pageStandard',
      'richText': 'richText', 
      'accordionElement': 'accordionElement',
      'accordion': 'accordion'
    };
    return fallbackIds[contentTypeName] || contentTypeName;
  }
}

// Test-Funktion für Entry-Erstellung mit spezifischer ID
async function testCreateEntryWithSpecificId(environment, contentType, entryId) {
  console.log(`\n🔧 Teste Entry-Erstellung mit ID: ${entryId}`);
  try {
    const contentTypeId = await getContentTypeId(environment, contentType);
    console.log(`  📋 Content-Type-ID: ${contentTypeId}`);
    const fields = {
      internerName: {
        'de-DE': `Test-Ghost-Cleanup-${Date.now()}`
      },
      slug: {
        'de-DE': `test-ghost-cleanup-${Date.now()}`
      }
    };
    const url = `https://api.contentful.com/spaces/${environment.sys.space.sys.id}/environments/${environment.sys.id}/entries/${entryId}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${process.env.CONTENTFUL_MANAGEMENT_TOKEN}`,
        'Content-Type': 'application/vnd.contentful.management.v1+json',
        'X-Contentful-Content-Type': contentTypeId
      },
      body: JSON.stringify({
        fields: fields,
        metadata: { tags: [] }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error(`  ❌ Fehler beim Erstellen des Entries mit ID ${entryId}:`, data);
      throw new Error(data.message || 'Unbekannter Fehler');
    }
    console.log(`  ✅ Entry mit ID ${entryId} erfolgreich erstellt`);
    console.log(`  📄 Entry-Details:`, {
      id: data.sys.id,
      contentType: data.sys.contentType.sys.id,
      createdAt: data.sys.createdAt
    });
    return data;
  } catch (error) {
    console.error(`  ❌ Fehler beim Erstellen des Entries mit ID ${entryId}:`, error.message);
    throw error;
  }
}

// Führe den Test aus
testPUTMethod().then(() => {
  console.log('\n🏁 Test-Skript beendet');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Test-Skript fehlgeschlagen:', error);
  process.exit(1);
}); 