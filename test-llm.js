require('dotenv').config({ path: '.env.local' });
const { llmInferRelationships } = require('./src/lib/engines/extraction');

async function test() {
  const entities = [
    { entity_type: 'ioc_ip', value: '1.2.3.4', normalized: '1.2.3.4' },
    { entity_type: 'ioc_domain', value: 'evil.com', normalized: 'evil.com' },
    { entity_type: 'malware', value: 'Mirai', normalized: 'Mirai' }
  ];
  const text = 'The Mirai botnet connects to the C2 server at 1.2.3.4, which resolves to evil.com.';
  
  const rels = await llmInferRelationships(entities, text, {
    // Need a user key or it'll use the default setup if any
  });
  console.log(rels);
}

test().catch(console.error);
