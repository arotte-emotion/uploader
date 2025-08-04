// Lade Umgebungsvariablen
require('dotenv').config();
const contentful = require('contentful-management');

if (!process.env.CONTENTFUL_MANAGEMENT_TOKEN) {
  console.error('❌ CONTENTFUL_MANAGEMENT_TOKEN nicht gefunden!');
  process.exit(1);
}

const client = contentful.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
});

async function deleteEntryById(entryId, spaceId = 'is4lb5trkwgp', environmentId = 'production') {
  try {
    const space = await client.getSpace(spaceId);
    const environment = await space.getEnvironment(environmentId);
    const entry = await environment.getEntry(entryId);
    console.log(`📄 Gefunden: ${entry.fields.internerName?.['de-DE'] || entryId}`);
    if (entry.sys.publishedVersion) {
      console.log('📤 Unpublishe Entry...');
      await entry.unpublish();
      console.log('✅ Entry unpublisht');
    }
    console.log('🗑️  Lösche Entry...');
    await entry.delete();
    console.log('✅ Entry gelöscht!');
  } catch (error) {
    if (error.name === 'NotFound') {
      console.error('❌ Entry nicht gefunden!');
    } else {
      console.error('❌ Fehler beim Löschen:', error.message);
      if (error.response) {
        console.error('📋 HTTP Status:', error.response.status);
        console.error('📋 Response:', error.response.data);
      }
    }
  }
}

// Hier die zu löschende Entry-ID eintragen:
const ENTRY_ID = '3TN0x24UpMYyVvcnA7hqhJ';

deleteEntryById(ENTRY_ID); 