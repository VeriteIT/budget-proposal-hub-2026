/* ==========
   CONFIG
========== */
// Google Sheets CSV URL (optimized for performance)
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQSiKbXXxmMo6FeEUAZgctDszdcPU8_mJirI1nattJIbz9soLDDajyLHJmRJjGqmAR67g2uY-rqAfJy/pub?output=csv&t=" + Date.now();

// Where local assets live (use filenames in the Sheet; full URLs still work)
const PDF_BASE_PATH   = "assets/pdfs/";
const THUMB_BASE_PATH = "assets/thumbs/";

// Semantic Search API Configuration
const SEMANTIC_SEARCH_API_URL = "https://danulr05-budget-proposals-search-api.hf.space/api";
const USE_SEMANTIC_SEARCH = true; // Toggle between semantic search and demo data

/* ==========
   DATA + STATE
========== */
let DATA = [];
let VOTES = {}; // Store vote counts for each proposal
let SEARCH_DEBOUNCE_TIMER = null;
let CURRENT_LANGUAGE = 'en'; // Current selected language
const $ = s => document.querySelector(s);

/* ==========
   Helpers
========== */
function joinPath(base, file){
  if (!base) return file;
  const b = base.endsWith("/") ? base : base + "/";
  return b + encodeURIComponent(file);
}
function resolveUrl(value, base){
  const v = (value || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;      // already a URL
  return joinPath(base, v);                    // treat as filename
}
function formatLKR(n){
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-LK", { style:"currency", currency:"LKR", maximumFractionDigits:0 }).format(n);
}
function formatNumber(n){
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}
function uniques(arr){
  return [...new Set(arr.filter(Boolean))].sort((a,b)=>(''+a).localeCompare(''+b));
}

/* ==========
   Language Management
========== */
function setLanguage(language) {
  CURRENT_LANGUAGE = language;
  localStorage.setItem('selectedLanguage', language);
  
  // Update language selectors
  const languageSelect = document.getElementById('languageSelect');
  const mobileLanguageSelect = document.getElementById('mobileLanguageSelect');
  
  if (languageSelect) languageSelect.value = language;
  if (mobileLanguageSelect) mobileLanguageSelect.value = language;
  
  // Redirect to the appropriate language directory
  const currentPath = window.location.pathname;
  // Extract the base path (everything before the language directory)
  const pathParts = currentPath.split('/');
  const languageIndex = pathParts.findIndex(part => ['en', 'si', 'ta'].includes(part));
  
  if (languageIndex !== -1) {
    // Replace the current language with the new one
    pathParts[languageIndex] = language;
    const newPath = pathParts.join('/');
    
    // Only redirect if we're not already in the correct language directory
    if (!currentPath.includes('/' + language + '/')) {
      window.location.href = newPath;
    } else {
      // If already in correct directory, just reload data
      loadDataForCurrentLanguage();
    }
  } else {
    // Fallback: just reload data
    loadDataForCurrentLanguage();
  }
}

function getLanguageFromSelectors() {
  const languageSelect = document.getElementById('languageSelect');
  const mobileLanguageSelect = document.getElementById('mobileLanguageSelect');
  
  if (languageSelect && languageSelect.value) {
    return languageSelect.value;
  }
  if (mobileLanguageSelect && mobileLanguageSelect.value) {
    return mobileLanguageSelect.value;
  }
  return 'en'; // Default to English
}

function loadDataForCurrentLanguage() {
  // Update current language from selectors
  CURRENT_LANGUAGE = getLanguageFromSelectors();
  
  // Reload data and reapply filters
  showLoading();
  loadFromSheet().then(() => {
    hideLoading();
    apply();
  });
}

/* ==========
   Loading Functions
========== */
function showLoading() {
  document.getElementById('loading').style.display = 'flex';
  document.getElementById('results').style.display = 'none';
  document.getElementById('empty').style.display = 'none';
}

function hideLoading() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('results').style.display = 'grid';
}

/* ==========
   CSV Data Functions (Optimized)
========== */

function parseCSV(csvText) {
  // Proper RFC 4180 CSV parser that handles quoted fields with commas
  const lines = [];
  let currentLine = '';
  let inQuotes = false;
  
  // Split by lines while respecting quotes
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];
    
    if (char === '"') {
      // Add the quote to the line
      currentLine += char;
      
      if (inQuotes && nextChar === '"') {
        // Escaped quote - add both quotes
        currentLine += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      // End of line (outside quotes)
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
      // Skip \r\n pairs
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
    } else {
      currentLine += char;
    }
  }
  
  // Add last line
  if (currentLine.trim()) {
    lines.push(currentLine);
  }
  
  if (lines.length < 2) return [];
  
  // Parse each line into fields (RFC 4180 compliant CSV parser)
  const parseCSVLine = (line) => {
    const fields = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
      const char = line[i];
      
      if (char === '"' && !inQuotes) {
        // Start of quoted field
        inQuotes = true;
        i++;
      } else if (char === '"' && inQuotes) {
        // Check if it's an escaped quote or end of quoted field
        if (line[i + 1] === '"') {
          // Escaped quote - add one quote to the field
          currentField += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator (outside quotes)
        fields.push(currentField);
        currentField = '';
        i++;
      } else {
        // Regular character
        currentField += char;
        i++;
      }
    }
    
    // Add last field
    fields.push(currentField);
    return fields.map(f => f.trim());
  };
  
  // Get headers
  const headers = parseCSVLine(lines[0]);
  
  // Parse data rows
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    // Create row object
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    // Only add rows that have at least one non-empty value
    const hasData = Object.values(row).some(val => val && val.trim() !== '');
    if (hasData) {
    data.push(row);
    }
  }
  
  return data;
}

/* ==========
   Semantic Search Functions
========== */
async function performSemanticSearch(query, categoryFilter = null) {
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const searchData = {
        query: query,
        top_k: 20,
        category_filter: categoryFilter,
        language: CURRENT_LANGUAGE
      };

      const response = await fetch(`${SEMANTIC_SEARCH_API_URL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const proposals = result.results || [];
      
      // Return proposals as-is (vote data will come from Google Sheets)
      return proposals;
    } catch (error) {
      console.log(`Semantic search attempt ${attempt + 1} failed:`, error.message);
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('Semantic search failed after all retries:', error);
        return [];
      }
    }
  }
}

async function mergeVoteDataWithAPIResults(apiResults) {
  try {
    // Load CSV data to get vote information
    const csv = await fetchCSV(SHEET_CSV_URL);
    const sheetData = csvToObjects(csv);
    
    console.log('Sheet data for vote merging:', sheetData);
    
    // Create a map of title -> vote data for quick lookup
    // Map all language versions of titles to the same vote data
    const voteDataMap = {};
    sheetData.forEach(row => {
      const voteData = {
        voteFormUrl: (row['VoteForm - Eng'] || '').trim(),
        voteTally: (row['VoteTally - Eng'] || '').trim(),
        categoryColour: (row['Category Colour'] || '').trim()
      };
      
      // Map all language versions of the title to the same vote data
      const titles = [
        (row.Title_Eng || '').trim(),
        (row.Title_Sin || '').trim(),
        (row.Title_Tam || '').trim()
      ].filter(title => title);
      
      titles.forEach(title => {
        if (title) {
          voteDataMap[title.toLowerCase()] = voteData;
          console.log(`Mapped title: "${title}" -> voteTally: "${voteData.voteTally}"`);
        }
      });
    });
    
    // Create dynamic mapping based on content similarity
    const createDynamicMapping = (apiTitle, sheetTitles) => {
      const apiWords = apiTitle.toLowerCase().split(' ').filter(word => word.length > 2);
      const bestMatches = [];
      
      sheetTitles.forEach(sheetTitle => {
        const sheetWords = sheetTitle.toLowerCase().split(' ').filter(word => word.length > 2);
        const commonWords = apiWords.filter(word => sheetWords.includes(word));
        const similarity = commonWords.length / Math.max(apiWords.length, sheetWords.length);
        
        if (similarity > 0.3) { // 30% word overlap threshold
          bestMatches.push({ title: sheetTitle, similarity, commonWords });
        }
      });
      
      // Sort by similarity and return the best match
      bestMatches.sort((a, b) => b.similarity - a.similarity);
      return bestMatches.length > 0 ? bestMatches[0] : null;
    };
    
    // Merge vote data with API results using dynamic mapping
    return apiResults.map(proposal => {
      const title = (proposal.title || '').trim();
      let voteData = voteDataMap[title.toLowerCase()] || {};
      
      // If exact match not found, try dynamic mapping
      if (!voteData.voteTally) {
        const sheetTitles = Object.keys(voteDataMap);
        const bestMatch = createDynamicMapping(title, sheetTitles);
        
        if (bestMatch) {
          console.log(`Dynamic match found: "${title}" matches "${bestMatch.title}" (similarity: ${bestMatch.similarity.toFixed(2)}, common words: ${bestMatch.commonWords.join(', ')})`);
          voteData = voteDataMap[bestMatch.title];
        }
      }
      
      console.log(`Looking for title: "${title}" -> found voteTally: "${voteData.voteTally}"`);
      
      return {
        ...proposal,
        voteFormUrl: voteData.voteFormUrl || '',
        voteTally: voteData.voteTally || '',
        categoryColour: voteData.categoryColour || ''
      };
    });
  } catch (error) {
    console.error('Error merging vote data:', error);
    return apiResults;
  }
}

async function loadCategoriesFromAPI() {
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(`${SEMANTIC_SEARCH_API_URL}/categories`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      return result.categories || [];
    } catch (error) {
      console.log(`Categories API attempt ${attempt + 1} failed:`, error.message);
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('Categories API failed after all retries:', error);
        return [];
      }
    }
  }
}

async function loadAllProposalsFromAPI(categoryFilter = null) {
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const url = categoryFilter 
        ? `${SEMANTIC_SEARCH_API_URL}/proposals?category_filter=${encodeURIComponent(categoryFilter)}&language=${CURRENT_LANGUAGE}`
        : `${SEMANTIC_SEARCH_API_URL}/proposals?language=${CURRENT_LANGUAGE}`;
      
      console.log(`[API] Loading all proposals from: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      const proposals = result.results || [];
      
      console.log(`[API] Loaded ${proposals.length} proposals for language: ${CURRENT_LANGUAGE}`);
      
      // Return proposals as-is (vote data will come from Google Sheets)
      return proposals;
    } catch (error) {
      console.log(`Proposals API attempt ${attempt + 1} failed:`, error.message);
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('Proposals API failed after all retries:', error);
        return [];
      }
    }
  }
}

/* ==========
   Shuffling Functions
========== */
function shuffleProposals(proposals) {
  // Create a copy to avoid mutating the original array
  const shuffled = [...proposals];
  
  // Fisher-Yates shuffle algorithm for true randomization
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
}


/* ==========
   CSV parsing & normalisation
========== */
function csvToObjects(text){
  const rows = [];
  let i = 0, field = "", row = [], inQuotes = false;

  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; };

  while (i < text.length){
    const ch = text[i];

    if (ch === '"'){
      if (inQuotes && text[i+1] === '"'){ field += '"'; i += 2; continue; }
      inQuotes = !inQuotes; i++; continue;
    }
    if (!inQuotes && ch === ','){ pushField(); i++; continue; }
    if (!inQuotes && (ch === '\n' || ch === '\r')){
      pushField(); pushRow();
      if (ch === '\r' && text[i+1] === '\n') i++;
      i++; continue;
    }
    field += ch; i++;
  }
  if (field.length || row.length){ pushField(); pushRow(); }

  if (!rows.length) return [];
  const headers = rows.shift().map(h => (h || "").trim());
  return rows
    .filter(r => r.some(x => (x||"").trim() !== ""))
    .map(r => {
      const o = {};
      headers.forEach((h, idx) => { o[h] = (r[idx] || "").trim(); });
      return o;
    });
}

function normaliseRow(row){
  const get = key => {
    if (row[key] != null) return row[key];
    const k = String(key).toLowerCase();
    const found = Object.keys(row).find(x => String(x).toLowerCase() === k);
    return found ? row[found] : "";
  };
  const num = v => (v == null || v === "") ? null : Number(String(v).replace(/[,\s]/g,""));

  const pdfRaw   = (get("PDF_Eng") || "").trim();
  const thumbRaw = (get("Thumbnail") || "").trim();
  const voteFormRaw = (get("VoteForm - Eng") || "").trim();

  return {
    title:   (get("Title_Eng")   || "").trim(),
    summary: (get("Summary_Eng") || "").trim(),
    costLKR: (get("CostLKR_Eng") || "").trim(),  // Keep as text, no conversion
    category:(get("Category_Sin")|| "").trim(),
    categoryColour: (get("Category Colour") || "").trim(),
    pdfUrl:   resolveUrl(pdfRaw,   PDF_BASE_PATH),
    thumbUrl: resolveUrl(thumbRaw, THUMB_BASE_PATH),
    voteFormUrl: voteFormRaw,  // Keep as full URL or empty string
    voteTally: (get("VoteTally - Eng") || "").trim(),  // Sign count from spreadsheet
    badge: (get("Badge") || "").trim(),  // VR or Public badge
  };
  
}

/* ==========
   Filtering & Rendering
========== */
function filterList(q, selectedCats){
  const query = (q||"").toLowerCase().trim();
  const hasCats = Array.isArray(selectedCats) && selectedCats.length > 0;

  // Create synonyms mapping for better search
  const synonyms = {
    'tobacco': ['cigarette', 'smoking', 'nicotine'],
    'cigarette': ['tobacco', 'smoking', 'nicotine'],
    'smoking': ['cigarette', 'tobacco', 'nicotine'],
    'maternity': ['pregnancy', 'childbirth', 'women', 'female'],
    'pregnancy': ['maternity', 'childbirth', 'women', 'female'],
    'electricity': ['power', 'energy', 'utility'],
    'power': ['electricity', 'energy', 'utility'],
    'epf': ['pension', 'retirement', 'provident fund'],
    'pension': ['epf', 'retirement', 'provident fund'],
    'tax': ['taxation', 'levy', 'duty'],
    'audit': ['review', 'examination', 'inspection']
  };

  // Debug logging for multiple category selection
  console.log('🔍 Sinhala Filter Debug:', {
    query: query,
    selectedCats: selectedCats,
    selectedCatsLength: selectedCats.length,
    dataLength: DATA.length
  });

  const filtered = DATA.filter(d => {
    const hay = [d.title, d.summary].join(" ").toLowerCase();
    
    // Check exact match first
    let matchesQ = !query || hay.includes(query);
    
    // If no exact match, check synonyms
    if (!matchesQ && query) {
      for (const [term, synonymList] of Object.entries(synonyms)) {
        if (query.includes(term) || term.includes(query)) {
          // Check if any synonym appears in the content
          matchesQ = synonymList.some(synonym => hay.includes(synonym));
          if (matchesQ) break;
        }
      }
    }
    
    // Handle category matching with translations
    let matchesC = false;
    if (selectedCats.length === 0) {
      matchesC = true; // No filter selected
    } else {
      // Create reverse translation map for matching
      const reverseTranslations = {
        'ආර්ථික වර්ධනය': 'Economic Growth',
        'යුක්තිය සහ අයිතිවාසිකම්': 'Justice and Rights',
        'පාලනය': 'Governance',
        'ආදායම් උත්පාදනය': 'Revenue Generation'
      };
      
      // Check if selected category matches the proposal's category (either directly or via translation)
      matchesC = selectedCats.some(selectedCat => {
        const englishCategory = reverseTranslations[selectedCat] || selectedCat;
        return d.category === selectedCat || d.category === englishCategory;
      });
    }
    
    // Debug logging for category matching
    if (selectedCats.length > 0) {
      console.log(`Sinhala Proposal "${d.title.substring(0, 30)}..." category: "${d.category}" | Selected: [${selectedCats.join(', ')}] | Matches: ${matchesC}`);
    }
    
    return matchesQ && matchesC;
  });
  
  console.log(`🎯 Sinhala Filter result: ${filtered.length} of ${DATA.length} proposals shown`);
  return filtered;
}

async function apply(){
  // Get search query from either desktop or mobile input
  const desktopQ = document.getElementById('q');
  const mobileQ = document.getElementById('mobile-q');
  const q = (desktopQ && desktopQ.value) || (mobileQ && mobileQ.value) || '';
  
  const cats = (typeof window.getSelectedCategories === 'function')
    ? window.getSelectedCategories()
    : [];
  
  document.getElementById('results').setAttribute('aria-busy', 'true');
  
  try {
    if (USE_SEMANTIC_SEARCH) {
      // Use semantic search API (even for empty queries to show all proposals)
      console.log('Using semantic search API');
      
      let results;
      if (!q || q.trim() === '') {
        // If no search query, load all proposals for the current language
        console.log('No search query, loading all proposals for language:', CURRENT_LANGUAGE);
        results = await loadAllProposalsFromAPI(cats.length > 0 ? cats[0] : null);
      } else {
        // If there's a search query, perform semantic search
        results = await performSemanticSearch(q, cats.length > 0 ? cats[0] : null);
      }
      
      if (results && results.length > 0) {
        // Use the same DATA array that was loaded from Google Sheets initially
        // This ensures vote data is consistent with the initial display
        const enrichedResults = results.map(apiProposal => {
          // Find matching proposal in DATA (which has vote data from Google Sheets)
          const matchingData = DATA.find(dataProposal => 
            dataProposal.title.toLowerCase().includes(apiProposal.title.toLowerCase()) ||
            apiProposal.title.toLowerCase().includes(dataProposal.title.toLowerCase())
          );
          
          return {
            ...apiProposal,
            voteFormUrl: matchingData?.voteFormUrl || '',
            voteTally: matchingData?.voteTally || '',
            categoryColour: matchingData?.categoryColour || ''
          };
        });
        
        // Shuffle proposals when showing all proposals (no search query)
        const sortedResults = (!q || q.trim() === '') 
          ? shuffleProposals(enrichedResults)
          : enrichedResults;
        
        document.getElementById('results').innerHTML = sortedResults.map(card).join('');
        document.getElementById('empty').style.display = 'none';
      } else {
        // Fallback to local filtering if API returns no results
        console.log('API returned no results, falling back to local filtering');
        let list = filterList(q, cats);
        if (list.length === 0) {
          loadDemo();
          list = filterList(q, cats);
        }
        
        // Shuffle proposals when showing all proposals (no search query)
        const sortedList = (!q || q.trim() === '') 
          ? shuffleProposals(list)
          : list;
        
        document.getElementById('results').innerHTML = sortedList.map(card).join('');
        document.getElementById('empty').style.display = sortedList.length ? 'none' : 'block';
      }
    } else {
      // Use local filtering
      let list = filterList(q, cats);
      if (list.length === 0) {
        loadDemo();
        list = filterList(q, cats);
      }
      
      // Shuffle proposals when showing all proposals (no search query)
      const sortedList = (!q || q.trim() === '') 
        ? shuffleProposals(list)
        : list;
      
      document.getElementById('results').innerHTML = sortedList.map(card).join('');
      document.getElementById('empty').style.display = sortedList.length ? 'none' : 'block';
    }
  } catch (error) {
    console.error('Error applying filters:', error);
    // Final fallback - show demo data
    loadDemo();
    const fallbackList = filterList(q, cats);
    
    // Shuffle proposals when showing all proposals (no search query)
    const sortedFallbackList = (!q || q.trim() === '') 
      ? shuffleProposals(fallbackList)
      : fallbackList;
    
    document.getElementById('results').innerHTML = sortedFallbackList.map(card).join('');
    document.getElementById('empty').style.display = sortedFallbackList.length ? 'none' : 'block';
  } finally {
    document.getElementById('results').setAttribute('aria-busy', 'false');
  }
}



async function renderFilters(){
  // Extract categories directly from loaded data (more reliable than API)
  const rawCats = uniques(DATA.map(d => d.category)).filter(Boolean);
  
  // Translate English categories to Sinhala
  const categoryTranslations = {
    'Economic Growth': 'ආර්ථික වර්ධනය',
    'Justice and Rights': 'යුක්තිය සහ අයිතිවාසිකම්',
    'Governance': 'පාලනය',
    'Revenue Generation': 'ආදායම් උත්පාදනය'
  };
  
  const cats = rawCats.map(cat => categoryTranslations[cat] || cat);
  
  console.log('Final categories to display:', cats);
  console.log('Available data categories:', uniques(DATA.map(d => d.category)));
  
  const sel = document.getElementById('cat'); // hidden native, kept for semantics
  const ms = document.getElementById('cat-ms');
  const menu = ms.querySelector('.ms-menu');
  const toggle = document.getElementById('cat-toggle');
  
  console.log('DOM elements found:', { sel, ms, menu, toggle });

  // Build hidden <select> for completeness/accessibility
  sel.innerHTML = ['සියලු කාණ්ඩ', ...cats].map(c => `<option>${c}</option>`).join('');
  sel.value = 'සියලු කාණ්ඩ';

  // Build custom menu
  const items = ['සියලු කාණ්ඩ', ...cats].map(c => {
    return `<div class="ms-item" role="option" data-value="${c}" aria-selected="${c==='සියලු කාණ්ඩ' ? 'true' : 'false'}">
      <span class="ms-check">${c==='සියලු කාණ්ඩ' ? '•' : ''}</span>
      <span class="ms-label">${c}</span>
    </div>`;
  }).join('');
  menu.innerHTML = items;
  
  // If no categories found, show a message
  if (cats.length === 0) {
    menu.innerHTML = '<div class="ms-item" style="color: #666; font-style: italic;">කාණ්ඩ නොමැත</div>';
  }

  // Toggle open/close - Simplified approach
  let isMenuOpen = false;
  
  const closeMenu = () => { 
    ms.classList.remove('open'); 
    toggle.setAttribute('aria-expanded','false');
    isMenuOpen = false;
  };
  
  const openMenu = () => { 
    ms.classList.add('open'); 
    toggle.setAttribute('aria-expanded','true');
    isMenuOpen = true;
  };
  
  toggle.addEventListener('click', (e)=> {
    e.preventDefault();
    e.stopPropagation();
    if (isMenuOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });
  
  // Close when clicking outside
  document.addEventListener('click', (e)=> { 
    if (!ms.contains(e.target)) {
      closeMenu();
    }
  });
  
  // Keyboard support
  toggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isMenuOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    }
  });

  // Selection model
  let selected = new Set(['සියලු කාණ්ඩ']);

  const updateUI = () => {
    // reflect in menu
    menu.querySelectorAll('.ms-item').forEach(it => {
      const val = it.getAttribute('data-value');
      it.setAttribute('aria-selected', selected.has(val) ? 'true' : 'false');
      const check = it.querySelector('.ms-check');
      check.textContent = selected.has(val) ? '✓' : '';
    });
    // reflect summary
    const shown = selected.has('සියලු කාණ්ඩ') ? 'සියලු කාණ්ඩ'
                  : Array.from(selected).join(', ');
    toggle.innerHTML = `<span class="ms-summary">${shown}</span>`;

    // reflect hidden <select> (optional)
    Array.from(sel.options).forEach(o => o.selected = selected.has(o.value));

    // re-apply filters
    apply();
  };

  // Click-to-toggle behaviour
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.ms-item');
    if (!item) return;
    const val = item.getAttribute('data-value');

    if (val === 'සියලු කාණ්ඩ') {
      // Selecting "All" clears others
      selected.clear();
      selected.add('සියලු කාණ්ඩ');
    } else {
      // Toggle this category
      if (selected.has(val)) {
        selected.delete(val);
      } else {
        selected.add(val);
      }
      // If any specific cats selected, ensure "All" is off
      selected.delete('සියලු කාණ්ඩ');
      // If none left, fall back to All
      if (selected.size === 0) selected.add('All categories');
    }
    updateUI();
  });

  // Expose a getter for apply()
  window.getSelectedCategories = () => {
    return selected.has('සියලු කාණ්ඩ') ? [] : Array.from(selected);
  };

  // Initial paint
  updateUI();

  // Initialize mobile category functionality
  const mobileCatMs = document.getElementById('mobile-cat-ms');
  if (mobileCatMs) {
    const mobileMenu = mobileCatMs.querySelector('.ms-menu');
    const mobileToggle = document.getElementById('mobile-cat-toggle');
    
    // Build mobile menu with same categories
    const mobileItems = ['සියලු කාණ්ඩ', ...cats].map(c => {
      return `<div class="ms-item" role="option" data-value="${c}" aria-selected="${c==='සියලු කාණ්ඩ' ? 'true' : 'false'}">
        <span class="ms-check">${c==='සියලු කාණ්ඩ' ? '•' : ''}</span>
        <span class="ms-label">${c}</span>
      </div>`;
    }).join('');
    mobileMenu.innerHTML = mobileItems;
    
    // Mobile toggle open/close
    let isMobileMenuOpen = false;
    
    const closeMobileMenu = () => { 
      mobileCatMs.classList.remove('open'); 
      mobileToggle.setAttribute('aria-expanded','false');
      isMobileMenuOpen = false;
    };
    
    const openMobileMenu = () => { 
      mobileCatMs.classList.add('open'); 
      mobileToggle.setAttribute('aria-expanded','true');
      isMobileMenuOpen = true;
    };
    
    mobileToggle.addEventListener('click', (e)=> {
      e.preventDefault();
      e.stopPropagation();
      if (isMobileMenuOpen) {
        closeMobileMenu();
      } else {
        openMobileMenu();
      }
    });
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', (e)=> { 
      if (!mobileCatMs.contains(e.target)) {
        closeMobileMenu();
      }
    });
    
    // Mobile selection model - sync with desktop
    const updateMobileUI = () => {
      // reflect in mobile menu
      mobileMenu.querySelectorAll('.ms-item').forEach(it => {
        const val = it.getAttribute('data-value');
        it.setAttribute('aria-selected', selected.has(val) ? 'true' : 'false');
        const check = it.querySelector('.ms-check');
        check.textContent = selected.has(val) ? '✓' : '';
      });
      // reflect mobile summary
      const shown = selected.has('සියලු කාණ්ඩ') ? 'සියලු කාණ්ඩ'
                    : Array.from(selected).join(', ');
      mobileToggle.innerHTML = `<span class="ms-summary">${shown}</span>`;
    };
    
    // Mobile click-to-toggle behaviour
    mobileMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.ms-item');
      if (!item) return;
      const val = item.getAttribute('data-value');

      if (val === 'සියලු කාණ්ඩ') {
        // Selecting "All" clears others
        selected.clear();
        selected.add('සියලු කාණ්ඩ');
      } else {
        // Toggle this category
        if (selected.has(val)) {
          selected.delete(val);
        } else {
          selected.add(val);
        }
        // If any specific cats selected, ensure "All" is off
        selected.delete('සියලු කාණ්ඩ');
        // If none left, fall back to All
        if (selected.size === 0) selected.add('සියලු කාණ්ඩ');
      }
      updateUI(); // Update desktop
      updateMobileUI(); // Update mobile
    });
    
    // Initial mobile paint
    updateMobileUI();
  }
}



function thumbBlock(d){
  console.log('thumbBlock called for:', d.title, 'thumbUrl:', d.thumbUrl);
  if (d.thumbUrl){
    // Add cache-busting parameter to force fresh image loading
    const cacheBuster = `?v=${Date.now()}`;
    const thumbUrlWithCacheBuster = d.thumbUrl + cacheBuster;
    console.log('Loading image:', thumbUrlWithCacheBuster); // Debug log
    return `<div class="thumb-wrap"><img class="thumb" src="${thumbUrlWithCacheBuster}" alt="" onerror="console.log('Failed to load image:', this.src)"></div>`;
  }
  // fallback: first letter of category (or •)
  const letter = (d.category || "•").trim().charAt(0).toUpperCase() || "•";
  console.log('Using fallback letter:', letter, 'for category:', d.category);
  return `<div class="thumb-wrap"><div class="thumb-fallback" aria-hidden="true">${letter}</div></div>`;
}

function card(d){
    const costText = (d.costLKR || "").toString().trim();
    let costClass = '';
    let showCostBadge = true;
    let displayText = costText;
  
    // Check the format and apply correct colors
    if (/^cost\s*=/i.test(costText)) {
      costClass = 'badge--red';  // Red for cost items
    } else if (/^revenue\s*=/i.test(costText)) {
      costClass = 'badge--green';  // Green for revenue items
    } else if (/^LKR\s+\d+/.test(costText)) {
      // If it's just LKR amount without prefix, assume it's a cost
      displayText = `Cost = ${costText}`;
      costClass = 'badge--red';
    } else if (/^no\s+costing\s+available$/i.test(costText) || costText === '' || costText === '—') {
      showCostBadge = false; // Don't show badge for no cost data
    } else {
      costClass = 'badge--red';  // Default to red for cost items
    }
  
    // Show full summary without word limit
    const fullSummary = d.summary;
    
    // Get vote count for this proposal
    const voteCount = VOTES[d.title] || 0;
    const hasVoted = localStorage.getItem(`voted_${d.title}`) === 'true';
    
    // Create combined vote pill - only show if voteFormUrl exists
    const voteSection = d.voteFormUrl ? 
      `<div class="vote-section">
        <a href="${d.voteFormUrl}" target="_blank" rel="noopener" class="vote-pill" aria-label="Vote for this proposal" onclick="event.stopPropagation();">
          <span>මනාපය පලකරන්න</span>
          ${d.voteTally ? `<span class="vote-count">${formatNumber(d.voteTally)}</span>` : ''}
        </a>
      </div>` : '';
  
    // Get category color for header background
    let categoryColor = (d.categoryColour || "").toLowerCase();
    
    // Debug logging
    console.log('Category debug:', {
      category: d.category,
      categoryColour: d.categoryColour,
      categoryColor: categoryColor
    });
    
    // Fallback: if no categoryColour, try to map from category name
    if (!categoryColor) {
      const categoryMap = {
        'economic growth': 'blue',
        'justice and rights': 'yellow',
        'governance': 'red',
        'revenue generation': 'yellow',
        'ආර්ථික වර්ධනය': 'blue',
        'යුක්තිය සහ අයිතිවාසිකම්': 'yellow',
        'පාලනය': 'red',
        'ආදායම් උත්පාදනය': 'yellow'
      };
      categoryColor = categoryMap[d.category?.toLowerCase()] || '';
      console.log('Mapped category color:', categoryColor);
    }
    
    const headerClass = categoryColor ? `card-header category-${categoryColor}` : 'card-header';
    
    return `<article class="card" aria-label="${d.title}">
      <div class="card-inner">
        <div class="${headerClass}">
          <div class="thumbnail-section">
            ${thumbBlock(d)}
          </div>
          <div class="title-section">
            <h3 class="card-title">${d.title}</h3>
            <div class="vote-section">
              ${voteSection}
            </div>
          </div>
        </div>
        <div class="card-body">
          <div class="summary">
            <span class="summary-full">${fullSummary}</span>
          </div>
          <div class="meta">
          </div>
           <div class="actions">
            ${d.badge === 'Public' ? `<span class="source-badge"><img src="assets/images/${d.badge}_badge.png" alt="${d.badge}"/></span>` : ''}
            ${showCostBadge ? `<span class="badge ${costClass}" title="Estimated cost">${displayText}</span>` : ''}
            ${d.pdfUrl ? `<a class="download" href="${d.pdfUrl}" target="_blank" rel="noopener">විශ්ලේෂණය බාගත කරන්න</a>` : ""}
           </div>
        </div>
      </div>
    </article>`;
}

/* ==========
   Data loading with cache-busting
========== */
async function fetchCSV(url){
  const cacheBuster = (url.includes("?") ? "&" : "?") + "t=" + Date.now();
  const res = await fetch(url + cacheBuster, { 
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`Failed to fetch CSV (${res.status})`);
  return await res.text();
}
async function loadFromSheet(){
  // Try to load from semantic search API first (supports multi-language)
  try {
    console.log("[API] Fetching data from semantic search API with language:", CURRENT_LANGUAGE);
    const response = await fetch(`${SEMANTIC_SEARCH_API_URL}/proposals?language=${CURRENT_LANGUAGE}`);
    if (response.ok) {
      const apiData = await response.json();
      if (apiData && apiData.results && apiData.results.length > 0) {
        DATA = await mergeVoteDataWithAPIResults(apiData.results);
        console.log("[API] Loaded data from semantic search API:", DATA.length, "proposals");
        console.log("[API] Sample data:", DATA[0]);
        return true;
      }
    }
  } catch (err) {
    console.log("[API] Semantic search API not available:", err.message);
  }
  
  // No additional fallback servers needed - using Hugging Face Space
  
  // Fallback: Load directly from CSV (fastest method) - for all languages
  if (SHEET_CSV_URL) {
    try{
      console.log("[CSV] Fetching data from optimized CSV URL:", SHEET_CSV_URL);
      const csv = await fetchCSV(SHEET_CSV_URL);
      console.log("[CSV] Raw CSV data:", csv.substring(0, 500) + "...");
      const rows = csvToObjects(csv).map(normaliseRow).filter(r => r.title);
      if (!rows.length) throw new Error("No rows found after parsing.");
      DATA = rows;
      console.log("[CSV] Loaded data efficiently:", DATA.length, "proposals");
      console.log("[CSV] Sample data:", DATA[0]);
      console.log("[CSV] Vote tallies:", DATA.map(d => ({ title: d.title, voteTally: d.voteTally })));
      return true;
    }catch(err){
      console.warn("[CSV] Failed, falling back to demo data:", err.message);
    }
  }
  
  // Final fallback: Load demo data for all languages
  console.log("[Demo] Loading demo data for", CURRENT_LANGUAGE, "language");
  loadDemo();
  return true;
}

function loadDemo(){
  DATA = [
    {
      title: 'State funding of maternity leave benefits in the private sector',
      summary: 'Shift the cost of maternity leave from employers to the state to remove hiring bias against women',
      costLKR: 'LKR 7.5 Bn',
      category: 'Economic Growth',
      categoryColour: 'Blue',
      pdfUrl:   resolveUrl("20250813_Budget2026Proposal_MaternityLeaveBenefit_Raj_D01.pdf", PDF_BASE_PATH),
      thumbUrl: resolveUrl("20250813_Budget2026Proposal_MaternityLeaveBenefit_Raj_D01.jpg", THUMB_BASE_PATH),
      voteFormUrl: 'https://www.change.org/p/prime-minister-of-sri-lanka-pass-and-enact-the-animal-welfare-bill-of-sri-lanka-to-replace-current-law-from-1907?source_location=discover_feed',
      voteTally: '132,014'
    }
  ];
  console.log("[Demo] Loaded demo data:", DATA.length, "proposals");
  console.log("[Demo] Sample data:", DATA[0]);
}

/* ==========
   Card Toggle Function
========== */
function toggleCard(cardElement) {
  const shortSummary = cardElement.querySelector('.summary-short');
  const fullSummary = cardElement.querySelector('.summary-full');
  const actions = cardElement.querySelector('.actions');
  
  if (shortSummary.style.display !== 'none') {
    // Expand card
    shortSummary.style.display = 'none';
    fullSummary.style.display = 'block';
    actions.style.display = 'flex';
    cardElement.classList.add('expanded');
  } else {
    // Collapse card
    shortSummary.style.display = 'block';
    fullSummary.style.display = 'none';
    actions.style.display = 'none';
    cardElement.classList.remove('expanded');
  }
}

/* ==========
   Voting Functions
========== */
function handleVote(proposalTitle) {
  const hasVoted = localStorage.getItem(`voted_${proposalTitle}`) === 'true';
  
  if (hasVoted) {
    // Remove vote
    VOTES[proposalTitle] = Math.max(0, (VOTES[proposalTitle] || 0) - 1);
    localStorage.removeItem(`voted_${proposalTitle}`);
  } else {
    // Add vote
    VOTES[proposalTitle] = (VOTES[proposalTitle] || 0) + 1;
    localStorage.setItem(`voted_${proposalTitle}`, 'true');
  }
  
  // Update the display
  apply();
  
  // Optional: Save votes to localStorage for persistence
  localStorage.setItem('proposal_votes', JSON.stringify(VOTES));
}

function openPetition(proposalTitle) {
  // Create a change.org petition URL (you can customize this)
  const petitionUrl = `https://www.change.org/start-a-petition?source_location=search&search=${encodeURIComponent(proposalTitle)}`;
  
  // Open in new tab
  window.open(petitionUrl, '_blank');
}

// Load saved votes on page load
function loadVotes() {
  const savedVotes = localStorage.getItem('proposal_votes');
  if (savedVotes) {
    VOTES = JSON.parse(savedVotes);
  }
}

/* ==========
   Mobile Menu Toggle Function
========== */
function toggleMobileMenu() {
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
  const menuToggle = document.querySelector('.mobile-menu-toggle');
  
  if (mobileMenu.classList.contains('active')) {
    // Close menu with smooth slide animation
    mobileMenu.classList.remove('active');
    mobileMenuOverlay.classList.remove('active');
    menuToggle.classList.remove('active');
    document.body.classList.remove('mobile-menu-open');
    
    // Prevent body scroll when menu is open
    document.body.style.overflow = '';
  } else {
    // Open menu with smooth slide animation
    mobileMenu.classList.add('active');
    mobileMenuOverlay.classList.add('active');
    menuToggle.classList.add('active');
    document.body.classList.add('mobile-menu-open');
    
    // Prevent body scroll when menu is open
    document.body.style.overflow = 'hidden';
  }
}

// Close mobile menu when clicking overlay
function closeMobileMenu() {
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
  const menuToggle = document.querySelector('.mobile-menu-toggle');
  
  mobileMenu.classList.remove('active');
  mobileMenuOverlay.classList.remove('active');
  menuToggle.classList.remove('active');
  document.body.classList.remove('mobile-menu-open');
  document.body.style.overflow = '';
}

/* ==========
   Chatbot Functions
========== */
const CHATBOT_API_URL = "https://danulr05-budget-proposals-chatbot-api.hf.space/api";
let CHAT_SESSION_ID = 'session_' + Date.now(); // Generate unique session ID

// Chatbot state
let chatbotOpen = false;
let chatHistory = [];

function toggleChatbot() {
  const interface = document.getElementById('chatbotInterface');
  const toggle = document.getElementById('chatbotToggle');
  
  chatbotOpen = !chatbotOpen;
  
  if (chatbotOpen) {
    interface.classList.add('active');
    toggle.style.display = 'none';
    document.getElementById('chatbotInput').focus();
  } else {
    interface.classList.remove('active');
    toggle.style.display = 'flex';
  }
}

function closeChatbot() {
  chatbotOpen = false;
  document.getElementById('chatbotInterface').classList.remove('active');
  document.getElementById('chatbotToggle').style.display = 'flex';
}

function showTypingIndicator() {
  const messagesContainer = document.getElementById('chatbotMessages');
  const typingDiv = document.createElement('div');
  typingDiv.className = 'message bot-message';
  typingDiv.id = 'typing-indicator';
  typingDiv.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  messagesContainer.appendChild(typingDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideTypingIndicator() {
  const typingIndicator = document.getElementById('typing-indicator');
  if (typingIndicator) {
    typingIndicator.remove();
  }
}

function addMessage(content, isUser = false, sources = []) {
  const messagesContainer = document.getElementById('chatbotMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
  
  if (isUser) {
    messageDiv.innerHTML = `
      <div class="message-content">
        <p>${content}</p>
      </div>
    `;
  } else {
    // Use provided sources or fall back to parsing from content
    let displayContent = content;
    let sourceLinks = '';
    
    if (sources && sources.length > 0) {
      // Use sources from API response
      sourceLinks = sources.map(source => {
        // Handle both object format {filename, short_name} and string format
        const filename = typeof source === 'object' ? source.filename : source;
        const displayName = typeof source === 'object' ? source.short_name : source;
        const pdfUrl = `assets/pdfs/${filename}`;
        return `<a href="${pdfUrl}" target="_blank" class="source-link">📄 ${displayName}</a>`;
      }).join(' ');
    } else {
      // Fall back to parsing source information from content
      const sourceMatch = content.match(/\(Source:\s*([^)]+)\)/i);
      
      if (sourceMatch) {
        const parsedSources = sourceMatch[1].split(',').map(s => s.trim());
        displayContent = content.replace(/\(Source:\s*[^)]+\)/, '');
        
        sourceLinks = parsedSources.map(source => {
          const pdfUrl = `assets/pdfs/${source}`;
          return `<a href="${pdfUrl}" target="_blank" class="source-link">📄 ${source}</a>`;
        }).join(' ');
      }
    }
    
    messageDiv.innerHTML = `
      <div class="message-content">
        <p>${displayContent}</p>
        ${sourceLinks ? `<div class="source-links">${sourceLinks}</div>` : ''}
      </div>
    `;
  }
  
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendMessage(message) {
  if (!message.trim()) return;
  
  // Add user message to chat
  addMessage(message, true);
  
  // Show typing indicator
  showTypingIndicator();
  
  // Disable input while processing
  const input = document.getElementById('chatbotInput');
  const sendBtn = document.getElementById('chatbotSend');
  input.disabled = true;
  sendBtn.disabled = true;
  
  try {
    const response = await fetch(`${CHATBOT_API_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        message: message,
        session_id: CHAT_SESSION_ID
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Only use sources from API response, no fallback extraction
    let sources = result.sources || [];
    
    // Hide typing indicator and add bot response to chat with sources
    hideTypingIndicator();
    addMessage(result.response || 'Sorry, I couldn\'t process your request.', false, sources);
    
    // Update session info if provided
    if (result.session_id) {
      CHAT_SESSION_ID = result.session_id;
    }
    
    // Log memory usage info and update UI
    if (result.memory_used) {
      console.log(`Chat memory active - Session: ${result.session_id}, Messages: ${result.conversation_length}`);
      
      // Update clear button to show memory is active
      const clearBtn = document.getElementById('chatbotClear');
      if (clearBtn) {
        clearBtn.classList.add('memory-active');
        clearBtn.title = `Clear chat memory (Ctrl+L) - ${result.conversation_length} messages`;
      }
    }
    
    // Debug log for sources
    console.log('Sources found:', sources);
    console.log('Response:', result.response);
    
  } catch (error) {
    console.error('Chatbot error:', error);
    hideTypingIndicator();
    addMessage('Sorry, I\'m having trouble connecting right now. Please try again later.');
  } finally {
    // Re-enable input
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

function sendSuggestion(suggestion) {
  const input = document.getElementById('chatbotInput');
  input.value = suggestion;
  sendMessage(suggestion);
  // Clear the input after sending
  input.value = '';
}

function handleChatbotInput(event) {
  if (event.key === 'Enter') {
    const input = event.target;
    const message = input.value.trim();
    if (message) {
      sendMessage(message);
      input.value = '';
    }
  }
}

async function clearChatMemory() {
  try {
    const response = await fetch(`${CHATBOT_API_URL}/chat/clear`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session_id: CHAT_SESSION_ID })
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Clear the chat display
      const messagesContainer = document.getElementById('chatbotMessages');
      messagesContainer.innerHTML = '';
      
      // Generate new session ID
      CHAT_SESSION_ID = 'session_' + Date.now();
      
      // Remove memory-active class from clear button
      const clearBtn = document.getElementById('chatbotClear');
      if (clearBtn) {
        clearBtn.classList.remove('memory-active');
        clearBtn.title = 'Clear chat memory (Ctrl+L)';
      }
      
      console.log('Chat memory cleared successfully');
      
      // Show welcome message again
      addMessage(`👋 Hello there! I'm your Budget Assistant. I'm here to help you explore and understand the budget proposals for Sri Lanka. Feel free to ask me anything about the policies, costs, or benefits - I'm here to make it all clear for you! What would you like to know? 😊`);
    } else {
      console.error('Failed to clear chat memory');
    }
  } catch (error) {
    console.error('Error clearing chat memory:', error);
  }
}

function handleChatbotSend() {
  const input = document.getElementById('chatbotInput');
  const message = input.value.trim();
  if (message) {
    sendMessage(message);
    input.value = '';
  }
}

/* ==========
   Init
========== */
async function init(){
  $('#y').textContent = new Date().getFullYear();

  // Show loading spinner on initial load
  showLoading();

  // Give APIs a moment to start up (reduced delay)
  if (USE_SEMANTIC_SEARCH) {
    console.log('Waiting for APIs to start up...');
    await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 2s to 0.5s
  }

  // Load data from CSV (optimized), fallback to demo data
  const ok = await loadFromSheet();
  if (!ok) {
    console.log('CSV loading failed, loading demo data');
    loadDemo();
  } else {
    console.log('CSV loaded successfully with real data');
  }

  // Load saved votes
  loadVotes();

  // Ensure we have data before rendering filters
  if (DATA.length === 0) {
    console.log('No data loaded, loading demo data');
    loadDemo();
  }

  await renderFilters();
  
  // Ensure search input is empty
  document.getElementById('q').value = '';
  
  // Display all documents on initial load in random order
  const shuffledData = shuffleProposals(DATA);
  document.getElementById('results').innerHTML = shuffledData.map(card).join('');
  document.getElementById('empty').style.display = 'none';
  
  // Hide loading spinner after initial load
  hideLoading();

  // Add debounced search input handler for desktop
  $('#q').addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    // Sync with mobile search input
    const mobileQ = document.getElementById('mobile-q');
    if (mobileQ) mobileQ.value = query;
    
    // If input becomes empty, immediately show all proposals
    if (!query) {
      clearTimeout(SEARCH_DEBOUNCE_TIMER);
      apply();
    } else {
      // Debounce for non-empty queries
      clearTimeout(SEARCH_DEBOUNCE_TIMER);
      SEARCH_DEBOUNCE_TIMER = setTimeout(() => {
        apply();
      }, 150); // Reduced from 300ms to 150ms for faster response
    }
  });
  
  // Add Enter key handler for desktop search input
  $('#q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(SEARCH_DEBOUNCE_TIMER);
      apply();
    }
  });

  // Add mobile search input handler
  const mobileQ = document.getElementById('mobile-q');
  if (mobileQ) {
    mobileQ.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      
      // Sync with desktop search input
      $('#q').value = query;
      
      // If input becomes empty, immediately show all proposals
      if (!query) {
        clearTimeout(SEARCH_DEBOUNCE_TIMER);
        apply();
      } else {
        // Debounce for non-empty queries
        clearTimeout(SEARCH_DEBOUNCE_TIMER);
        SEARCH_DEBOUNCE_TIMER = setTimeout(() => {
          apply();
        }, 150);
      }
    });
    
    // Add Enter key handler for mobile search input
    mobileQ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(SEARCH_DEBOUNCE_TIMER);
        apply();
      }
    });
  }
  
  $('#cat').addEventListener('change', apply);

  // Initialize language selectors
  const languageSelect = document.getElementById('languageSelect');
  const mobileLanguageSelect = document.getElementById('mobileLanguageSelect');
  
  if (languageSelect) {
    languageSelect.addEventListener('change', (e) => {
      setLanguage(e.target.value);
    });
  }
  
  if (mobileLanguageSelect) {
    mobileLanguageSelect.addEventListener('change', (e) => {
      setLanguage(e.target.value);
    });
  }
  
  // Load saved language preference
  const savedLanguage = localStorage.getItem('selectedLanguage');
  if (savedLanguage && ['en', 'si', 'ta'].includes(savedLanguage)) {
    setLanguage(savedLanguage);
  }

  // Initialize mobile menu overlay
  const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
  if (mobileMenuOverlay) {
    mobileMenuOverlay.addEventListener('click', closeMobileMenu);
  }

  // Initialize chatbot
  document.getElementById('chatbotToggle').addEventListener('click', toggleChatbot);
  document.getElementById('chatbotClose').addEventListener('click', closeChatbot);
  document.getElementById('chatbotClear').addEventListener('click', clearChatMemory);
  document.getElementById('chatbotInput').addEventListener('keypress', handleChatbotInput);
  document.getElementById('chatbotSend').addEventListener('click', handleChatbotSend);
  document.getElementById('chatbotVoice').addEventListener('click', startVoiceInput);
  
  // Add keyboard shortcut for clearing chat (Ctrl+L)
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      clearChatMemory();
    }
  });
}

// Speech-to-Text functionality
let recognition = null;
let isListening = false;

function initializeSpeechRecognition() {
  // Check if browser supports speech recognition
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.warn('Speech recognition not supported in this browser');
    return false;
  }

  // Initialize speech recognition
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  
  // Configure recognition settings
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  // Set up event handlers
  recognition.onstart = () => {
    isListening = true;
    const voiceBtn = document.getElementById('chatbotVoice');
    voiceBtn.classList.add('listening');
    voiceBtn.title = 'Listening... Click to stop';
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById('chatbotInput').value = transcript;
    
    // Auto-send the message
    setTimeout(() => {
      if (transcript.trim()) {
        sendMessage(transcript);
        document.getElementById('chatbotInput').value = '';
      }
    }, 500);
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    stopVoiceInput();
    addMessage('Voice input error. Please try again.', false);
  };

  recognition.onend = () => {
    console.log('Speech recognition ended');
    stopVoiceInput();
  };

  return true;
}

async function startVoiceInput() {
  // Check if already listening
  if (isListening) {
    stopVoiceInput();
    return;
  }

  // Initialize recognition if needed
  if (!recognition) {
    if (!initializeSpeechRecognition()) {
      addMessage('Voice input is not supported in your browser. Please use text input instead.', false);
      return;
    }
  }

  // Request microphone permission first
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop()); // Stop the stream immediately
    
    // Now start speech recognition
    try {
      recognition.start();
      console.log('Speech recognition started successfully');
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      addMessage('Unable to start voice input. Please try again.', false);
    }
  } catch (permissionError) {
    console.error('Microphone permission denied:', permissionError);
    addMessage('Microphone access is required for voice input. Please allow microphone access and try again.', false);
  }
}

function stopVoiceInput() {
  if (recognition && isListening) {
    try {
      recognition.stop();
      console.log('Speech recognition stopped');
    } catch (error) {
      console.log('Speech recognition already stopped');
    }
    
    isListening = false;
    
    const voiceBtn = document.getElementById('chatbotVoice');
    voiceBtn.classList.remove('listening');
    voiceBtn.title = 'Voice Input';
  }
}

// Tracker functionality
// Google Sheets CSV URL for proposals tracker
const PROPOSALS_TRACKER_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTX6EuJBAP0wWg1zbZlFktLkmy4_1SNapYj08StVU8-iFW7WmbI2_5te1ms_s9SuQcQvuhHm2U1e52e/pub?output=csv";

let trackerData = [];
let currentPage = 1;
let itemsPerPage = 4; // Desktop: 4 rows per page
let trackerSearchTerm = '';
let filteredTrackerData = [];

// Open the proposals tracker modal
function openProposalsTracker() {
  const modal = document.getElementById('proposalsTrackerModal');
  const loading = document.getElementById('trackerLoading');
  const tableContainer = document.getElementById('trackerTableContainer');
  const error = document.getElementById('trackerError');
  
  // Show modal and loading state
  modal.style.display = 'flex';
  loading.style.display = 'flex';
  tableContainer.style.display = 'none';
  error.style.display = 'none';
  
  // Prevent body scroll
  document.body.style.overflow = 'hidden';
  
  // Initialize search
  initializeTrackerSearch();
  
  // Load data from Google Sheets
  loadProposalsTrackerData();
}

// Close the proposals tracker modal
function closeProposalsTracker() {
  const modal = document.getElementById('proposalsTrackerModal');
  modal.style.display = 'none';
  
  // Restore body scroll
  document.body.style.overflow = '';
}

// Initialize tracker search functionality
function initializeTrackerSearch() {
  const searchInput = document.getElementById('trackerSearchInput');
  const searchClear = document.getElementById('trackerSearchClear');
  
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      trackerSearchTerm = this.value.trim();
      filterTrackerData();
      updateSearchClearButton();
    });
  }
  
  if (searchClear) {
    searchClear.addEventListener('click', function() {
      searchInput.value = '';
      trackerSearchTerm = '';
      filterTrackerData();
      updateSearchClearButton();
    });
  }
}

// Update search clear button visibility
function updateSearchClearButton() {
  const searchClear = document.getElementById('trackerSearchClear');
  if (searchClear) {
    searchClear.style.display = trackerSearchTerm ? 'block' : 'none';
  }
}

// Filter tracker data based on search term
function filterTrackerData() {
  if (!trackerData || trackerData.length === 0) return;
  
  if (!trackerSearchTerm) {
    filteredTrackerData = [...trackerData];
  } else {
    const searchLower = trackerSearchTerm.toLowerCase();
    filteredTrackerData = trackerData.filter(row => {
      // Search in ID and Name of Proposal columns
      const id = (row['ID'] || '').toString().toLowerCase();
      const name = (row['Name of Proposal'] || '').toLowerCase();
      return id.includes(searchLower) || name.includes(searchLower);
    });
  }
  
  // Re-render the table with filtered data
  renderFilteredTrackerData();
}

// Render filtered tracker data
function renderFilteredTrackerData() {
  if (!filteredTrackerData || filteredTrackerData.length === 0) {
    // Show empty state
    const tableBody = document.getElementById('trackerTableBody');
    if (tableBody) {
      tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 40px; color: #6b7280;">No proposals found matching your search.</td></tr>';
    }
    return;
  }
  
  // Update pagination with filtered data
  const originalData = trackerData;
  trackerData = filteredTrackerData;
  currentPage = 1;
  
  renderPaginatedData();
  
  // Restore original data for future filtering
  trackerData = originalData;
}

// Load proposals tracker data from Google Sheets
async function loadProposalsTrackerData() {
  const loading = document.getElementById('trackerLoading');
  const tableContainer = document.getElementById('trackerTableContainer');
  const error = document.getElementById('trackerError');
  const tableHeader = document.getElementById('trackerTableHeader');
  const tableBody = document.getElementById('trackerTableBody');
  
  try {
    console.log('Loading proposals tracker data from:', PROPOSALS_TRACKER_CSV_URL);
    
    const response = await fetch(PROPOSALS_TRACKER_CSV_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const csvText = await response.text();
    
    // Parse CSV data
    const data = parseCSV(csvText);
    
    if (data.length === 0) {
      throw new Error('No data found in the spreadsheet');
    }
    
    // Store data globally for pagination
    trackerData = data;
    currentPage = 1;
    itemsPerPage = getItemsPerPage();
    
    // Populate table header with 3 columns for desktop layout
    tableHeader.innerHTML = '';
    
    // Add ID column header
    const idTh = document.createElement('th');
    idTh.textContent = 'ID';
    tableHeader.appendChild(idTh);
    
    // Add Name of Proposal column header
    const nameTh = document.createElement('th');
    nameTh.textContent = 'Name of Proposal';
    tableHeader.appendChild(nameTh);
    
    // Add Status column header (contains progress timeline)
    const statusTh = document.createElement('th');
    statusTh.textContent = 'Status';
    tableHeader.appendChild(statusTh);
    
    // Render paginated data
    renderPaginatedData();
    
    // Show table and hide loading
    loading.style.display = 'none';
    tableContainer.style.display = 'block';
    error.style.display = 'none';
    
  } catch (error) {
    console.error('Error loading tracker data:', error);
    loading.style.display = 'none';
    tableContainer.style.display = 'none';
    error.style.display = 'block';
  }
}

// Create progress tracker HTML
function createProgressTracker(row) {
  // Base three stages (always shown)
  const baseStages = [
    { key: 'Received', label: 'Received', pattern: /^received$/i },
    { key: 'Returned for Revision', label: 'Returned for Revision', pattern: /^returned for (r|revision)/i },
    { key: 'Received with Revision', label: 'Received with Revision', pattern: /^received with (r|revision)/i }
  ];

  const allHeaders = Object.keys(row);

  // Build stage data for the first three stages (mark completed if date exists)
  const stageData = baseStages.map(stage => {
    let matchingHeader = allHeaders.find(header => header === stage.key);
    if (!matchingHeader) {
      matchingHeader = allHeaders.find(header => stage.pattern.test((header || '').trim()));
    }

    const cellValue = matchingHeader ? String(row[matchingHeader] || '').trim() : '';
    const isDate = cellValue && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(cellValue);

    return {
      ...stage,
      date: isDate ? cellValue : '',
      hasDate: !!isDate,
      matchingHeader
    };
  });

  // Handle the final stage – prefer specific release labels when present
  const releasedAsConceptHeader = allHeaders.find(h => h === 'Released as a Concept');
  const releasedAsProposalHeader = allHeaders.find(h => h === 'Released as a Proposal');

  const conceptValue = releasedAsConceptHeader ? String(row[releasedAsConceptHeader] || '').trim() : '';
  const proposalValue = releasedAsProposalHeader ? String(row[releasedAsProposalHeader] || '').trim() : '';

  const conceptHasDate = conceptValue && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(conceptValue);
  const proposalHasDate = proposalValue && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(proposalValue);

  let finalStage;
  if (conceptHasDate) {
    finalStage = {
      key: 'Released as a Concept',
      label: 'Released as a Concept',
      date: conceptValue,
      hasDate: true,
      matchingHeader: releasedAsConceptHeader
    };
  } else if (proposalHasDate) {
    finalStage = {
      key: 'Released as a Proposal',
      label: 'Released as a Proposal',
      date: proposalValue,
      hasDate: true,
      matchingHeader: releasedAsProposalHeader
    };
  } else {
    // No release date yet – show as pending with generic label
    finalStage = {
      key: 'Released',
      label: 'Released',
      date: '',
      hasDate: false,
      matchingHeader: null
    };
  }

  stageData.push(finalStage);

  // If released as a concept and there is no "Received with Revision" date,
  // drop the middle revision-received stage to avoid a pending gap between two completed stages
  const releasedIsConcept = finalStage.label === 'Released as a Concept';
  const receivedWithRevision = stageData.find(s => s.key === 'Received with Revision');
  if (releasedIsConcept && receivedWithRevision && !receivedWithRevision.hasDate) {
    // Keep order: Received -> Returned for Revision -> Released as a Concept
    const filtered = stageData.filter(s => s.key !== 'Received with Revision');
    // Reassign to stageData in-place for subsequent rendering
    stageData.length = 0;
    filtered.forEach(s => stageData.push(s));
  }

  // Generate HTML for progress tracker with class indicating stage count
  const stageCount = stageData.length;
  let progressHTML = `<div class="progress-tracker stages-${stageCount}">`;

  stageData.forEach((stage, index) => {
    const circleClass = stage.hasDate ? 'progress-circle completed' : 'progress-circle pending';
    const dateHtml = stage.hasDate ? `<div class="progress-date">${stage.date}</div>` : '<div class="progress-date" style="color: transparent;">-</div>';

    progressHTML += `
      <div class="progress-stage">
        <div class="progress-label">${stage.label}</div>
        <div class="${circleClass}"></div>
        ${dateHtml}
      </div>
    `;

    if (index < stageData.length - 1) {
      const nextStage = stageData[index + 1];
      let connectorClass = 'progress-connector';
      if (stage.hasDate && nextStage.hasDate) {
        connectorClass += ' completed';
      } else if (stage.hasDate && !nextStage.hasDate) {
        connectorClass += ' partial';
      }
      progressHTML += `<div class="${connectorClass}"></div>`;
    }
  });

  progressHTML += '</div>';
  return progressHTML;
}

// Get items per page based on screen size
function getItemsPerPage() {
  return window.innerWidth <= 768 ? 3 : 4; // Mobile: 3 rows, Desktop: 4 rows
}

// Render paginated data
function renderPaginatedData() {
  const tableBody = document.getElementById('trackerTableBody');
  const paginationContainer = document.getElementById('trackerPagination');
  
  if (!trackerData || trackerData.length === 0) return;
  
  // Update items per page based on current screen size
  itemsPerPage = getItemsPerPage();
  
  // Calculate pagination
  const totalPages = Math.ceil(trackerData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, trackerData.length);
  const pageData = trackerData.slice(startIndex, endIndex);
  
  // Check if mobile layout should be used
  const isMobile = window.innerWidth <= 768;
  
  // Clear and populate table body
  tableBody.innerHTML = '';
  pageData.forEach(row => {
    const tr = document.createElement('tr');
    
    // Add ID column
    const idTd = document.createElement('td');
    idTd.textContent = row['ID'] || '';
    tr.appendChild(idTd);
    
    if (isMobile) {
      // Mobile: Name of Proposal column (simple text)
      const nameTd = document.createElement('td');
      nameTd.innerHTML = `<div class="proposal-name">${row['Name of Proposal'] || ''}</div>`;
      tr.appendChild(nameTd);
      
      // Mobile: Timeline row (spans both columns)
      const timelineRow = document.createElement('tr');
      timelineRow.className = 'timeline-row';
      const timelineTd = document.createElement('td');
      timelineTd.colSpan = 2;
      timelineTd.innerHTML = `<div class="proposal-timeline">${createProgressTracker(row)}</div>`;
      timelineRow.appendChild(timelineTd);
      
      tableBody.appendChild(tr);
      tableBody.appendChild(timelineRow);
    } else {
      // Desktop: Name of Proposal column (simple text)
      const nameTd = document.createElement('td');
      nameTd.textContent = row['Name of Proposal'] || '';
      tr.appendChild(nameTd);
      
      // Desktop: Status column with progress tracker
      const statusTd = document.createElement('td');
      statusTd.innerHTML = createProgressTracker(row);
      tr.appendChild(statusTd);
      tableBody.appendChild(tr);
    }
  });
  
  // Create or update pagination controls
  createPaginationControls(totalPages);
}

// Create pagination controls
function createPaginationControls(totalPages) {
  let paginationContainer = document.getElementById('trackerPagination');
  
  // Create pagination container if it doesn't exist
  if (!paginationContainer) {
    paginationContainer = document.createElement('div');
    paginationContainer.id = 'trackerPagination';
    paginationContainer.className = 'pagination-container';
    
    // Insert after the table container
    const tableContainer = document.getElementById('trackerTableContainer');
    tableContainer.parentNode.insertBefore(paginationContainer, tableContainer.nextSibling);
  }
  
  // Clear existing pagination
  paginationContainer.innerHTML = '';
  
  if (totalPages <= 1) return;
  
  // Create pagination HTML
  const paginationHTML = `
    <div class="pagination-info">
      Showing ${((currentPage - 1) * itemsPerPage) + 1}-${Math.min(currentPage * itemsPerPage, trackerData.length)} of ${trackerData.length} entries
    </div>
    <div class="pagination-controls">
      <button class="pagination-btn" onclick="goToPage(1)" ${currentPage === 1 ? 'disabled' : ''} title="First page">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.41 16.59L13.82 12l4.59-4.59L17 6l-6 6 6 6zM6 6h2v12H6z"/>
        </svg>
      </button>
      <button class="pagination-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} title="Previous page">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
        </svg>
      </button>
      <div class="pagination-pages">
        ${generatePageNumbers(totalPages)}
      </div>
      <button class="pagination-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} title="Next page">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
        </svg>
      </button>
      <button class="pagination-btn" onclick="goToPage(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''} title="Last page">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5.59 7.41L7 6l6 6-6 6-1.41-1.41L10.17 12zM18 6h2v12h-2z"/>
        </svg>
      </button>
    </div>
  `;
  
  paginationContainer.innerHTML = paginationHTML;
}

// Generate page number buttons - show only first 2, last 2 with ellipsis
function generatePageNumbers(totalPages) {
  let pagesHTML = '';
  
  if (totalPages <= 4) {
    // If 4 or fewer pages, show all
    for (let i = 1; i <= totalPages; i++) {
      pagesHTML += `<button class="pagination-page ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
  } else {
    // Always show first 2 pages
    pagesHTML += `<button class="pagination-page ${1 === currentPage ? 'active' : ''}" onclick="goToPage(1)">1</button>`;
    pagesHTML += `<button class="pagination-page ${2 === currentPage ? 'active' : ''}" onclick="goToPage(2)">2</button>`;
    
    // Add ellipsis
    pagesHTML += `<span class="pagination-ellipsis">...</span>`;
    
    // Always show last 2 pages
    pagesHTML += `<button class="pagination-page ${totalPages - 1 === currentPage ? 'active' : ''}" onclick="goToPage(${totalPages - 1})">${totalPages - 1}</button>`;
    pagesHTML += `<button class="pagination-page ${totalPages === currentPage ? 'active' : ''}" onclick="goToPage(${totalPages})">${totalPages}</button>`;
  }
  
  return pagesHTML;
}

// Go to specific page
function goToPage(page) {
  const totalPages = Math.ceil(trackerData.length / itemsPerPage);
  if (page >= 1 && page <= totalPages) {
    currentPage = page;
    renderPaginatedData();
  }
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
  const modal = document.getElementById('proposalsTrackerModal');
  if (event.target === modal) {
    closeProposalsTracker();
  }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    const modal = document.getElementById('proposalsTrackerModal');
    if (modal && modal.style.display === 'flex') {
      closeProposalsTracker();
    }
  }
});

// Handle window resize for pagination
window.addEventListener('resize', function() {
  if (trackerData && trackerData.length > 0) {
    // Reset to first page when screen size changes
    currentPage = 1;
    // Re-render with new items per page
    renderPaginatedData();
  }
});

// Budget Concepts CSV URL
const BUDGET_CONCEPTS_CSV_BASE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTX6EuJBAP0wWg1zbZlFktLkmy4_1SNapYj08StVU8-iFW7WmbI2_5te1ms_s9SuQcQvuhHm2U1e52e/pub?gid=1331387281&single=true&output=csv";

// Google Sheets CSV URL for other public proposals (specific sheet)
// Note: Replace the GID with the actual GID of the "Other Public Proposals" sheet
// To find the GID: Open the Google Sheet, click on the "Other Public Proposals" tab, and copy the GID from the URL (after #gid=)
const OTHER_PROPOSALS_CSV_BASE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTX6EuJBAP0wWg1zbZlFktLkmy4_1SNapYj08StVU8-iFW7WmbI2_5te1ms_s9SuQcQvuhHm2U1e52e/pub?gid=974581309&single=true&output=csv";

// Load data from Google Sheets for budget concepts
async function loadBudgetConceptsData() {
  const conceptsContainer = document.querySelector('#budget-concepts .concepts-container');
  
  try {
    // Add cache-busting timestamp to ensure fresh data
    const urlWithTimestamp = BUDGET_CONCEPTS_CSV_BASE_URL + "&t=" + Date.now();
    console.log('Loading budget concepts data from:', urlWithTimestamp);
    
    const response = await fetch(urlWithTimestamp);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const csvText = await response.text();
    console.log('CSV data received:', csvText.substring(0, 200) + '...');
    
    // Parse CSV data
    const data = parseCSV(csvText);
    console.log('Parsed concepts data:', data);
    
    if (data.length === 0) {
      throw new Error('No data found in the Concepts for the Budget sheet');
    }
    
    // Display the data in the concepts container
    displayBudgetConcepts(data, conceptsContainer);
    
  } catch (error) {
    console.error('Error loading budget concepts data:', error);
    conceptsContainer.innerHTML = `
      <div class="concepts-placeholder">
        <div class="placeholder-content">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
            <path d="M9 12l2 2 4-4"/>
            <path d="M21 12c.552 0 1-.448 1-1V5c0-.552-.448-1-1-1H3c-.552 0-1 .448-1 1v6c0 .552.448 1 1 1h18z"/>
            <path d="M3 13h18c.552 0 1 .448 1 1v5c0 .552-.448 1-1 1H3c-.552 0-1-.448-1-1v-5c0-.552.448-1 1-1z"/>
          </svg>
          <h3>Concepts for the Budget</h3>
          <p>This section will display budget concepts and ideas. Content will be added here as specified.</p>
        </div>
      </div>
    `;
  }
}

// Display budget concepts data
function displayBudgetConcepts(data, container) {
  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="concepts-placeholder">
        <div class="placeholder-content">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
            <path d="M9 12l2 2 4-4"/>
            <path d="M21 12c.552 0 1-.448 1-1V5c0-.552-.448-1-1-1H3c-.552 0-1 .448-1 1v6c0 .552.448 1 1 1h18z"/>
            <path d="M3 13h18c.552 0 1 .448 1 1v5c0 .552-.448 1-1 1H3c-.552 0-1-.448-1-1v-5c0-.552.448-1 1-1z"/>
          </svg>
          <h3>Concepts for the Budget</h3>
          <p>No concepts data available.</p>
        </div>
      </div>
    `;
    return;
  }
  
  // Get headers from first row
  const headers = Object.keys(data[0]);
  
  // Find the relevant columns (title, name, pdf)
  const titleColumn = headers.find(h => h.toLowerCase().includes('title') || h.toLowerCase().includes('concept'));
  const nameColumn = headers.find(h => h.toLowerCase().includes('name') || h.toLowerCase().includes('author'));
  const pdfColumn = headers.find(h => h.toLowerCase().includes('pdf') || h.toLowerCase().includes('document'));
  
  // Create cards layout
  let cardsHTML = `
    <div class="concepts-cards-container">
      <div class="concepts-cards-grid">
        ${data.map(row => {
          const title = row[titleColumn] || 'Untitled Concept';
          const name = row[nameColumn] || 'Unknown Author';
          const pdfValue = row[pdfColumn] || '';
          
          // Handle multiple PDFs
          const pdfFiles = pdfValue ? pdfValue.split(',').map(file => file.trim()).filter(file => file) : [];
          
          return `
            <div class="concept-card">
              <div class="concept-card-header">
                <h3 class="concept-title">${title}</h3>
                <p class="concept-author">${name}</p>
              </div>
              <div class="concept-card-actions">
                ${pdfFiles.length > 0 ? pdfFiles.map(file => 
                  `<a href="../assets/pdfs/${file}" target="_blank" class="concept-download-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                      <polyline points="14,2 14,8 20,8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                      <polyline points="10,9 9,9 8,9"/>
                    </svg>
                    Download
                  </a>`
                ).join('') : '<span class="no-document">No document available</span>'}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
  
  container.innerHTML = cardsHTML;
}

// ========== Other Proposals Functions ==========

// Load data from Google Sheets for other public proposals
async function loadOtherProposalsData() {
  const proposalsContainer = document.querySelector('#other-proposals .concepts-container');
  
  try {
    // Add cache-busting timestamp to ensure fresh data
    const urlWithTimestamp = OTHER_PROPOSALS_CSV_BASE_URL + "&t=" + Date.now();
    console.log('Loading other proposals data from:', urlWithTimestamp);
    
    const response = await fetch(urlWithTimestamp);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const csvText = await response.text();
    console.log('CSV data received:', csvText.substring(0, 200) + '...');
    
    // Parse CSV data
    const data = parseCSV(csvText);
    console.log('Parsed other proposals data:', data);
    
    if (data.length === 0) {
      throw new Error('No data found in the Other Public Proposals sheet');
    }
    
    // Display the data in the proposals container
    displayOtherProposals(data, proposalsContainer);
    
  } catch (error) {
    console.error('Error loading other proposals data:', error);
    proposalsContainer.innerHTML = `
      <div class="concepts-placeholder">
        <div class="placeholder-content">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
            <path d="M9 12l2 2 4-4"/>
            <path d="M21 12c.552 0 1-.448 1-1V5c0-.552-.448-1-1-1H3c-.552 0-1 .448-1 1v6c0 .552.448 1 1 1h18z"/>
            <path d="M3 13h18c.552 0 1 .448 1 1v5c0 .552-.448 1-1 1H3c-.552 0-1-.448-1-1v-5c0-.552.448-1 1-1z"/>
          </svg>
          <h3>වෙනත් අයවැය යෝජනා</h3>
          <p>To access the "Other Public Proposals" sheet:</p>
          <ol style="text-align: left; margin: 20px 0;">
            <li>Open your Google Sheet</li>
            <li>Click on the "Other Public Proposals" tab</li>
            <li>Copy the GID number from the URL (after #gid=)</li>
            <li>Update the OTHER_PROPOSALS_CSV_BASE_URL with the correct GID</li>
          </ol>
          <p><strong>Current URL:</strong> ${OTHER_PROPOSALS_CSV_BASE_URL}</p>
          <p><strong>Error:</strong> ${error.message}</p>
        </div>
      </div>
    `;
  }
}

// Display other proposals data (using same card layout as concepts)
function displayOtherProposals(data, container) {
  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="concepts-placeholder">
        <div class="placeholder-content">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
            <path d="M9 12l2 2 4-4"/>
            <path d="M21 12c.552 0 1-.448 1-1V5c0-.552-.448-1-1-1H3c-.552 0-1 .448-1 1v6c0 .552.448 1 1 1h18z"/>
            <path d="M3 13h18c.552 0 1 .448 1 1v5c0 .552-.448 1-1 1H3c-.552 0-1-.448-1-1v-5c0-.552.448-1 1-1z"/>
          </svg>
          <h3>වෙනත් අයවැය යෝජනා</h3>
          <p>No proposals data available.</p>
        </div>
      </div>
    `;
    return;
  }
  
  // Get headers from first row
  const headers = Object.keys(data[0]);
  
  // Find the relevant columns (title, organisation, link)
  const titleColumn = headers.find(h => h.toLowerCase().includes('title') || h.toLowerCase().includes('proposal'));
  const organisationColumn = headers.find(h => h.toLowerCase() === 'organisation' || h.toLowerCase() === 'organization');
  const linkColumn = headers.find(h => h.toLowerCase() === 'link' || h.toLowerCase().includes('url'));
  
  // Create cards layout (same as concepts)
  let cardsHTML = `
    <div class="concepts-cards-container">
      <div class="concepts-cards-grid">
        ${data.map(row => {
          const title = row[titleColumn] || 'Untitled Proposal';
          const organisation = row[organisationColumn] || '';
          const linkValue = row[linkColumn] || '';
          
          // Check if link is a valid URL
          const hasLink = linkValue && (linkValue.startsWith('http://') || linkValue.startsWith('https://'));
          
          return `
            <div class="concept-card">
              <div class="concept-card-header">
                <h3 class="concept-title">${title}</h3>
                ${organisation ? `<p class="concept-author">${organisation}</p>` : ''}
              </div>
              <div class="concept-card-actions">
                ${hasLink ? `
                  <a href="${linkValue}" target="_blank" rel="noopener noreferrer" class="concept-download-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                    Visit Website
                  </a>
                ` : '<span class="no-document">No link available</span>'}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
  
  container.innerHTML = cardsHTML;
}

// Tab navigation functionality
function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      
      // Remove active class from all buttons and panels
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabPanels.forEach(panel => panel.classList.remove('active'));
      
      // Add active class to clicked button and corresponding panel
      button.classList.add('active');
      const targetPanel = document.getElementById(targetTab);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
      
      // If switching to formulated proposals tab, ensure search functionality works
      if (targetTab === 'formulated-proposals') {
        // Show the results elements again
        const loading = document.getElementById('loading');
        const results = document.getElementById('results');
        const empty = document.getElementById('empty');
        
        if (loading) loading.style.display = 'none';
        if (results) results.style.display = 'grid';
        if (empty) empty.style.display = 'none';
        
        // Re-apply current search/filter state
        setTimeout(() => {
          apply();
        }, 100);
      }
      
      // If switching to budget concepts tab, load concepts data
      if (targetTab === 'budget-concepts') {
        // Hide any loading states or search results
        const loading = document.getElementById('loading');
        const results = document.getElementById('results');
        const empty = document.getElementById('empty');
        
        if (loading) loading.style.display = 'none';
        if (results) results.style.display = 'none';
        if (empty) empty.style.display = 'none';
        
        // Load budget concepts data
        loadBudgetConceptsData();
      }
      
      // If switching to other proposals tab, load other proposals data
      if (targetTab === 'other-proposals') {
        // Hide any loading states or search results
        const loading = document.getElementById('loading');
        const results = document.getElementById('results');
        const empty = document.getElementById('empty');
        
        if (loading) loading.style.display = 'none';
        if (results) results.style.display = 'none';
        if (empty) empty.style.display = 'none';
        
        // Load other proposals data
        loadOtherProposalsData();
      }
    });
  });
}

// Mobile Read More functionality
function toggleDescription() {
  const heroContent = document.querySelector('.hero-content');
  const readMoreText = document.querySelector('.read-more-text');
  const readLessText = document.querySelector('.read-less-text');
  
  heroContent.classList.toggle('expanded');
  
  if (heroContent.classList.contains('expanded')) {
    readMoreText.style.display = 'none';
    readLessText.style.display = 'inline';
  } else {
    readMoreText.style.display = 'inline';
    readLessText.style.display = 'none';
  }
}

// Initialize tab navigation when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  init();
  initializeTabs();
});
