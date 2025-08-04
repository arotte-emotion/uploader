require('dotenv').config();
const contentful = require('contentful-management');

const client = contentful.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
});

async function inspectRichText() {
  try {
    const space = await client.getSpace('is4lb5trkwgp');
    const environment = await space.getEnvironment('master');
    
    // Get the richText content type
    const contentType = await environment.getContentType('richText');
    
    console.log('Content Type ID:', contentType.sys.id);
    console.log('Content Type Name:', contentType.name);
    console.log('\nAvailable Fields:');
    
    contentType.fields.forEach(field => {
      console.log(`- ${field.id} (${field.type})`);
      if (field.localized) {
        console.log(`  Localized: Yes`);
      }
      if (field.required) {
        console.log(`  Required: Yes`);
      }
    });
    
  } catch (error) {
    console.error('Error inspecting rich text content type:', error);
  }
}

inspectRichText(); 