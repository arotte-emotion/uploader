require('dotenv').config();
const contentful = require('contentful-management');

const client = contentful.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
});

async function listContentTypes() {
  try {
    const space = await client.getSpace('is4lb5trkwgp');
    const environment = await space.getEnvironment('master');
    
    const contentTypes = await environment.getContentTypes();
    
    console.log('Available Content Types:');
    console.log('=======================');
    
    for (const contentType of contentTypes.items) {
      console.log(`\n- ${contentType.sys.id}: ${contentType.name}`);
      contentType.fields.forEach(field => {
        console.log(`    - ${field.id} (${field.type})${field.required ? ' [required]' : ''}${field.localized ? ' [localized]' : ''}`);
      });
    }
    
  } catch (error) {
    console.error('Error listing content types:', error);
  }
}

listContentTypes(); 