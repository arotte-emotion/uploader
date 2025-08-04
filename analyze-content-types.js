require('dotenv').config();
const contentful = require('contentful-management');

const client = contentful.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
});

async function analyzeContentTypes() {
  try {
    const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
    const environment = await space.getEnvironment('master');
    
    // Get all content types
    const contentTypes = await environment.getContentTypes();
    
    console.log('\nVerfügbare Content Types:');
    console.log('------------------------');
    
    contentTypes.items.forEach(contentType => {
      console.log(`\nContent Type: ${contentType.name} (${contentType.sys.id})`);
      console.log('Felder:');
      
      contentType.fields.forEach(field => {
        console.log(`- ${field.name} (${field.id}):`);
        console.log(`  Typ: ${field.type}`);
        if (field.type === 'Array') {
          console.log(`  Array Items Typ: ${field.items.type}`);
        }
        if (field.validations && field.validations.length > 0) {
          console.log(`  Validierungen: ${JSON.stringify(field.validations)}`);
        }
        if (field.localized) {
          console.log('  Lokalisiert: Ja');
        }
      });
    });
  } catch (error) {
    console.error('Fehler bei der Analyse:', error);
  }
}

analyzeContentTypes(); 