require('dotenv').config();
const contentful = require('contentful-management');

const client = contentful.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
});

async function createKalkhoffPage() {
  try {
    const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
    const environment = await space.getEnvironment('master');

    // 1. Create Rich Text for Introduction
    const introRichText = await environment.createEntry('richText', {
      fields: {
        internalName: {
          'de-DE': 'Marken > Kalkhoff > Trekking e-Bike > Einleitung (RT)'
        },
        richtext: {
          'de-DE': {
            nodeType: 'document',
            data: {},
            content: [
              {
                nodeType: 'heading-1',
                content: [
                  {
                    nodeType: 'text',
                    value: 'Kalkhoff Trekking e-Bike',
                    marks: [],
                    data: {}
                  }
                ],
                data: {}
              },
              {
                nodeType: 'paragraph',
                content: [
                  {
                    nodeType: 'text',
                    value: 'Du suchst ein e-Bike, das dich im Alltag, auf ausgedehnten Touren und auf unbefestigten Wegen zuverlässig begleitet? Dann bist du bei unseren Kalkhoff Trekking e-Bikes genau richtig! Diese Alleskönner vereinen Komfort, Robustheit und moderne Technologie, um dir ein unvergleichliches Fahrerlebnis zu bieten. Egal, ob du zur Arbeit pendelst, am Wochenende die Natur erkundest oder eine lange Reise planst – mit einem Kalkhoff Trekking e-Bike von e-motion bist du bestens ausgestattet. Entdecke jetzt die vielfältigen Modelle und finde dein perfektes e-Bike für grenzenlose Freiheit und Fahrspaß!',
                    marks: [],
                    data: {}
                  }
                ],
                data: {}
              }
            ]
          }
        },
        alignment: {
          'de-DE': '⬅️~Links'
        }
      }
    });
    await introRichText.publish();

    // 2. Create Rich Text for Main Content
    const mainContentRichText = await environment.createEntry('richText', {
      fields: {
        internalName: {
          'de-DE': 'Marken > Kalkhoff > Trekking e-Bike > Hauptinhalt (RT)'
        },
        richtext: {
          'de-DE': {
            nodeType: 'document',
            data: {},
            content: [
              {
                nodeType: 'heading-2',
                content: [
                  {
                    nodeType: 'text',
                    value: 'Kalkhoff Trekking e-Bike: Mehr als nur ein e-Bike',
                    marks: [],
                    data: {}
                  }
                ],
                data: {}
              },
              {
                nodeType: 'paragraph',
                content: [
                  {
                    nodeType: 'text',
                    value: 'Ein Kalkhoff Trekking e-Bike ist mehr als nur ein Fortbewegungsmittel – es ist ein Statement für aktive Mobilität und umweltbewusstes Handeln. Die durchdachte Konstruktion und die hochwertigen Komponenten sorgen für ein harmonisches Fahrgefühl, egal ob du in der Stadt unterwegs bist oder abseits befestigter Straßen neue Wege erkundest. Die leistungsstarken Motoren und langlebigen Akkus unterstützen dich dabei, mühelos auch längere Strecken und anspruchsvolle Anstiege zu meistern. So wird jede Fahrt zum Genuss!',
                    marks: [],
                    data: {}
                  }
                ],
                data: {}
              },
              {
                nodeType: 'heading-2',
                content: [
                  {
                    nodeType: 'text',
                    value: 'Finde dein perfektes Kalkhoff Trekking e-Bike bei e-motion',
                    marks: [],
                    data: {}
                  }
                ],
                data: {}
              },
              {
                nodeType: 'paragraph',
                content: [
                  {
                    nodeType: 'text',
                    value: 'Die Vielseitigkeit der Kalkhoff Trekking e-Bikes zeigt sich in den unterschiedlichen Modellen, die auf verschiedene Bedürfnisse zugeschnitten sind. Vom sportlichen Allrounder bis zum komfortablen Tourenbegleiter findest du bei uns garantiert das passende e-Bike. Dabei legen wir bei e-motion größten Wert auf Qualität und eine umfassende Beratung. Wir möchten sicherstellen, dass du das e-Bike erhältst, das perfekt zu dir und deinen Anforderungen passt.',
                    marks: [],
                    data: {}
                  }
                ],
                data: {}
              },
              {
                nodeType: 'heading-2',
                content: [
                  {
                    nodeType: 'text',
                    value: 'Innovation und Design vereint: Dein Kalkhoff Trekking e-Bike',
                    marks: [],
                    data: {}
                  }
                ],
                data: {}
              },
              {
                nodeType: 'paragraph',
                content: [
                  {
                    nodeType: 'text',
                    value: 'Entdecke die innovative Technologie und das stilvolle Design der Kalkhoff Trekking e-Bikes. Intelligente Features wie integrierte Beleuchtungssysteme, robuste Gepäckträger und zuverlässige Bremsen machen diese e-Bikes zu idealen Begleitern für jeden Tag und jedes Abenteuer. Wir haben das passende Zubehör für dein Kalkhoff Trekking e-Bike. Überzeuge dich selbst von der Qualität und dem Fahrkomfort und erlebe eine neue Dimension der Mobilität!',
                    marks: [],
                    data: {}
                  }
                ],
                data: {}
              }
            ]
          }
        },
        alignment: {
          'de-DE': '⬅️~Links'
        }
      }
    });
    await mainContentRichText.publish();

    // 3. Create FAQ Accordion
    const faqAccordion = await environment.createEntry('accordion', {
      fields: {
        internalName: {
          'de-DE': 'Marken > Kalkhoff > Trekking e-Bike > FAQ (ACC)'
        },
        richtext: {
          'de-DE': {
            nodeType: 'document',
            data: {},
            content: [
              {
                nodeType: 'heading-2',
                content: [
                  {
                    nodeType: 'text',
                    value: 'Häufig gestellte Fragen zu Kalkhoff Trekking e-Bikes',
                    marks: [],
                    data: {}
                  }
                ],
                data: {}
              }
            ]
          }
        },
        accordionElements: {
          'de-DE': [
            {
              sys: {
                type: 'Link',
                linkType: 'Entry',
                id: 'faq1' // This will be replaced with actual FAQ entries
              }
            }
          ]
        }
      }
    });
    await faqAccordion.publish();

    // 4. Create the main page
    const page = await environment.createEntry('pageStandard', {
      fields: {
        internalName: {
          'de-DE': 'Marken > Kalkhoff > Trekking e-Bike'
        },
        slug: {
          'de-DE': 'marken/kalkhoff/trekking-e-bike'
        },
        metaPageTitle: {
          'de-DE': 'Kalkhoff Trekking e-Bike: Komfort & Qualität online kaufen'
        },
        metaDescription: {
          'de-DE': 'Erlebe die Freiheit auf zwei Rädern mit einem Kalkhoff e-Trekkingbike. Maximale Reichweite, intuitive Bedienung und stilvolles Design erwarten dich.'
        },
        content: {
          'de-DE': [
            {
              sys: {
                type: 'Link',
                linkType: 'Entry',
                id: introRichText.sys.id
              }
            },
            // Platzhalter für [Produkt]
            {
              sys: {
                type: 'Link',
                linkType: 'Entry',
                id: mainContentRichText.sys.id
              }
            },
            {
              sys: {
                type: 'Link',
                linkType: 'Entry',
                id: faqAccordion.sys.id
              }
            }
          ]
        }
      }
    });

    await page.publish();
    console.log('Page and all components created successfully!');
  } catch (error) {
    console.error('Error creating page:', error);
  }
}

createKalkhoffPage(); 