const express = require('express');
const axios = require('axios');
const stringSimilarity = require('string-similarity');
const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(express.json());

// Expanded translation function (unchanged)
function translateToPersian(text) {
  const translations = {
    'Low Dose Aspirin Enteric Safety-Coated': 'آسپیرین با دوز کم پوشش دار',
    'Pain reliever': 'مسکن درد',
    'Uses for the temporary relief of minor aches and pains': 'برای تسکین موقت دردهای جزئی استفاده می شود',
    'Warnings': 'هشدارها',
    'Directions': 'دستورالعمل ها',
    'Other information': 'اطلاعات دیگر',
    'Inactive ingredients': 'مواد غیر فعال',
    'Active ingredient': 'ماده فعال',
    'Purpose': 'هدف',
    'Uses': 'موارد استفاده',
    'Storage and handling': 'نگهداری و استفاده',
  };
  return translations[text] || text;
}

// In-memory cache for drug names
let drugNamesCache = [];

// Function to fetch and cache drug names
async function fetchAndCacheDrugNames() {
  try {
    const response = await axios.get('https://api.fda.gov/drug/label.json?count=openfda.brand_name.exact&limit=1000');
    drugNamesCache = response.data.results.map(result => result.term);
    console.log(`Cached ${drugNamesCache.length} drug names`);
  } catch (error) {
    console.error('Error fetching drug names:', error);
  }
}

// Fetch drug names on server start
fetchAndCacheDrugNames();

app.get('/', (req, res) => {
  res.render('index', { drugInfo: null, suggestions: [] });
});

app.get('/suggest', (req, res) => {
  const query = req.query.q.toLowerCase();
  const matches = stringSimilarity.findBestMatch(query, drugNamesCache);
  const suggestions = matches.ratings
    .filter(match => match.rating > 0.3)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5)
    .map(match => match.target);
  res.json(suggestions);
});

app.post('/search', async (req, res) => {
  let drugName = req.body.drugName;
  
  // Find the best match if the exact drug name is not found
  const bestMatch = stringSimilarity.findBestMatch(drugName, drugNamesCache);
  if (bestMatch.bestMatch.rating > 0.7) {
    drugName = bestMatch.bestMatch.target;
  }

  try {
    const response = await axios.get(`https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${drugName}"&limit=1`);
    
    if (response.data.results && response.data.results.length > 0) {
      const result = response.data.results[0];
      const drugInfo = {
        name: translateToPersian(result.openfda.brand_name ? result.openfda.brand_name[0] : drugName),
        sections: [
          { title: translateToPersian('Active ingredient'), content: result.active_ingredient ? result.active_ingredient[0] : 'Not available' },
          { title: translateToPersian('Purpose'), content: result.purpose ? result.purpose[0] : 'Not available' },
          { title: translateToPersian('Uses'), content: result.indications_and_usage ? result.indications_and_usage[0] : 'Not available' },
          { title: translateToPersian('Warnings'), content: result.warnings ? result.warnings[0] : 'Not available' },
          { title: translateToPersian('Directions'), content: result.dosage_and_administration ? result.dosage_and_administration[0] : 'Not available' },
          { title: translateToPersian('Other information'), content: result.storage_and_handling ? result.storage_and_handling[0] : 'Not available' },
          { title: translateToPersian('Inactive ingredients'), content: result.inactive_ingredient ? result.inactive_ingredient[0] : 'Not available' },
        ]
      };
      res.render('index', { drugInfo, suggestions: [], correctedName: drugName !== req.body.drugName ? drugName : null });
    } else {
      res.render('index', { drugInfo: { error: 'اطلاعات دارو یافت نشد' }, suggestions: [], correctedName: null });
    }
  } catch (error) {
    console.error('Error:', error);
    res.render('index', { drugInfo: { error: 'خطا در دریافت اطلاعات دارو' }, suggestions: [], correctedName: null });
  }
});

app.post('/translate', async (req, res) => {
  const { text, targetLang } = req.body;
  try {
    // Here, you would typically use a translation service.
    // For demonstration, we're just appending "[Translated]" to the text.
    const translatedText = text.split('\n').map(line => line + ' [Translated to ' + targetLang + ']').join('\n');
    res.json({ translatedText });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: 'Translation failed' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});