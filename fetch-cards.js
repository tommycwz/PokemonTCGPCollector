const https = require('https');
const fs = require('fs');
const path = require('path');

// URLs to fetch the data
const DATA_SOURCES = {
  cards: 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/cards.json',
  sets: 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/sets.json',
  rarity: 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/rarity.json'
};

// Target directory
const ASSETS_DIR = path.join(__dirname, 'src', 'assets', 'cards');

console.log('🃏 Pokemon TCG Pocket - Data Fetcher');
console.log('===================================');

// Ensure the cards directory exists
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  console.log('✅ Created directory:', ASSETS_DIR);
}

// Function to fetch and save a single file
function fetchAndSave(name, url) {
  return new Promise((resolve, reject) => {
    const targetFile = path.join(ASSETS_DIR, `${name}.json`);
    
    console.log(`📡 Fetching ${name} data from: ${url}`);
    console.log(`💾 Saving to: ${targetFile}`);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to fetch ${name}. Status code: ${response.statusCode}`));
        return;
      }

      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          // Parse to validate JSON
          const jsonData = JSON.parse(data);
          
          // Write to file with pretty formatting
          fs.writeFileSync(targetFile, JSON.stringify(jsonData, null, 2));
          
          console.log(`✅ Successfully downloaded and saved ${name} data!`);
          resolve({ name, data: jsonData, count: Array.isArray(jsonData) ? jsonData.length : Object.keys(jsonData).length });
          
        } catch (error) {
          reject(new Error(`Failed to parse JSON data for ${name}: ${error.message}`));
        }
      });

    }).on('error', (error) => {
      reject(new Error(`Error fetching ${name}: ${error.message}`));
    });
  });
}

// Fetch all data files
async function fetchAllData() {
  try {
    console.log('🚀 Starting download of all data files...\n');
    
    const results = await Promise.all([
      fetchAndSave('cards', DATA_SOURCES.cards),
      fetchAndSave('sets', DATA_SOURCES.sets),
      fetchAndSave('rarity', DATA_SOURCES.rarity)
    ]);

    console.log('\n🎉 All files downloaded successfully!');
    console.log('=====================================');
    
    results.forEach(result => {
      console.log(`📊 ${result.name}: ${result.count} items`);
    });

    // Show detailed statistics for cards
    const cardsResult = results.find(r => r.name === 'cards');
    if (cardsResult) {
      const cards = cardsResult.data;
      const sets = new Set(cards.map(card => card.set));
      const rarities = new Set(cards.map(card => card.rarity));
      const packs = new Set(cards.flatMap(card => card.packs));
      
      console.log('\n📈 Card Statistics:');
      console.log(`📦 Unique sets: ${sets.size} (${Array.from(sets).join(', ')})`);
      console.log(`⭐ Unique rarities: ${rarities.size} (${Array.from(rarities).join(', ')})`);
      console.log(`🎁 Unique packs: ${packs.size} (${Array.from(packs).join(', ')})`);
    }

    console.log('\n🚀 Ready to use! You can now run your Angular app.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the fetch process
fetchAllData();