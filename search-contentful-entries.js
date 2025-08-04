const contentful = require('contentful-management');
require('dotenv').config();

const SPACE_ID = process.env.CONTENTFUL_SPACE_ID || 'is4lb5trkwgp';
const ENVIRONMENT_ID = process.env.CONTENTFUL_ENVIRONMENT_ID || 'master';
const ACCESS_TOKEN = process.env.CONTENTFUL_MANAGEMENT_TOKEN || '<DEIN_TOKEN_HIER>';

// Funktion zum Suchen nach einem spezifischen Entry in allen Environments
async function findSpecificEntry(client, targetInternalName) {
  console.log(`\n=== Suche nach Entry mit internem Namen: "${targetInternalName}" ===`);
  
  try {
    const space = await client.getSpace(SPACE_ID);
    const environments = await space.getEnvironments();
    
    const foundEntries = [];
    
    for (const env of environments.items) {
      console.log(`\nDurchsuche Environment: ${env.name} (${env.sys.id})`);
      
      try {
        const environment = await space.getEnvironment(env.sys.id);
        const entries = await environment.getEntries({ 
          limit: 1000, 
          include: 0
        });
        
        for (const entry of entries.items) {
          const internalName = entry.fields.internerName && entry.fields.internerName['de-DE'];
          if (internalName === targetInternalName) {
            foundEntries.push({
              id: entry.sys.id,
              contentType: entry.sys.contentType.sys.id,
              internalName,
              environment: env.name,
              environmentId: env.sys.id,
              status: entry.sys.publishedVersion ? 'PUBLISHED' : 'DRAFT',
              updatedAt: entry.sys.updatedAt,
              createdAt: entry.sys.createdAt
            });
          }
        }
      } catch (envError) {
        console.log(`  ⚠️ Fehler beim Durchsuchen von Environment ${env.name}: ${envError.message}`);
      }
    }
    
    if (foundEntries.length === 0) {
      console.log(`❌ Kein Entry mit dem Namen "${targetInternalName}" gefunden.`);
    } else {
      console.log(`\n✅ ${foundEntries.length} Entry(s) mit dem Namen "${targetInternalName}" gefunden:`);
      for (const entry of foundEntries) {
        console.log(`\n- [${entry.status}] ${entry.contentType} | ID: ${entry.id}`);
        console.log(`  Environment: ${entry.environment} (${entry.environmentId})`);
        console.log(`  Interner Name: ${entry.internalName}`);
        console.log(`  Created: ${entry.createdAt}`);
        console.log(`  Updated: ${entry.updatedAt}`);
      }
    }
    
    return foundEntries;
    
  } catch (error) {
    console.error('❌ Fehler beim Durchsuchen aller Environments:', error.message);
    return [];
  }
}

// Funktion zum Prüfen auf Duplikate in allen Feldern
function checkForDuplicates(entries) {
  console.log('\n=== Prüfung auf doppelte Einträge in allen Feldern ===');
  
  const fieldDuplicates = {
    internalNames: {},
    slugs: {},
    ids: {}
  };
  
  // Sammle alle Werte
  for (const entry of entries) {
    // Interne Namen
    if (entry.internalName) {
      fieldDuplicates.internalNames[entry.internalName] = fieldDuplicates.internalNames[entry.internalName] || [];
      fieldDuplicates.internalNames[entry.internalName].push(entry);
    }
    
    // Slugs
    if (entry.slug) {
      fieldDuplicates.slugs[entry.slug] = fieldDuplicates.slugs[entry.slug] || [];
      fieldDuplicates.slugs[entry.slug].push(entry);
    }
    
    // IDs
    fieldDuplicates.ids[entry.id] = fieldDuplicates.ids[entry.id] || [];
    fieldDuplicates.ids[entry.id].push(entry);
  }
  
  // Prüfe auf Duplikate
  let hasDuplicates = false;
  
  // Interne Namen
  const duplicateInternalNames = Object.entries(fieldDuplicates.internalNames).filter(([name, entries]) => entries.length > 1);
  if (duplicateInternalNames.length > 0) {
    console.log('\n⚠️ Doppelte interne Namen gefunden:');
    hasDuplicates = true;
    for (const [name, entries] of duplicateInternalNames) {
      console.log(`  "${name}" kommt ${entries.length}x vor:`);
      for (const entry of entries) {
        console.log(`    - [${entry.status}] ${entry.contentType} | ID: ${entry.id}`);
      }
    }
  }
  
  // Slugs
  const duplicateSlugs = Object.entries(fieldDuplicates.slugs).filter(([slug, entries]) => entries.length > 1);
  if (duplicateSlugs.length > 0) {
    console.log('\n⚠️ Doppelte Slugs gefunden:');
    hasDuplicates = true;
    for (const [slug, entries] of duplicateSlugs) {
      console.log(`  "${slug}" kommt ${entries.length}x vor:`);
      for (const entry of entries) {
        console.log(`    - [${entry.status}] ${entry.contentType} | ID: ${entry.id}`);
      }
    }
  }
  
  // IDs (sollten eigentlich nie doppelt sein)
  const duplicateIds = Object.entries(fieldDuplicates.ids).filter(([id, entries]) => entries.length > 1);
  if (duplicateIds.length > 0) {
    console.log('\n🚨 Doppelte IDs gefunden (das sollte nicht passieren!):');
    hasDuplicates = true;
    for (const [id, entries] of duplicateIds) {
      console.log(`  ID "${id}" kommt ${entries.length}x vor:`);
      for (const entry of entries) {
        console.log(`    - [${entry.status}] ${entry.contentType}`);
      }
    }
  }
  
  if (!hasDuplicates) {
    console.log('✅ Keine doppelten Einträge in allen Feldern gefunden.');
  }
  
  return {
    hasDuplicates,
    duplicateInternalNames,
    duplicateSlugs,
    duplicateIds
  };
}

async function searchEntries() {
  const client = contentful.createClient({
    accessToken: ACCESS_TOKEN
  });

  const space = await client.getSpace(SPACE_ID);
  const environment = await space.getEnvironment(ENVIRONMENT_ID);

  // Hole alle relevanten Entries (max 1000)
  const entries = await environment.getEntries({ limit: 1000, include: 0 });

  const results = [];

  for (const entry of entries.items) {
    const internalName = entry.fields.internerName && entry.fields.internerName['de-DE'];
    const slug = entry.fields.slug && entry.fields.slug['de-DE'];

    if (
      internalName && internalName.toLowerCase().startsWith('marken > kalkhoff > trekking-e-bike')
    ) {
      results.push({
        id: entry.sys.id,
        contentType: entry.sys.contentType.sys.id,
        internalName,
        slug,
        status: entry.sys.publishedVersion ? 'PUBLISHED' : 'DRAFT',
        updatedAt: entry.sys.updatedAt
      });
    }
  }

  if (results.length === 0) {
    console.log('Keine passenden Entries gefunden.');
  } else {
    console.log(`Gefundene Entries: ${results.length}`);
    for (const entry of results) {
      console.log(`- [${entry.status}] ${entry.contentType} | ID: ${entry.id}`);
      console.log(`  Interner Name: ${entry.internalName}`);
      if (entry.slug) console.log(`  Slug: ${entry.slug}`);
      console.log(`  Updated: ${entry.updatedAt}`);
    }
    
    // Prüfe auf Duplikate in allen Feldern
    checkForDuplicates(results);
  }
  
  // Suche nach dem spezifischen Entry, der Probleme macht
  await findSpecificEntry(client, 'Marken > Kalkhoff > Trekking-e-bike > Abschnitt 7 (RT)');
}

searchEntries().catch(e => {
  console.error('Fehler bei der Suche:', e.message);
}); 