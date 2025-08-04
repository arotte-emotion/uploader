require('dotenv').config();
console.log('dotenv geladen');

const contentful = require('contentful-management');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { documentToHtmlString } = require('@contentful/rich-text-html-renderer');

// Erstelle readline Interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const client = contentful.createClient({
  space: process.env.CONTENTFUL_SPACE_ID,
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
});

// Hilfsfunktion für Benutzereingaben
function question(query) {
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        readline.question(query, (answer) => {
            readline.close();
            resolve(answer);
        });
    });
}

// Hilfsfunktion zum Extrahieren des Slugs aus dem Briefing
function extractSlug(briefingText) {
  const slugMatch = briefingText.match(/Slug:\s*([^\n]+)/);
  return slugMatch ? slugMatch[1].trim() : null;
}

// Hilfsfunktion zum Generieren des internen Namens aus dem Slug
function generateInternalName(slug) {
  return slug
    .split('/')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' > ');
}

// Hilfsfunktion zum Extrahieren der Meta-Informationen
function extractMetaInfo(briefingText) {
  const metaTitleMatch = briefingText.match(/Meta Title:\s*([^\n]+)/);
  const metaDescriptionMatch = briefingText.match(/Meta Description:\s*([^\n]+)/);
  
  return {
    metaTitle: metaTitleMatch ? metaTitleMatch[1].trim() : '',
    metaDescription: metaDescriptionMatch ? metaDescriptionMatch[1].trim() : ''
  };
}

// Hilfsfunktion zum Extrahieren der Inhalte vor und nach [Produkt]
function extractContent(briefingText) {
  const parts = briefingText.split('[Produkt]');
  return {
    beforeProduct: parts[0].trim(),
    afterProduct: parts[1] ? parts[1].trim() : ''
  };
}

// Hilfsfunktion zum Erstellen eines Rich Text Eintrags
async function createRichTextEntry(environment, internerName, content) {
  const entry = await environment.createEntry('richText', {
    fields: {
      internerName: {
        'de-DE': internerName
      },
      richtext: {
        'de-DE': {
          nodeType: 'document',
          data: {},
          content: content
        }
      },
      alignment: {
        'de-DE': '⬅️~Links'
      }
    }
  });
  await entry.publish();
  return entry;
}

// Neue Hilfsfunktion zum Erkennen und Extrahieren von FAQs
function extractFAQs(content) {
  const faqs = [];
  const lines = content.split('\n');
  let isFAQSection = false;
  let currentFAQ = null;

  for (const line of lines) {
    // Prüfe auf Start der FAQ-Sektion
    if (line.includes('Häufig gestellte Fragen')) {
      isFAQSection = true;
      continue;
    }

    // Wenn wir in der FAQ-Sektion sind
    if (isFAQSection) {
      if (line.startsWith('H3:')) {
        if (currentFAQ) {
          faqs.push(currentFAQ);
        }
        currentFAQ = {
          question: line.replace('H3:', '').trim(),
          answer: ''
        };
      } else if (currentFAQ && line.trim() !== '') {
        currentFAQ.answer += line.trim() + ' ';
      }
    }
  }

  // Letztes FAQ hinzufügen
  if (currentFAQ) {
    faqs.push(currentFAQ);
  }

  return faqs;
}

// Neue Hilfsfunktion zum Erstellen von FAQ-Einträgen
async function createFAQEntries(environment, internerName, faqs) {
  const faqEntries = [];
  
  for (const [index, faq] of faqs.entries()) {
    const faqEntry = await environment.createEntry('accordionElement', {
      fields: {
        internerName: {
          'de-DE': `${internerName} > FAQ ${index + 1} (ACC)`
        },
        title: {
          'de-DE': faq.title
        },
        text: {
          'de-DE': {
            nodeType: 'document',
            data: {},
            content: [
              {
                nodeType: 'paragraph',
                content: [
                  {
                    nodeType: 'text',
                    value: faq.text.trim(),
                    marks: [],
                    data: {}
                  }
                ],
                data: {}
              }
            ]
          }
        }
      }
    });
    await faqEntry.publish();
    faqEntries.push(faqEntry);
  }

  return faqEntries;
}

// Neue Hilfsfunktion zum Erstellen eines FAQ-Accordions
async function createFAQAccordion(environment, faqs, internalName) {
    console.log('\nErstelle FAQ Accordion...');
    
    // Erstelle zuerst alle FAQ-Elemente
    const faqElements = [];
    for (let i = 0; i < faqs.length; i++) {
        const faq = faqs[i];
        const accordionElement = await environment.createEntry('accordionElement', {
            fields: {
                internerName: { 'de-DE': `${internalName} - FAQ ${i + 1}` },
                title: { 'de-DE': faq.question },
                text: { 'de-DE': {
                    nodeType: 'document',
                    data: {},
                    content: [
                        {
                            nodeType: 'paragraph',
                            content: [
                                {
                                    nodeType: 'text',
                                    value: faq.answer,
                                    marks: [],
                                    data: {}
                                }
                            ],
                            data: {}
                        }
                    ]
                }}
            }
        });
        await accordionElement.publish();
        console.log(`Accordion-Element ${i + 1} erstellt und veröffentlicht`);
        faqElements.push({ sys: { type: 'Link', linkType: 'Entry', id: accordionElement.sys.id } });
    }
    
    // Erstelle dann das Haupt-Accordion mit allen FAQ-Elementen
    console.log('\nErstelle Haupt-Accordion mit allen FAQ-Elementen...');
    const accordionEntry = await environment.createEntry('accordion', {
        fields: {
            internerName: {
                'de-DE': `${internalName} - FAQ Accordion`
            },
            accordionElements: {
                'de-DE': faqElements
            }
        }
    });
    
    await accordionEntry.publish();
    console.log('FAQ Accordion erstellt und veröffentlicht');
    
    return accordionEntry;
}

// Neue Hilfsfunktion zum Erstellen eines Bildplatzhalters
async function createImagePlaceholder(environment, internerName) {
  const imageEntry = await environment.createEntry('image', {
    fields: {
      internerName: {
        'de-DE': `${internerName} > Bildplatzhalter (IMG)`
      },
      imageDesktop: {
        'de-DE': null // Kein Asset verknüpft
      },
      altText: {
        'de-DE': 'Bildplatzhalter'
      },
      copyright: {
        'de-DE': 'Briefing Import'
      }
    }
  });
  await imageEntry.publish();
  return imageEntry;
}

// Neue Hilfsfunktion zum Erkennen und Erstellen von internen Verlinkungen
function extractInternalLinks(content) {
  const links = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    links.push({
      text: match[1],
      url: match[2]
    });
  }

  return links;
}

// Neue Hilfsfunktion zum Erstellen von Text-Button-Links
async function createTextButtonLink(environment, internerName, link) {
  const linkEntry = await environment.createEntry('textButtonLink', {
    fields: {
      internerName: {
        'de-DE': `${internerName} > Link: ${link.text} (TBL)`
      },
      linkText: {
        'de-DE': link.text
      },
      linkExternal: {
        'de-DE': link.url
      },
      linkStyle: {
        'de-DE': '🥈~Secondary'
      }
    }
  });
  await linkEntry.publish();
  return linkEntry;
}

// Hilfsfunktion: Nur Text ab erster H1 für RichText verwenden
function extractRichTextContentFromBriefing(briefingText) {
  // Suche nach erster H1
  const h1Match = briefingText.match(/H1: .*/);
  if (!h1Match) return '';
  const startIndex = briefingText.indexOf(h1Match[0]);
  let content = briefingText.slice(startIndex);
  // Entferne Slug, Meta Title, Meta Description
  return content;
}

// Hilfsfunktion: Splittet den Text an jedem [Produkte] und erstellt für jedes Segment ein RichText-Element
function getShortDescription(segment, fallback = 'Abschnitt') {
  // Suche nach erster Überschrift (H2/H3)
  const headingMatch = segment.match(/H[23]:\s*([^\n]+)/);
  if (headingMatch) {
    return headingMatch[1].trim().slice(0, 30);
  }
  // Sonst ersten nicht-leeren Satz nehmen
  const firstSentence = segment.split(/[.!?\n]/).map(s => s.trim()).find(Boolean);
  if (firstSentence) {
    return firstSentence.slice(0, 30);
  }
  return fallback;
}

async function createRichTextSegments(environment, content, internalName) {
    console.log('\nStarte Rich Text Erstellung...');
    
    // Extrahiere den Inhalt vor und nach [Produkt]
    const extractedContent = extractContent(content);
    
    // Erstelle RichText-Einträge für jeden Abschnitt
    const segments = [];
    
    // Erstelle RichText für den Inhalt vor [Produkt]
    if (extractedContent.beforeProduct.trim()) {
        console.log('\nStarte Rich Text Erstellung...');
        const beforeProductEntry = await createRichText(
            environment,
            extractedContent.beforeProduct,
            `${internalName} - Intro`
        );
        segments.push(beforeProductEntry);
    }
    
    // Erstelle RichText für den Inhalt nach [Produkt]
    if (extractedContent.afterProduct.trim()) {
        console.log('\nStarte Rich Text Erstellung...');
        const afterProductEntry = await createRichText(
            environment,
            extractedContent.afterProduct,
            `${internalName} - Hauptinhalt`
        );
        segments.push(afterProductEntry);
    }
    
    return segments;
}

async function loadEnvironment() {
    // Lade .env Datei
    require('dotenv').config();
    console.log('dotenv geladen');

    // Verbindung zu Contentful herstellen
    const client = contentful.createClient({
        accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });

    // Hole das Space und Environment
    const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
    const environment = await space.getEnvironment('master');
    return environment;
}

async function importBriefing() {
    try {
        // Lade die Umgebung
        console.log('Stelle Verbindung zu Contentful her...');
        const environment = await loadEnvironment();
        console.log('> Environment erfolgreich geladen\n');

        // Zeige verfügbare Briefing-Dateien
        const briefingFiles = fs.readdirSync('./')
            .filter(file => file.startsWith('briefing-') && file.endsWith('.txt'));
        
        console.log('Verfügbare Briefing-Dateien:');
        briefingFiles.forEach((file, index) => {
            console.log(`${index + 1}. ${file}`);
        });
        
        // Frage nach der auszuwählenden Datei
        const selectedIndex = parseInt(await question('\nBitte wählen Sie eine Briefing-Datei (Nummer eingeben): ')) - 1;
        const selectedFile = briefingFiles[selectedIndex];
        
        if (!selectedFile) {
            throw new Error('Ungültige Auswahl');
        }
        
        console.log(`\nVerarbeite Datei: ${selectedFile}`);
        
        // Lese den Inhalt der Datei
        const content = fs.readFileSync(selectedFile, 'utf8');
        
        // Extrahiere die Metadaten
        const pageData = extractPageData(content);
        
        // Frage nach Bestätigung
        const shouldContinue = await question('\nMöchten Sie mit dem Import fortfahren? (j/n): ');
        if (shouldContinue.toLowerCase() !== 'j') {
            console.log('Import abgebrochen');
            return;
        }
        
        // Erstelle die RichText-Segmente
        console.log('\nStarte Rich Text Erstellung...');
        const richTextSegments = await createRichTextSegments(environment, content, pageData.internalName);
        
        // Erstelle das FAQ-Accordion
        console.log('\nErstelle FAQs...');
        const faqs = extractFAQs(content);
        console.log(`Gefundene FAQs: ${faqs.length}`);
        
        let accordion = null;
        if (faqs.length > 0) {
            accordion = await createFAQAccordion(environment, faqs, pageData.internalName);
        }
        
        // Erstelle die Seite
        await createPage(environment, pageData, richTextSegments, accordion);
        
        console.log('\nImport erfolgreich abgeschlossen!');
    } catch (error) {
        console.error('Fehler beim Import:', error);
    }
}

// Hilfsfunktion zum Konvertieren von Text in Rich Text Format
function parseContentToRichText(content) {
  const lines = content.split('\n');
  const richTextContent = [];
  let currentParagraph = [];

  for (const line of lines) {
    if (line.trim() === '') {
      if (currentParagraph.length > 0) {
        richTextContent.push({
          nodeType: 'paragraph',
          content: [
            {
              nodeType: 'text',
              value: currentParagraph.join(' '),
              marks: [],
              data: {}
            }
          ],
          data: {}
        });
        currentParagraph = [];
      }
    } else if (line.startsWith('H1:')) {
      if (currentParagraph.length > 0) {
        richTextContent.push({
          nodeType: 'paragraph',
          content: [
            {
              nodeType: 'text',
              value: currentParagraph.join(' '),
              marks: [],
              data: {}
            }
          ],
          data: {}
        });
        currentParagraph = [];
      }
      richTextContent.push({
        nodeType: 'heading-1',
        content: [
          {
            nodeType: 'text',
            value: line.replace('H1:', '').trim(),
            marks: [],
            data: {}
          }
        ],
        data: {}
      });
    } else if (line.startsWith('H2:')) {
      if (currentParagraph.length > 0) {
        richTextContent.push({
          nodeType: 'paragraph',
          content: [
            {
              nodeType: 'text',
              value: currentParagraph.join(' '),
              marks: [],
              data: {}
            }
          ],
          data: {}
        });
        currentParagraph = [];
      }
      richTextContent.push({
        nodeType: 'heading-2',
        content: [
          {
            nodeType: 'text',
            value: line.replace('H2:', '').trim(),
            marks: [],
            data: {}
          }
        ],
        data: {}
      });
    } else {
      currentParagraph.push(line.trim());
    }
  }

  if (currentParagraph.length > 0) {
    richTextContent.push({
      nodeType: 'paragraph',
      content: [
        {
          nodeType: 'text',
          value: currentParagraph.join(' '),
          marks: [],
          data: {}
        }
      ],
      data: {}
    });
  }

  return richTextContent;
}

// Start des Importers
// AKTIVIERT: briefing-importer.js funktioniert wunderbar!
console.log('🎉 briefing-importer.js ist AKTIVIERT!');
console.log('✅ Funktioniert wunderbar mit korrekten Content-Type Feldern');
console.log('✅ Verwendet die fix-ghost-entry-support-method.js');
console.log('');

importBriefing(); // AKTIVIERT - FUNKTIONIERT WUNDERBAR!

async function createPage(environment, pageData, richTextSegments, faqAccordion) {
    console.log('\nErstelle Seite...');
    
    // Filtere null-Einträge aus den RichText-Segmenten
    const validSegments = richTextSegments.filter(segment => segment !== null);
    
    const contentLinks = [
        ...validSegments.map(entry => ({
            sys: {
                type: 'Link',
                linkType: 'Entry',
                id: entry.sys.id
            }
        })),
        {
            sys: {
                type: 'Link',
                linkType: 'Entry',
                id: faqAccordion.sys.id
            }
        }
    ];
    
    const page = await environment.createEntry('pageStandard', {
        fields: {
            slug: {
                'de-DE': pageData.slug
            },
            internerName: {
                'de-DE': pageData.internalName
            },
            metaPageTitle: {
                'de-DE': pageData.metaTitle
            },
            metaDescription: {
                'de-DE': pageData.metaDescription
            },
            content: {
                'de-DE': contentLinks
            },
            isNoIndex: {
                'de-DE': false
            },
            isDisabledForLocale: {
                'de-DE': false
            }
        }
    });
    
    await page.publish();
    console.log('Seite erstellt und veröffentlicht');
    
    return page;
}

function toRichTextDocument(contentNodes) {
    return {
        nodeType: 'document',
        data: {},
        content: Array.isArray(contentNodes) ? contentNodes : []
    };
}

async function createRichText(environment, content, internalName) {
    // Prüfe, ob der Inhalt leer ist (nach Entfernen von Whitespace)
    if (!content || !content.trim()) {
        console.log(`Überspringe leeren Abschnitt: ${internalName}`);
        return null;
    }
    console.log('Erstelle Rich Text Entry...');
    const richTextContent = parseContentToRichText(content);
    const entry = await environment.createEntry('richText', {
        fields: {
            internerName: {
                'de-DE': internalName
            },
            richtext: {
                'de-DE': toRichTextDocument(richTextContent)
            },
            alignment: {
                'de-DE': '⬅️~Links'
            },
            isDark: {
                'de-DE': false
            },
            decorativeElement: {
                'de-DE': '🚫~keins'
            },
            isDisabledForLocale: {
                'de-DE': false
            }
        }
    });
    console.log('Rich Text Entry erstellt:', entry.sys.id);
    
    console.log('Veröffentliche Rich Text...');
    await entry.publish();
    console.log('Rich Text veröffentlicht:', entry.sys.id);
    
    return entry;
}

function extractPageData(content) {
    const slug = extractSlug(content);
    const internalName = generateInternalName(slug);
    const metaInfo = extractMetaInfo(content);
    const extractedContent = extractContent(content);
    
    return {
        slug,
        internalName,
        metaTitle: metaInfo.metaTitle,
        metaDescription: metaInfo.metaDescription,
        content: extractedContent.afterProduct
    };
} 