// Lade Umgebungsvariablen
require('dotenv').config();
const contentful = require('contentful-management');
const fetch = require('node-fetch');

if (!process.env.CONTENTFUL_MANAGEMENT_TOKEN) {
  console.error('❌ CONTENTFUL_MANAGEMENT_TOKEN nicht gefunden!');
  process.exit(1);
}

const client = contentful.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
});

// Support-Verfahren für Ghost-Entry-Bereinigung
async function fixGhostEntrySupportMethod(ghostEntryId, contentType = 'pageStandard') {
  console.log(`🧹 Support-Verfahren für Ghost-Entry: ${ghostEntryId}`);
  
  try {
    const space = await client.getSpace('is4lb5trkwgp');
    const environment = await space.getEnvironment('production');
    
    // Schritt 1: Entry mit gleicher ID erstellen
    console.log(`\n📝 Schritt 1: Erstelle Entry mit ID ${ghostEntryId}...`);
    
    const fields = {
      internerName: {
        'de-DE': `Ghost-Cleanup-Support-${Date.now()}`
      },
      slug: {
        'de-DE': `ghost-cleanup-support-${Date.now()}`
      }
    };
    
    // Füge zusätzliche Felder basierend auf Content-Type hinzu
    if (contentType === 'richText') {
      fields.richtext = {
        'de-DE': {
          nodeType: 'document',
          data: {},
          content: [{
            nodeType: 'paragraph',
            content: [{
              nodeType: 'text',
              value: 'Ghost-Entry-Cleanup-Support',
              marks: [],
              data: {}
            }],
            data: {}
          }]
        }
      };
    } else if (contentType === 'accordionElement') {
      fields.title = {
        'de-DE': 'Ghost-Entry-Cleanup-Support'
      };
      fields.text = {
        'de-DE': {
          nodeType: 'document',
          data: {},
          content: [{
            nodeType: 'paragraph',
            content: [{
              nodeType: 'text',
              value: 'Ghost-Entry-Cleanup-Support',
              marks: [],
              data: {}
            }],
            data: {}
          }]
        }
      };
    }
    
    // Verwende PUT-Methode für Entry-Erstellung mit spezifischer ID
    const contentTypeId = await getContentTypeId(environment, contentType);
    const url = `https://api.contentful.com/spaces/${environment.sys.space.sys.id}/environments/${environment.sys.id}/entries/${ghostEntryId}`;
    
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
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`PUT-Request fehlgeschlagen: ${response.status} - ${JSON.stringify(errorData)}`);
    }
    
    const newEntry = await response.json();
    console.log(`  ✅ Entry mit ID ${ghostEntryId} erfolgreich erstellt`);
    
    // Schritt 2: Entry publishen
    console.log(`\n📤 Schritt 2: Publisiere Entry...`);
    const entry = await environment.getEntry(ghostEntryId);
    await entry.publish();
    console.log(`  ✅ Entry erfolgreich publiziert`);
    
    // Schritt 3: Entry unpublishen
    console.log(`\n📤 Schritt 3: Unpublisiere Entry...`);
    await entry.unpublish();
    console.log(`  ✅ Entry erfolgreich unpublisht`);
    
    // Schritt 4: Entry löschen
    console.log(`\n🗑️  Schritt 4: Lösche Entry...`);
    await entry.delete();
    console.log(`  ✅ Entry erfolgreich gelöscht`);
    
    console.log(`\n🎉 Support-Verfahren erfolgreich abgeschlossen!`);
    console.log(`✅ Ghost-Entry ${ghostEntryId} wurde endgültig bereinigt`);
    
    return true;
    
  } catch (error) {
    console.error(`❌ Fehler beim Support-Verfahren:`, error.message);
    if (error.response) {
      console.error('📋 HTTP Status:', error.response.status);
      console.error('📋 Response:', error.response.data);
    }
    return false;
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

// Führe das Support-Verfahren aus
const GHOST_ENTRY_ID = '3TN0x24UpMYyVvcnA7hqhJ';
const CONTENT_TYPE = 'pageStandard';

console.log('🚀 Starte Support-Verfahren für Ghost-Entry-Bereinigung...');
fixGhostEntrySupportMethod(GHOST_ENTRY_ID, CONTENT_TYPE).then((success) => {
  if (success) {
    console.log('\n✅ Support-Verfahren erfolgreich abgeschlossen!');
    console.log('🔄 Sie können jetzt den Import erneut ausführen.');
  } else {
    console.log('\n❌ Support-Verfahren fehlgeschlagen.');
    console.log('📧 Kontaktieren Sie den Contentful Support.');
  }
  process.exit(success ? 0 : 1);
}); 