require('dotenv').config();
const contentful = require('contentful-management');

const client = contentful.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
});

const faqItems = [
  {
    title: 'Was zeichnet ein Kalkhoff e-Bike aus unserem Online Shop aus?',
    text: 'Kalkhoff e-Bikes aus unserem Online Shop vereinen Komfort, Vielseitigkeit und Zuverlässigkeit. Als e-Trekkingbikes und Citybikes sind sie sowohl für den Alltag als auch für längere Touren konzipiert und bieten eine hochwertige Ausstattung. Viele Modelle sind made in germany, was für eine hohe Qualität bürgt.'
  },
  {
    title: 'Für wen sind e-Bikes von Kalkhoff geeignet?',
    text: 'Die e-Bikes von Kalkhoff sind ideal für alle, die zuverlässige Fahrräder für unterschiedliche Einsatzzwecke suchen – Pendler in der City, Tourenfahrer und Freizeitradler gleichermaßen. Die breite Palette umfasst sowohl Damen e-Bikes als auch Herren e-Bikes in verschiedenen Rahmenhöhen.'
  },
  {
    title: 'Welche Motorisierungen verwendet der Hersteller Kalkhoff bei seinen e-Trekkingbikes?',
    text: 'Der Hersteller Kalkhoff setzt bei seinen e-Trekkingbikes häufig auf hochwertige Antriebe wie die Bosch Performance Line, die eine optimale und kraftvolle Unterstützung in jedem Terrain bietet. Auch andere leistungsstarke Systeme von Bosch kommen zum Einsatz. Das Drehmoment der Motoren sorgt für ein angenehmes Fahrgefühl.'
  },
  {
    title: 'Wie groß ist die Reichweite eines Kalkhoff e-Bikes und welche Technik steckt dahinter?',
    text: 'Die Reichweite eines Kalkhoff e-Bikes hängt von verschiedenen Faktoren wie dem Akku, dem gewählten Unterstützungsmodus und der gefahrenen Strecke ab. Die moderne Technik und die leistungsstarken Akkus ermöglichen aber in der Regel gute Reichweiten. Informationen zur genauen Technik und Akkukapazität findest du bei den jeweiligen Modellen, wie zum Beispiel dem Kalkhoff Entice Advance.'
  },
  {
    title: 'Bieten Kalkhoff e-Bikes eine gute Ausstattung und welche Bremsen kommen zum Einsatz?',
    text: 'Ja, Kalkhoff e-Bikes bieten eine durchdachte Ausstattung, oft inklusive integrierter Beleuchtung und robusten Gepäckträgern. Bei den Bremsen kommen häufig zuverlässige Scheibenbremsen zum Einsatz, die für eine hohe Sicherheit sorgen. Einige Modelle verfügen auch über eine Nabenschaltung oder einen wartungsarmen Riemenantrieb.'
  },
  {
    title: 'Was bedeutet die Angabe UVP bei Kalkhoff Fahrrädern?',
    text: 'Die UVP ist die unverbindliche Preisempfehlung des Herstellers für die Fahrräder von Kalkhoff. Bei uns findest du aber möglicherweise auch attraktive Angebote.'
  },
  {
    title: 'Wo finde ich Informationen zur Geschichte und zum Unternehmen Kalkhoff?',
    text: 'Informationen zur Geschichte und zum Unternehmen Kalkhoff, einer der traditionsreichen Fahrradmarken made in germany, findest du auf unserer "Über uns"-Seite oder direkt auf der Webseite des Herstellers.'
  },
  {
    title: 'Welche Kategorien von Kalkhoff e-Bikes gibt es und was ist mit dem Gewicht?',
    text: 'Neben den e-Trekkingbikes bieten wir auch Citybikes und weitere Kategorien von Kalkhoff e-Bikes an. Das genaue Gewicht variiert je nach Modell und Ausstattung.'
  },
  {
    title: 'Gibt es Kalkhoff e-Bikes mit Rücktrittbremse und welche Farbe ist verfügbar?',
    text: 'Einige Kalkhoff Citybikes sind auch mit einer Rücktrittbremse erhältlich. Die verfügbare Farbe kannst du der jeweiligen Produktseite entnehmen.'
  },
  {
    title: 'Wo finde ich einen Vergleich von verschiedenen Kalkhoff e-Bike Modellen?',
    text: 'Auf unserer Webseite kannst du die Details und die Ausstattung verschiedener Kalkhoff e-Bike Modelle vergleichen, um das passende Rad für deine Bedürfnisse zu finden. Achte dabei auf Marke, Rahmenhöhe, Gänge und den Elektroantrieb.'
  }
];

async function createFaqElements() {
  try {
    const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
    const environment = await space.getEnvironment('master');

    const faqEntries = [];

    for (const [index, faq] of faqItems.entries()) {
      const faqEntry = await environment.createEntry('accordionElement', {
        fields: {
          internalName: {
            'de-DE': `Marken > Kalkhoff > Trekking e-Bike > FAQ ${index + 1} (ACC)`
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
                      value: faq.text,
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
      console.log(`Created FAQ entry ${index + 1}`);
    }

    console.log('All FAQ elements created successfully!');
    return faqEntries;
  } catch (error) {
    console.error('Error creating FAQ elements:', error);
  }
}

createFaqElements(); 