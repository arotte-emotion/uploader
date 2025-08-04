require('dotenv').config();
const contentful = require('contentful-management');
const fs = require('fs');

const client = contentful.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
});

// Mapping für Content-Typen basierend auf Briefing-Markern
const CONTENT_TYPE_MAPPING = {
  // FAQ-Blöcke
  'faq': 'accordion',
  'aufklappbare faq': 'accordion',
  'häufig gestellte fragen': 'accordion',
  
  // Bilder
  'bild': 'image',
  'image': 'image',
  'galerie': 'imageGallery',
  
  // Links/Buttons
  'button': 'textButtonLink',
  'link': 'textButtonLink',
  'cta': 'callToAction',
  
  // Listen
  'liste': 'styledList',
  'list': 'styledList',
  
  // Produkte
  'produkt': 'teaserElement',
  'produkte': 'teaserGroup',
  
  // Hero/Bereiche
  'hero': 'heroElement',
  'teaser': 'teaserElement',
  
  // Standard für Text
  'default': 'richText'
};

// Default-Werte für verschiedene Content-Typen
const DEFAULT_VALUES = {
  richText: {
    alignment: { 'de-DE': '⬅️~Links' },
    isDark: { 'de-DE': false },
    decorativeElement: { 'de-DE': '🚫~keins' },
    isDisabledForLocale: { 'de-DE': false }
  },
  accordion: {
    isDark: { 'de-DE': false },
    decorativeElement: { 'de-DE': '🚫~keins' },
    isDisabledForLocale: { 'de-DE': false }
  },
  accordionElement: {
    isDisabledForLocale: { 'de-DE': false }
  },
  image: {
    isDisabledForLocale: { 'de-DE': false }
  },
  textButtonLink: {
    isTargetSelf: { 'de-DE': true },
    linkStyle: { 'de-DE': '🥈~Secondary' }
  },
  styledList: {
    isHorizontal: { 'de-DE': false },
    isHighlighted: { 'de-DE': false },
    isDisabledForLocale: { 'de-DE': false }
  },
  styledListelement: {
    iconClass: { 'de-DE': 'default' }
  },
  teaserElement: {
    isDisabledForLocale: { 'de-DE': false }
  },
  teaserGroup: {
    isDark: { 'de-DE': false },
    decorativeElement: { 'de-DE': '🚫~keins' },
    isDisabledForLocale: { 'de-DE': false }
  },
  heroElement: {
    hasDecoration: { 'de-DE': false },
    isDark: { 'de-DE': false },
    isDisabledForLocale: { 'de-DE': false }
  },
  callToAction: {
    isTextPositionLeft: { 'de-DE': false },
    isDark: { 'de-DE': false },
    isDisabledForLocale: { 'de-DE': false }
  },
  highlightedImageText: {
    alignment: { 'de-DE': '⬅️~Links' },
    isDark: { 'de-DE': false },
    decorativeElement: { 'de-DE': '🚫~keins' },
    isDisabledForLocale: { 'de-DE': false }
  },
  simpleImageText: {
    isTextPositionLeft: { 'de-DE': false },
    isDark: { 'de-DE': false },
    decorativeElement: { 'de-DE': '🚫~keins' },
    isDisabledForLocale: { 'de-DE': false }
  }
};

// Hilfsfunktion zum Extrahieren der Metadaten aus dem Briefing
function extractPageData(briefingText) {
  const slugMatch = briefingText.match(/Slug:\s*([^\n]+)/);
  const metaTitleMatch = briefingText.match(/Meta Title:\s*([^\n]+)/);
  const metaDescriptionMatch = briefingText.match(/Meta Description:\s*([^\n]+)/);
  
  const slug = slugMatch ? slugMatch[1].trim() : 'default-slug';
  const internalName = slug.split('/').map(part => 
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join(' > ');
  
  return {
    slug,
    internalName,
    metaTitle: metaTitleMatch ? metaTitleMatch[1].trim() : '',
    metaDescription: metaDescriptionMatch ? metaDescriptionMatch[1].trim() : ''
  };
}

// Hilfsfunktion zum Erkennen des Content-Typs basierend auf Text
function detectContentType(text, marker = '') {
  const lowerText = text.toLowerCase();
  const lowerMarker = marker.toLowerCase();
  
  // Prüfe spezielle Marker
  if (lowerMarker.includes('faq start') || lowerMarker.includes('faq ende')) {
    return 'faqBlock';
  }
  
  if (lowerMarker.includes('bild') || lowerMarker.includes('image') || lowerMarker.includes('galerie')) {
    return lowerMarker.includes('galerie') ? 'imageGallery' : 'image';
  }
  
  if (lowerMarker.includes('button') || lowerMarker.includes('link') || lowerMarker.includes('cta')) {
    return lowerMarker.includes('cta') ? 'callToAction' : 'textButtonLink';
  }
  
  if (lowerMarker.includes('liste') || lowerMarker.includes('list')) {
    return 'styledList';
  }
  
  if (lowerMarker.includes('produkt')) {
    return 'teaserElement';
  }
  
  if (lowerMarker.includes('hero')) {
    return 'heroElement';
  }
  
  if (lowerMarker.includes('teaser')) {
    return 'teaserElement';
  }
  
  // Standard: Rich Text
  return 'richText';
}

// Hilfsfunktion zum Parsen von Rich Text Content
function parseRichTextContent(text) {
  const lines = text.split('\n').filter(line => line.trim() !== '');
  const content = [];
  
  for (const line of lines) {
    if (line.startsWith('H1:')) {
      content.push({
        nodeType: 'heading-1',
        content: [{
          nodeType: 'text',
          value: line.replace('H1:', '').trim(),
          marks: [],
          data: {}
        }],
        data: {}
      });
    } else if (line.startsWith('H2:')) {
      content.push({
        nodeType: 'heading-2',
        content: [{
          nodeType: 'text',
          value: line.replace('H2:', '').trim(),
          marks: [],
          data: {}
        }],
        data: {}
      });
    } else if (line.startsWith('H3:')) {
      content.push({
        nodeType: 'heading-3',
        content: [{
          nodeType: 'text',
          value: line.replace('H3:', '').trim(),
          marks: [],
          data: {}
        }],
        data: {}
      });
    } else if (line.trim() !== '') {
      content.push({
        nodeType: 'paragraph',
        content: [{
          nodeType: 'text',
          value: line.trim(),
          marks: [],
          data: {}
        }],
        data: {}
      });
    }
  }
  
  return content;
}

// Hilfsfunktion zum Extrahieren von FAQs aus FAQ-Blöcken
function extractFAQs(text) {
  const faqs = [];
  const lines = text.split('\n');
  let isFAQBlock = false;
  let currentFAQ = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Prüfe auf FAQ Start/Ende Marker
    if (line.includes('[FAQ Start]') || line.includes('[FAQ Ende]')) {
      if (line.includes('[FAQ Start]')) {
        isFAQBlock = true;
      } else {
        isFAQBlock = false;
        // Letztes FAQ hinzufügen, wenn wir den Block verlassen
        if (currentFAQ) {
          faqs.push(currentFAQ);
          currentFAQ = null;
        }
      }
      continue;
    }
    
    // Nur innerhalb des FAQ-Blocks verarbeiten
    if (isFAQBlock) {
      if (line.startsWith('H3:')) {
        // Vorheriges FAQ speichern
        if (currentFAQ) {
          faqs.push(currentFAQ);
        }
        // Neues FAQ starten
        currentFAQ = {
          question: line.replace('H3:', '').trim(),
          answer: ''
        };
      } else if (currentFAQ && line.trim() !== '' && !line.startsWith('H1:') && !line.startsWith('H2:')) {
        // Antwort zum aktuellen FAQ hinzufügen
        currentFAQ.answer += line.trim() + ' ';
      }
    }
  }
  
  // Letztes FAQ hinzufügen, falls noch nicht geschehen
  if (currentFAQ) {
    faqs.push(currentFAQ);
  }
  
  return faqs;
}

// Hilfsfunktion zum Erstellen eines Rich Text Entries
async function createRichTextEntry(environment, internalName, content, index, uniqueNames) {
  const plannedName = `${internalName} > Abschnitt-${index} (RT)`;
  const entryName = uniqueNames[plannedName] || plannedName;
  
  const entry = await environment.createEntry('richText', {
          fields: {
        internerName: {
          'de-DE': entryName
        },
      richtext: {
        'de-DE': {
          nodeType: 'document',
          data: {},
          content: content
        }
      },
      callToActions: {
        'de-DE': []
      },
      alignment: DEFAULT_VALUES.richText.alignment,
      isDark: DEFAULT_VALUES.richText.isDark,
      decorativeElement: DEFAULT_VALUES.richText.decorativeElement,
      isDisabledForLocale: DEFAULT_VALUES.richText.isDisabledForLocale
    }
  });
  
  console.log(`Rich Text Entry ${index} erstellt (Draft)`);
  return entry;
}

// Hilfsfunktion zum Erstellen von FAQ Entries
async function createFAQEntries(environment, internalName, faqs, uniqueNames) {
  const accordionElements = [];
  const allFAQEntries = []; // Sammle alle FAQ-Entries für das Publishen
  
  for (let i = 0; i < faqs.length; i++) {
    const faq = faqs[i];
    const plannedName = `${internalName} > FAQ-${i + 1} (ACC)`;
    const entryName = uniqueNames[plannedName] || plannedName;
    
    const element = await environment.createEntry('accordionElement', {
      fields: {
        internerName: {
          'de-DE': entryName
        },
        title: {
          'de-DE': faq.question
        },
        text: {
          'de-DE': {
            nodeType: 'document',
            data: {},
            content: [{
              nodeType: 'paragraph',
              content: [{
                nodeType: 'text',
                value: faq.answer.trim(),
                marks: [],
                data: {}
              }],
              data: {}
            }]
          }
        },
        image: {
          'de-DE': null
        },
        isDisabledForLocale: DEFAULT_VALUES.accordionElement.isDisabledForLocale
      }
    });
    
    accordionElements.push({
      sys: {
        type: 'Link',
        linkType: 'Entry',
        id: element.sys.id
      }
    });
    allFAQEntries.push(element); // Füge FAQ-Element zur Liste hinzu
    console.log(`FAQ Element ${i + 1} erstellt (Draft)`);
  }
  
  // Erstelle das Haupt-Accordion
  const plannedAccordionName = `${internalName} > FAQ-Accordion (ACC)`;
  const accordionName = uniqueNames[plannedAccordionName] || plannedAccordionName;
  
  const accordion = await environment.createEntry('accordion', {
    fields: {
      internerName: {
        'de-DE': accordionName
      },
      richtext: {
        'de-DE': {
          nodeType: 'document',
          data: {},
          content: [{
            nodeType: 'heading-2',
            content: [{
              nodeType: 'text',
              value: 'Häufig gestellte Fragen',
              marks: [],
              data: {}
            }],
            data: {}
          }]
        }
      },
      callToActions: {
        'de-DE': []
      },
      accordionElements: {
        'de-DE': accordionElements
      },
      isDark: DEFAULT_VALUES.accordion.isDark,
      decorativeElement: DEFAULT_VALUES.accordion.decorativeElement,
      isDisabledForLocale: DEFAULT_VALUES.accordion.isDisabledForLocale
    }
  });
  
  allFAQEntries.push(accordion); // Füge Haupt-Accordion zur Liste hinzu
  console.log('FAQ Accordion erstellt (Draft)');
  
  return { accordion, allFAQEntries }; // Gib beide zurück
}

// Hilfsfunktion zum Segmentieren des Briefings
function segmentBriefing(briefingText) {
  const segments = [];
  const lines = briefingText.split('\n');
  
  let currentSegment = {
    type: 'richText',
    content: '',
    marker: ''
  };
  
  let isFAQBlock = false;
  
  for (const line of lines) {
    // Prüfe auf FAQ Start/Ende Marker
    if (line.includes('[FAQ Start]')) {
      // Vorheriges Segment speichern
      if (currentSegment.content.trim()) {
        segments.push({ ...currentSegment });
      }
      
      // FAQ Block starten
      isFAQBlock = true;
      currentSegment = {
        type: 'faqBlock',
        content: line + '\n',
        marker: 'FAQ Block'
      };
      continue;
    }
    
    if (line.includes('[FAQ Ende]')) {
      // FAQ Block beenden
      currentSegment.content += line + '\n';
      segments.push({ ...currentSegment });
      
      isFAQBlock = false;
      currentSegment = {
        type: 'richText',
        content: '',
        marker: ''
      };
      continue;
    }
    
    // Prüfe auf andere Marker
    const markerMatch = line.match(/\[([^\]]+)\]/);
    if (markerMatch && !isFAQBlock) {
      // Vorheriges Segment speichern
      if (currentSegment.content.trim()) {
        segments.push({ ...currentSegment });
      }
      
      // Neues Segment starten
      const marker = markerMatch[1];
      currentSegment = {
        type: detectContentType(line, marker),
        content: line + '\n',
        marker: marker
      };
      continue;
    }
    
    // Normaler Text
    currentSegment.content += line + '\n';
  }
  
  // Letztes Segment speichern
  if (currentSegment.content.trim()) {
    segments.push(currentSegment);
  }
  
  return segments;
}

// Hilfsfunktion zum Bereinigen des Contents (Metadaten entfernen)
function cleanContent(content) {
  const lines = content.split('\n');
  const cleanedLines = [];
  let foundFirstHeading = false;
  
  for (const line of lines) {
    // Überspringe Metadaten
    if (line.startsWith('Slug:') || line.startsWith('Meta Title:') || line.startsWith('Meta Description:')) {
      continue;
    }
    
    // Wenn wir die erste Überschrift finden, markieren wir es
    if (line.startsWith('H1:') || line.startsWith('H2:') || line.startsWith('H3:')) {
      foundFirstHeading = true;
    }
    
    // Nur Zeilen nach der ersten Überschrift oder wenn es keine Überschriften gibt
    if (foundFirstHeading || (!foundFirstHeading && line.trim() !== '')) {
      cleanedLines.push(line);
    }
  }
  
  return cleanedLines.join('\n');
}

// Hilfsfunktion zur Voranalyse des Briefings
function analyzeBriefing(briefingText) {
  const segments = segmentBriefing(briefingText);
  const analysis = {
    totalSegments: segments.length,
    richTextSegments: 0,
    faqSegments: 0,
    otherSegments: 0,
    totalFAQs: 0
  };
  
  console.log('\n=== Briefing Analyse ===');
  console.log(`Gefunden: ${segments.length} Segmente`);
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const cleanedContent = cleanContent(segment.content);
    
    if (segment.type === 'faqBlock') {
      analysis.faqSegments++;
      const faqs = extractFAQs(cleanedContent);
      analysis.totalFAQs += faqs.length;
      console.log(`Segment ${i + 1}: FAQ Block mit ${faqs.length} Fragen`);
    } else if (segment.type === 'richText') {
      analysis.richTextSegments++;
      const richTextContent = parseRichTextContent(cleanedContent);
      if (richTextContent.length > 0) {
        console.log(`Segment ${i + 1}: Rich Text (${richTextContent.length} Elemente)`);
      } else {
        console.log(`Segment ${i + 1}: Rich Text (leer)`);
      }
    } else {
      analysis.otherSegments++;
      console.log(`Segment ${i + 1}: ${segment.type} (wird als Rich Text behandelt)`);
    }
  }
  
  console.log(`\nZusammenfassung:`);
  console.log(`- Rich Text Segmente: ${analysis.richTextSegments}`);
  console.log(`- FAQ Segmente: ${analysis.faqSegments}`);
  console.log(`- Andere Segmente: ${analysis.otherSegments}`);
  console.log(`- Gesamte FAQs: ${analysis.totalFAQs}`);
  console.log('=== Ende Analyse ===\n');
  
  return analysis;
}

// Funktion zum Finden und Bereinigen von Ghost-Entries
async function findAndCleanGhostEntries(environment, prefix) {
  console.log(`\n=== Suche nach Ghost-Entries mit Präfix: "${prefix}" ===`);
  
  try {
    // Hole alle Entries aus dem Space
    const entries = await environment.getEntries({
      limit: 1000,
      include: 0
    });
    
    const ghostEntries = [];
    const duplicateInternalNames = new Map();
    
    // Sammle alle Entries mit dem Präfix
    for (const entry of entries.items) {
      if (entry.fields.internerName && 
          entry.fields.internerName['de-DE'] && 
          entry.fields.internerName['de-DE'].startsWith(prefix)) {
        
        const internalName = entry.fields.internerName['de-DE'];
        
        if (!duplicateInternalNames.has(internalName)) {
          duplicateInternalNames.set(internalName, []);
        }
        duplicateInternalNames.get(internalName).push(entry);
      }
    }
    
    // Finde Duplikate (Ghost-Entries)
    for (const [internalName, entriesWithSameName] of duplicateInternalNames) {
      if (entriesWithSameName.length > 1) {
        console.log(`\n⚠️  Duplikate gefunden für "${internalName}":`);
        
        // Sortiere nach published Version (unpublished zuerst)
        entriesWithSameName.sort((a, b) => {
          const aPublished = a.sys.publishedVersion ? 1 : 0;
          const bPublished = b.sys.publishedVersion ? 1 : 0;
          return aPublished - bPublished;
        });
        
        for (let i = 0; i < entriesWithSameName.length; i++) {
          const entry = entriesWithSameName[i];
          const status = entry.sys.publishedVersion ? 'PUBLISHED' : 'DRAFT';
          console.log(`  ${i + 1}. ${status} | ID: ${entry.sys.id} | Type: ${entry.sys.contentType.sys.id}`);
        }
        
        // Behalte nur das erste Entry (meist das unpublished)
        const entriesToClean = entriesWithSameName.slice(1);
        ghostEntries.push(...entriesToClean);
      }
    }
    
    if (ghostEntries.length === 0) {
      console.log('✅ Keine Ghost-Entries gefunden');
      return [];
    }
    
    console.log(`\n🧹 Bereinige ${ghostEntries.length} Ghost-Entries...`);
    
    // Bereinige Ghost-Entries
    for (const ghostEntry of ghostEntries) {
      try {
        console.log(`\n🗑️  Bereinige Ghost-Entry: ${ghostEntry.fields.internerName['de-DE']} (ID: ${ghostEntry.sys.id})`);
        
        // Wenn das Entry published ist, unpublish es zuerst
        if (ghostEntry.sys.publishedVersion) {
          console.log(`  📤 Unpublish Entry...`);
          await ghostEntry.unpublish();
        }
        
        // Lösche das Entry
        console.log(`  🗑️  Lösche Entry...`);
        await ghostEntry.delete();
        console.log(`  ✅ Ghost-Entry erfolgreich bereinigt`);
        
      } catch (error) {
        console.error(`  ❌ Fehler beim Bereinigen von Ghost-Entry ${ghostEntry.sys.id}:`, error.message);
      }
    }
    
    console.log(`\n✅ Ghost-Entry Bereinigung abgeschlossen`);
    return ghostEntries;
    
  } catch (error) {
    console.error('❌ Fehler beim Finden und Bereinigen von Ghost-Entries:', error);
    return [];
  }
}

// Generelle Funktion zur Bereinigung von Ghost-Entries nach Support-Verfahren
async function cleanGhostEntry(environment, ghostEntryId, contentType = 'pageStandard') {
  console.log(`\n🧹 Bereinige Ghost-Entry mit ID: ${ghostEntryId}`);
  
  try {
    // Support-Verfahren basierend auf Contentful Management API
    // Da createEntryWithId nicht verfügbar ist, verwenden wir einen Workaround
    
    console.log(`  📝 Schritt 1: Erstelle temporäres Entry...`);
    
    const tempEntry = await environment.createEntry(contentType, {
      fields: {
        internerName: {
          'de-DE': `Ghost-Cleanup-${Date.now()}`
        },
        slug: {
          'de-DE': `ghost-cleanup-${Date.now()}`
        }
      }
    });
    
    console.log(`  ✅ Temporäres Entry erstellt (ID: ${tempEntry.sys.id})`);
    
    // Support-Verfahren Schritt 2: Unpublish das Entry
    console.log(`  📤 Schritt 2: Unpublish Entry...`);
    await tempEntry.unpublish();
    console.log(`  ✅ Entry unpublisht`);
    
    // Support-Verfahren Schritt 3: Lösche das Entry
    console.log(`  🗑️  Schritt 3: Lösche Entry...`);
    await tempEntry.delete();
    console.log(`  ✅ Entry gelöscht`);
    
    console.log(`  ✅ Support-Verfahren abgeschlossen`);
    console.log(`  💡 Hinweis: Das Ghost-Entry ${ghostEntryId} kann nur durch Contentful Support gelöscht werden`);
    console.log(`  📧 Kontaktiere Contentful Support mit Ghost-Entry-ID: ${ghostEntryId}`);
    
    return true;
  } catch (error) {
    console.error(`  ❌ Fehler beim Support-Verfahren:`, error.message);
    return false;
  }
}

// Verbesserte Ghost-Entry-Behandlung basierend auf API-Dokumentation
async function handleGhostEntryWithAPIWorkaround(environment, ghostEntryId, contentType = 'pageStandard') {
  console.log(`\n🧹 Erweiterte Ghost-Entry-Behandlung für: ${ghostEntryId}`);
  
  try {
    // Schritt 1: Versuche das Entry direkt zu finden
    console.log(`  🔍 Schritt 1: Suche nach Entry...`);
    try {
      const existingEntry = await environment.getEntry(ghostEntryId);
      console.log(`  ✅ Entry gefunden: ${existingEntry.fields.internerName?.['de-DE'] || 'Unbekannt'}`);
      
      // Wenn Entry existiert, normal löschen
      if (existingEntry.sys.publishedVersion) {
        console.log(`  📤 Unpublish...`);
        await existingEntry.unpublish();
      }
      
      console.log(`  🗑️  Lösche...`);
      await existingEntry.delete();
      console.log(`  ✅ Entry erfolgreich gelöscht`);
      return true;
      
    } catch (error) {
      if (error.status === 404) {
        console.log(`  👻 Ghost-Entry bestätigt (404) - verwende API-Workaround`);
      } else {
        throw error;
      }
    }
    
    // Schritt 2: API-Workaround für Ghost-Entries
    console.log(`  🔧 Schritt 2: API-Workaround für Ghost-Entry...`);
    
    // Erstelle mehrere temporäre Entries um den Index zu "reinigen"
    const tempEntries = [];
    const cleanupCount = 3; // Mehrere Entries für bessere Erfolgswahrscheinlichkeit
    
    for (let i = 0; i < cleanupCount; i++) {
      const tempEntry = await environment.createEntry(contentType, {
        fields: {
          internerName: {
            'de-DE': `Ghost-Cleanup-${Date.now()}-${i}`
          },
          slug: {
            'de-DE': `ghost-cleanup-${Date.now()}-${i}`
          }
        }
      });
      
      tempEntries.push(tempEntry);
      console.log(`  📝 Temporäres Entry ${i + 1} erstellt (ID: ${tempEntry.sys.id})`);
    }
    
    // Schritt 3: Unpublish alle temporären Entries
    console.log(`  📤 Schritt 3: Unpublish temporäre Entries...`);
    for (const tempEntry of tempEntries) {
      await tempEntry.unpublish();
    }
    console.log(`  ✅ Alle temporären Entries unpublisht`);
    
    // Schritt 4: Lösche alle temporären Entries
    console.log(`  🗑️  Schritt 4: Lösche temporäre Entries...`);
    for (const tempEntry of tempEntries) {
      await tempEntry.delete();
    }
    console.log(`  ✅ Alle temporären Entries gelöscht`);
    
    console.log(`  ✅ API-Workaround abgeschlossen`);
    console.log(`  💡 Hinweis: Ghost-Entry ${ghostEntryId} kann nur durch Contentful Support endgültig entfernt werden`);
    console.log(`  📧 Support-Ticket mit Ghost-Entry-ID: ${ghostEntryId}`);
    
    return true;
    
  } catch (error) {
    console.error(`  ❌ Fehler beim API-Workaround:`, error.message);
    console.error(`  📋 Fehlerdetails:`, error);
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
    // Fallback-IDs basierend auf bekannten Content-Types
    const fallbackIds = {
      'pageStandard': 'pageStandard',
      'richText': 'richText', 
      'accordionElement': 'accordionElement',
      'accordion': 'accordion'
    };
    return fallbackIds[contentTypeName] || contentTypeName;
  }
}

// Neue Funktion: Erstelle Entry mit spezifischer ID über PUT-Methode
async function createEntryWithSpecificId(environment, contentType, entryId, fields) {
  console.log(`\n🔧 Erstelle Entry mit spezifischer ID: ${entryId}`);
  
  try {
    // Ermittle die Content-Type-ID
    const contentTypeId = await getContentTypeId(environment, contentType);
    console.log(`  📋 Content-Type-ID: ${contentTypeId}`);
    
    // Verwende die PUT-Methode für Entry-Erstellung mit ID
    const response = await environment.client.put(
      `/spaces/${environment.sys.space.sys.id}/environments/${environment.sys.id}/entries/${entryId}`,
      {
        fields: fields,
        metadata: {
          tags: []
        }
      },
      {
        headers: {
          'X-Contentful-Content-Type': contentTypeId
        }
      }
    );
    
    console.log(`  ✅ Entry mit ID ${entryId} erfolgreich erstellt`);
    return response;
    
  } catch (error) {
    console.error(`  ❌ Fehler beim Erstellen des Entries mit ID ${entryId}:`, error.message);
    throw error;
  }
}

// Verbesserte Ghost-Entry-Behandlung mit PUT-Methode
async function handleGhostEntryWithPUTMethod(environment, ghostEntryId, contentType = 'pageStandard') {
  console.log(`\n🧹 Ghost-Entry-Behandlung mit PUT-Methode für: ${ghostEntryId}`);
  
  try {
    // Schritt 1: Versuche das Entry direkt zu finden
    console.log(`  🔍 Schritt 1: Suche nach Entry...`);
    try {
      const existingEntry = await environment.getEntry(ghostEntryId);
      console.log(`  ✅ Entry gefunden: ${existingEntry.fields.internerName?.['de-DE'] || 'Unbekannt'}`);
      
      // Wenn Entry existiert, normal löschen
      if (existingEntry.sys.publishedVersion) {
        console.log(`  📤 Unpublish...`);
        await existingEntry.unpublish();
      }
      
      console.log(`  🗑️  Lösche...`);
      await existingEntry.delete();
      console.log(`  ✅ Entry erfolgreich gelöscht`);
      return true;
      
    } catch (error) {
      if (error.status === 404) {
        console.log(`  👻 Ghost-Entry bestätigt (404) - verwende PUT-Methode`);
      } else {
        throw error;
      }
    }
    
    // Schritt 2: Erstelle Entry mit der Ghost-Entry-ID über PUT-Methode
    console.log(`  🔧 Schritt 2: Erstelle Entry mit Ghost-Entry-ID über PUT-Methode...`);
    
    const fields = {
      internerName: {
        'de-DE': `Ghost-Cleanup-${Date.now()}`
      },
      slug: {
        'de-DE': `ghost-cleanup-${Date.now()}`
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
              value: 'Ghost-Entry-Cleanup',
              marks: [],
              data: {}
            }],
            data: {}
          }]
        }
      };
    } else if (contentType === 'accordionElement') {
      fields.title = {
        'de-DE': 'Ghost-Entry-Cleanup'
      };
      fields.text = {
        'de-DE': {
          nodeType: 'document',
          data: {},
          content: [{
            nodeType: 'paragraph',
            content: [{
              nodeType: 'text',
              value: 'Ghost-Entry-Cleanup',
              marks: [],
              data: {}
            }],
            data: {}
          }]
        }
      };
    }
    
    // Verwende node-fetch für direkten PUT-Request
    const fetch = require('node-fetch');
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
    console.log(`  ✅ Entry mit Ghost-Entry-ID erstellt: ${newEntry.sys.id}`);
    
    // Schritt 3: Unpublish das neue Entry
    console.log(`  📤 Schritt 3: Unpublish Entry...`);
    const entry = await environment.getEntry(ghostEntryId);
    await entry.unpublish();
    console.log(`  ✅ Entry unpublisht`);
    
    // Schritt 4: Lösche das Entry
    console.log(`  🗑️  Schritt 4: Lösche Entry...`);
    await entry.delete();
    console.log(`  ✅ Entry gelöscht`);
    
    console.log(`  ✅ Ghost-Entry erfolgreich bereinigt!`);
    console.log(`  🎉 Das Ghost-Entry ${ghostEntryId} wurde überwunden`);
    
    return true;
    
  } catch (error) {
    console.error(`  ❌ Fehler bei der PUT-Methode Ghost-Entry-Behandlung:`, error.message);
    console.error(`  📋 Fehlerdetails:`, error);
    
    // Fallback auf den alten Workaround
    console.log(`  🔄 Verwende Fallback-Workaround...`);
    return await handleGhostEntryWithAPIWorkaround(environment, ghostEntryId, contentType);
  }
}

// Funktion zum Erkennen und Bereinigen von Ghost-Entries aus Fehlermeldungen
async function handleGhostEntryConflicts(environment, failedEntries) {
  console.log(`\n🔍 Prüfe auf Ghost-Entry-Konflikte...`);
  
  const ghostEntryIds = new Set();
  
  for (const { error } of failedEntries) {
    // Extrahiere konfligierende Entry-IDs aus Fehlermeldungen
    const conflictMatches = error.match(/"id":\s*"([^"]+)"/g);
    if (conflictMatches) {
      for (const match of conflictMatches) {
        const entryId = match.match(/"id":\s*"([^"]+)"/)[1];
        ghostEntryIds.add(entryId);
      }
    }
  }
  
  if (ghostEntryIds.size === 0) {
    console.log('  ✅ Keine Ghost-Entry-Konflikte gefunden');
    return;
  }
  
  console.log(`  🚨 Gefunden: ${ghostEntryIds.size} Ghost-Entry-Konflikte`);
  
  // Bereinige jeden Ghost-Entry
  for (const ghostEntryId of ghostEntryIds) {
    console.log(`\n  🧹 Bereinige Ghost-Entry: ${ghostEntryId}`);
    
    // Versuche zuerst, das Entry normal zu löschen
    try {
      const existingEntry = await environment.getEntry(ghostEntryId);
      console.log(`    📄 Gefunden: ${existingEntry.fields.internerName?.['de-DE'] || 'Unbekannt'}`);
      
      if (existingEntry.sys.publishedVersion) {
        console.log(`    📤 Unpublish...`);
        await existingEntry.unpublish();
      }
      
      console.log(`    🗑️  Lösche...`);
      await existingEntry.delete();
      console.log(`    ✅ Normal gelöscht`);
      
    } catch (error) {
      if (error.status === 404) {
        console.log(`    👻 Ghost-Entry bestätigt (404) - verwende Support-Verfahren`);
        // Ghost-Entry: Verwende PUT-Methode für echte Lösung
        const contentType = determineContentTypeFromError(error);
        await handleGhostEntryWithPUTMethod(environment, ghostEntryId, contentType);
      } else {
        console.error(`    ❌ Fehler: ${error.message}`);
      }
    }
  }
  
  // Nach der Ghost-Entry-Bereinigung: Versuche erneute Publizierung
  console.log(`\n🔄 Versuche erneute Publizierung nach Ghost-Entry-Bereinigung...`);
  
  for (const { entry } of failedEntries) {
    try {
      console.log(`  📤 Publisiere erneut: ${entry.fields.internerName['de-DE']} (ID: ${entry.sys.id})`);
      await entry.publish();
      console.log(`  ✅ Erfolgreich publiziert nach Ghost-Entry-Bereinigung`);
    } catch (retryError) {
      console.error(`  ❌ Erneute Publizierung fehlgeschlagen: ${retryError.message}`);
    }
  }
}

// Hilfsfunktion zum Bestimmen des Content-Types aus Fehlermeldungen
function determineContentTypeFromError(error) {
  const errorStr = JSON.stringify(error);
  
  if (errorStr.includes('slug')) {
    return 'pageStandard'; // Hauptseiten haben slug-Feld
  } else if (errorStr.includes('internerName')) {
    return 'richText'; // Content-Entries haben internerName
  } else {
    return 'pageStandard'; // Default
  }
}

// Erweitere die publishEntries Funktion um Ghost-Entry-Behandlung
async function publishEntries(environment, entries) {
  console.log(`\n📤 Publisiere ${entries.length} Entries...`);
  
  const publishedEntries = [];
  const failedEntries = [];
  
  for (const entry of entries) {
    try {
      console.log(`  📤 Publisiere: ${entry.fields.internerName['de-DE']} (ID: ${entry.sys.id})`);
      await entry.publish();
      publishedEntries.push(entry);
      console.log(`  ✅ Erfolgreich publiziert`);
    } catch (error) {
      console.error(`  ❌ Fehler beim Publishen: ${error.message}`);
      failedEntries.push({ entry, error: error.message });
    }
  }
  
  console.log(`\n📊 Publizierungs-Ergebnis:`);
  console.log(`  ✅ Erfolgreich publiziert: ${publishedEntries.length}`);
  console.log(`  ❌ Fehlgeschlagen: ${failedEntries.length}`);
  
  if (failedEntries.length > 0) {
    console.log(`\n⚠️  Fehlgeschlagene Publizierungen:`);
    for (const { entry, error } of failedEntries) {
      console.log(`  - ${entry.fields.internerName['de-DE']}: ${error}`);
    }
    
    // Behandle Ghost-Entry-Konflikte
    await handleGhostEntryConflicts(environment, failedEntries);
  }
  
  return { publishedEntries, failedEntries };
}



// Hauptfunktion zum Erstellen der Seite
async function createPage() {
  try {
    const space = await client.getSpace('is4lb5trkwgp');
    const environment = await space.getEnvironment('production');
    
    console.log('🔧 Import-Konfiguration:');
    console.log(`   Space ID: ${space.sys.id}`);
    console.log(`   Environment: ${environment.name} (${environment.sys.id})`);
    console.log(`   Environment Type: ${environment.sys.type}`);
    
    // Lade das Briefing
    const briefingText = fs.readFileSync('briefing-kalkhoff-trekking.txt', 'utf8');
    const pageData = extractPageData(briefingText);
    
    console.log('Verarbeite Briefing für:', pageData.internalName);
    
    // Analysiere existierende Entries vor dem Import
    const existingEntries = await analyzeExistingEntries(environment, pageData.internalName);
    
    // Bereinige Ghost-Entries vor dem Import
    await findAndCleanGhostEntries(environment, pageData.internalName);
    
    // Analysiere das Briefing vorab
    const analysis = analyzeBriefing(briefingText);
    
    // Generiere eindeutige Namen basierend auf der Analyse
    const plannedNames = [
      pageData.internalName,
      ...Array.from({length: analysis.richTextSegments}, (_, i) => `${pageData.internalName} > Abschnitt-${i + 1} (RT)`),
      ...Array.from({length: analysis.totalFAQs}, (_, i) => `${pageData.internalName} > FAQ-${i + 1} (ACC)`),
      `${pageData.internalName} > FAQ-Accordion (ACC)`
    ];
    
    const uniqueNames = await generateUniqueNames(environment, pageData.internalName, plannedNames);
    
    // Segmentiere das Briefing
    const segments = segmentBriefing(briefingText);
    
    const contentEntries = [];
    const allCreatedEntries = []; // Sammle alle erstellten Entries für das Publishen
    let richTextCounter = 0;
    
    console.log('\n=== Starte Import ===');
    
    // Verarbeite jedes Segment
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      console.log(`\nVerarbeite Segment ${i + 1}: ${segment.type}`);
      
      if (segment.type === 'faqBlock') {
        const cleanedContent = cleanContent(segment.content);
        const faqs = extractFAQs(cleanedContent);
        if (faqs.length > 0) {
          const { accordion, allFAQEntries } = await createFAQEntries(environment, pageData.internalName, faqs, uniqueNames);
          contentEntries.push({
            sys: {
              type: 'Link',
              linkType: 'Entry',
              id: accordion.sys.id
            }
          });
          allCreatedEntries.push(accordion);
          allCreatedEntries.push(...allFAQEntries); // Füge alle FAQ-Elemente zur Liste hinzu
        }
      } else if (segment.type === 'richText') {
        const cleanedContent = cleanContent(segment.content);
        const richTextContent = parseRichTextContent(cleanedContent);
        if (richTextContent.length > 0) {
          richTextCounter++;
          const richText = await createRichTextEntry(environment, pageData.internalName, richTextContent, richTextCounter, uniqueNames);
          contentEntries.push({
            sys: {
              type: 'Link',
              linkType: 'Entry',
              id: richText.sys.id
            }
          });
          allCreatedEntries.push(richText);
        }
      } else {
        // Für andere Typen erstmal als Rich Text behandeln
        console.log(`Typ ${segment.type} wird als Rich Text behandelt`);
        const cleanedContent = cleanContent(segment.content);
        const richTextContent = parseRichTextContent(cleanedContent);
        if (richTextContent.length > 0) {
          richTextCounter++;
          const richText = await createRichTextEntry(environment, pageData.internalName, richTextContent, richTextCounter, uniqueNames);
          contentEntries.push({
            sys: {
              type: 'Link',
              linkType: 'Entry',
              id: richText.sys.id
            }
          });
          allCreatedEntries.push(richText);
        }
      }
    }
    
    // Erstelle die Hauptseite
    console.log('\nErstelle Hauptseite...');
    const pageName = uniqueNames[pageData.internalName] || pageData.internalName;
    const page = await environment.createEntry('pageStandard', {
      fields: {
        internerName: {
          'de-DE': pageName
        },
        slug: {
          'de-DE': pageData.slug
        },
        content: {
          'de-DE': contentEntries
        },
        metaPageTitle: {
          'de-DE': pageData.metaTitle
        },
        metaDescription: {
          'de-DE': pageData.metaDescription
        },
        ogImage: {
          'de-DE': null
        },
        canonicalUrl: {
          'de-DE': ''
        },
        isNoIndex: {
          'de-DE': false
        },
        isDisabledForLocale: {
          'de-DE': false
        }
      }
    });
    
    allCreatedEntries.push(page);
    
    console.log('\n✅ Seite erfolgreich erstellt!');
    console.log(`📄 Seite: ${pageData.internalName}`);
    console.log(`🔗 Slug: ${pageData.slug}`);
    console.log(`📝 ${contentEntries.length} Content-Entries erstellt`);
    console.log(`📊 Rich Text Entries: ${richTextCounter}`);
    console.log(`📊 FAQ Entries: ${analysis.totalFAQs}`);
    
    // Publisiere alle erstellten Entries
    const publishResult = await publishEntries(environment, allCreatedEntries);
    

    
    // Bereinige Ghost-Entries nach dem Import
    console.log('\n🧹 Bereinige Ghost-Entries nach dem Import...');
    await findAndCleanGhostEntries(environment, pageData.internalName);
    
    // Versuche fehlgeschlagene Publizierungen erneut
    if (publishResult.failedEntries.length > 0) {
      console.log('\n🔄 Versuche fehlgeschlagene Publizierungen erneut...');
      const retryEntries = publishResult.failedEntries.map(f => f.entry);
      const retryResult = await publishEntries(environment, retryEntries);
      
      console.log(`\n📊 Wiederholungs-Ergebnis:`);
      console.log(`  ✅ Erfolgreich publiziert: ${retryResult.publishedEntries.length}`);
      console.log(`  ❌ Fehlgeschlagen: ${retryResult.failedEntries.length}`);
    }
    
    console.log('\n🎉 Import und Publizierung abgeschlossen!');
    
  } catch (error) {
    console.error('❌ Fehler beim Erstellen der Seite:', error);
  }
}

// Funktion zum Untersuchen existierender Entries mit Präfix
async function analyzeExistingEntries(environment, prefix) {
  console.log(`\n=== Analysiere existierende Entries mit Präfix: "${prefix}" ===`);
  
  try {
    // Hole alle Entries aus dem Space (auch PUBLISHED)
    const entries = await environment.getEntries({
      limit: 1000,
      include: 0
    });
    
    const matchingEntries = [];
    const entryTypes = new Set();
    
    // Filtere Entries mit dem Präfix
    for (const entry of entries.items) {
      if (entry.fields.internerName && 
          entry.fields.internerName['de-DE'] && 
          entry.fields.internerName['de-DE'].startsWith(prefix)) {
        
        matchingEntries.push({
          id: entry.sys.id,
          contentType: entry.sys.contentType.sys.id,
          internalName: entry.fields.internerName['de-DE'],
          published: entry.sys.publishedVersion ? true : false,
          updatedAt: entry.sys.updatedAt
        });
        
        entryTypes.add(entry.sys.contentType.sys.id);
      }
    }
    
    console.log(`\nGefunden: ${matchingEntries.length} Entries mit Präfix "${prefix}"`);
    console.log(`Content Types: ${Array.from(entryTypes).join(', ')}`);
    
    if (matchingEntries.length > 0) {
      console.log('\n=== Detaillierte Analyse ===');
      
      // Gruppiere nach Content Type
      const groupedByType = {};
      for (const entry of matchingEntries) {
        if (!groupedByType[entry.contentType]) {
          groupedByType[entry.contentType] = [];
        }
        groupedByType[entry.contentType].push(entry);
      }
      
      // Analysiere jede Gruppe
      for (const [contentType, entries] of Object.entries(groupedByType)) {
        console.log(`\n📋 ${contentType} (${entries.length} Entries):`);
        
        // Sortiere nach Namen für bessere Übersicht
        entries.sort((a, b) => a.internalName.localeCompare(b.internalName));
        
        for (const entry of entries) {
          const status = entry.published ? '✅ PUBLISHED' : '📝 DRAFT';
          console.log(`  ${status} | ${entry.internalName} (ID: ${entry.id})`);
        }
        
        // Prüfe auf Duplikate
        const names = entries.map(e => e.internalName);
        const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
        
        if (duplicates.length > 0) {
          console.log(`  ⚠️  DUPLIKATE GEFUNDEN: ${[...new Set(duplicates)].join(', ')}`);
        }
      }
      
      // Prüfe auf Namenskonflikte mit geplanten Namen
      console.log('\n=== Namenskonflikt-Analyse ===');
      const plannedNames = [
        `${prefix}`,
        `${prefix} > Abschnitt 1 (RT)`,
        `${prefix} > Abschnitt 2 (RT)`,
        `${prefix} > Abschnitt 3 (RT)`,
        `${prefix} > Abschnitt 4 (RT)`,
        `${prefix} > Abschnitt 5 (RT)`,
        `${prefix} > Abschnitt 6 (RT)`,
        `${prefix} > Abschnitt 7 (RT)`,
        `${prefix} > Abschnitt 8 (RT)`,
        `${prefix} > Abschnitt 9 (RT)`,
        `${prefix} > FAQ 1 (ACC)`,
        `${prefix} > FAQ 2 (ACC)`,
        `${prefix} > FAQ 3 (ACC)`,
        `${prefix} > FAQ 4 (ACC)`,
        `${prefix} > FAQ 5 (ACC)`,
        `${prefix} > FAQ 6 (ACC)`,
        `${prefix} > FAQ 7 (ACC)`,
        `${prefix} > FAQ 8 (ACC)`,
        `${prefix} > FAQ 9 (ACC)`,
        `${prefix} > FAQ 10 (ACC)`,
        `${prefix} > FAQ Accordion (ACC)`
      ];
      
      const existingNames = matchingEntries.map(e => e.internalName);
      const conflicts = plannedNames.filter(name => existingNames.includes(name));
      
      if (conflicts.length > 0) {
        console.log('⚠️  NAMENSKONFLIKTE MIT GEPLANTEN NAMEN:');
        for (const conflict of conflicts) {
          const conflictingEntries = matchingEntries.filter(e => e.internalName === conflict);
          console.log(`  "${conflict}":`);
          for (const entry of conflictingEntries) {
            const status = entry.published ? 'PUBLISHED' : 'DRAFT';
            console.log(`    - ${entry.contentType} (${status}) - ID: ${entry.id}`);
          }
        }
      } else {
        console.log('✅ Keine Namenskonflikte mit geplanten Namen gefunden');
      }
    }
    
    return matchingEntries;
    
  } catch (error) {
    console.error('❌ Fehler beim Analysieren der existierenden Entries:', error);
    return [];
  }
}

// Funktion zum Generieren eindeutiger Namen
function generateUniqueNames(environment, prefix, plannedNames) {
  console.log('\n=== Generiere eindeutige Namen ===');
  
  // Hole alle existierenden Namen (auch PUBLISHED)
  return environment.getEntries({
    limit: 1000,
    include: 0
  }).then(entries => {
    const existingNames = new Set();
    
    // Sammle alle existierenden Namen
    for (const entry of entries.items) {
      if (entry.fields.internerName && entry.fields.internerName['de-DE']) {
        existingNames.add(entry.fields.internerName['de-DE']);
      }
    }
    
    const uniqueNames = {};
    let counter = 1;
    
    for (const plannedName of plannedNames) {
      let uniqueName = plannedName;
      
      // Wenn der Name bereits existiert, füge eine Nummer hinzu
      while (existingNames.has(uniqueName)) {
        const baseName = plannedName.replace(/ > [^>]+$/, ''); // Entferne den letzten Teil
        const suffix = plannedName.match(/ > ([^>]+)$/)?.[1] || '';
        uniqueName = `${baseName} > ${suffix} (${counter})`;
        counter++;
      }
      
      uniqueNames[plannedName] = uniqueName;
      existingNames.add(uniqueName); // Füge den neuen Namen zur Liste hinzu
    }
    
    console.log('✅ Eindeutige Namen generiert:');
    for (const [original, unique] of Object.entries(uniqueNames)) {
      if (original !== unique) {
        console.log(`  "${original}" → "${unique}"`);
      }
    }
    
    return uniqueNames;
  });
}

// Funktion zum Depublishen und Löschen aller importierten Elemente
async function depublishAndDeleteAllImported(environment, prefix) {
  console.log(`\n=== Depublishe und lösche alle importierten Elemente mit Präfix: "${prefix}" ===`);
  try {
    // Hole alle relevanten Entries
    const entries = await environment.getEntries({
      limit: 1000,
      include: 0
    });
    const toDelete = entries.items.filter(entry =>
      entry.fields.internerName &&
      entry.fields.internerName['de-DE'] &&
      entry.fields.internerName['de-DE'].startsWith(prefix)
    );
    if (toDelete.length === 0) {
      console.log('Keine passenden Entries gefunden.');
      return;
    }
    for (const entry of toDelete) {
      const name = entry.fields.internerName['de-DE'];
      try {
        if (entry.sys.publishedVersion) {
          console.log(`Depublishe: ${name} (ID: ${entry.sys.id})`);
          await entry.unpublish();
        }
      } catch (err) {
        console.error(`Fehler beim Depublishen von ${name}: ${err.message}`);
      }
      try {
        console.log(`Lösche: ${name} (ID: ${entry.sys.id})`);
        await entry.delete();
      } catch (err) {
        console.error(`Fehler beim Löschen von ${name}: ${err.message}`);
      }
    }
    console.log('Alle passenden Entries depublisht und gelöscht.');
  } catch (error) {
    console.error('Fehler beim Depublishen/Löschen:', error);
  }
}

// Funktion zum Auflisten aller Entries mit Präfix
async function listAllEntriesWithPrefix(environment, prefix) {
  console.log(`\n=== Liste alle Entries mit Präfix: "${prefix}" ===`);
  try {
    const entries = await environment.getEntries({
      limit: 1000,
      include: 0
    });
    const filtered = entries.items.filter(entry =>
      entry.fields.internerName &&
      entry.fields.internerName['de-DE'] &&
      entry.fields.internerName['de-DE'].startsWith(prefix)
    );
    if (filtered.length === 0) {
      console.log('Keine passenden Entries gefunden.');
      return;
    }
    for (const entry of filtered) {
      const name = entry.fields.internerName['de-DE'];
      const type = entry.sys.contentType ? entry.sys.contentType.sys.id : 'unknown';
      const status = entry.sys.publishedVersion ? 'PUBLISHED' : 'DRAFT';
      console.log(`ID: ${entry.sys.id} | Typ: ${type} | Status: ${status} | Name: ${name}`);
    }
    console.log(`\nGesamt: ${filtered.length} Entries mit Präfix "${prefix}" gefunden.`);
  } catch (error) {
    console.error('Fehler beim Auflisten:', error);
  }
}

createPage(); 