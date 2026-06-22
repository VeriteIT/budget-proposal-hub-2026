from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from sentence_transformers import SentenceTransformer
from pinecone import Pinecone
import os
import logging
import json

# Get Pinecone API key from environment variables
PINECONE_API_KEY = os.getenv('PINECONE_API_KEY')

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Validate API key
if not PINECONE_API_KEY:
    raise ValueError("PINECONE_API_KEY environment variable is required")

# Initialize Pinecone
pc = Pinecone(api_key=PINECONE_API_KEY)
# Configuration
# Index names for different models
INDEX_NAME_EN = "budget-proposals-optimized"  # 384 dimensions for all-MiniLM-L6-v2 (English documents)
INDEX_NAME_MULTILINGUAL = "budget-proposals-embeddinggemma"  # 768 dimensions for EmbeddingGemma (Sinhala/Tamil)

# Load embedding models - Hybrid approach for better performance
# English: all-MiniLM-L6-v2 (better domain understanding)
# Sinhala/Tamil: EmbeddingGemma-300m (better multilingual support)
import os
import re
import google.generativeai as genai
from huggingface_hub import login

# Login to Hugging Face if token is available (for EmbeddingGemma)
hf_token = os.getenv('HF_TOKEN')
if hf_token:
    login(token=hf_token)

# Configure Gemini for transliteration
gemini_api_key = os.getenv('GEMINI_API_KEY')
if gemini_api_key:
    genai.configure(api_key=gemini_api_key)
    gemini_model = genai.GenerativeModel('gemini-2.5-flash')

# Load both models
embed_model_en = SentenceTransformer("all-MiniLM-L6-v2")
embed_model_multilingual = SentenceTransformer("google/embeddinggemma-300m")

def get_embedding_model(language):
    """Get the appropriate embedding model based on language"""
    if language == 'en':
        return embed_model_en
    else:  # si, ta, or any other language
        return embed_model_multilingual

def contains_sinhala_roman(text):
    """Check if text contains Roman Sinhala patterns"""
    # Common Roman Sinhala patterns
    sinhala_roman_patterns = [
        r'\b[a-z]+[aeiou][a-z]*\b',  # Basic Sinhala roman patterns
        r'\b(ma|ta|ka|ga|cha|ja|da|tha|pa|ba|ya|ra|la|wa|sa|ha|na|mata|kata|gata)\b',  # Common words
    ]
    
    for pattern in sinhala_roman_patterns:
        if re.search(pattern, text.lower()):
            return True
    return False

def contains_tamil_roman(text):
    """Check if text contains Roman Tamil patterns"""
    # Common Roman Tamil patterns
    tamil_roman_patterns = [
        r'\b[a-z]+[aeiou][a-z]*\b',  # Basic Tamil roman patterns
        r'\b(amma|appa|akka|anna|thambi|thangai|paapa|amma|appa|akka|anna|thambi|thangai|paapa)\b',  # Common Tamil words
        r'\b(naan|neenga|avan|aval|adhu|idhu|edhu|yaaru|eppadi|enna|yaen|kaalam|vaaram|maasam|varusham)\b',  # Tamil pronouns/words
    ]
    
    for pattern in tamil_roman_patterns:
        if re.search(pattern, text.lower()):
            return True
    return False

def transliterate_sinhala_roman_to_sinhala(text):
    """Use Gemini to convert Roman Sinhala to Sinhala script with enhanced context"""
    if not gemini_api_key or not contains_sinhala_roman(text):
        return text
    
    try:
        prompt = f"""You are a language expert specializing in Sri Lankan languages. Convert this Roman Sinhala text (Sinhala words written in English letters) to proper Sinhala script.

IMPORTANT CONTEXT:
- This is for a Sri Lankan budget proposals search system
- The user is likely searching for government policies, economic proposals, or budget information
- Use formal Sinhala appropriate for policy discussions
- Only convert if it's actually Sinhala words in Roman script
- If it's English or other language, return as is
- Be accurate with Sri Lankan Sinhala terminology

Text to convert: "{text}"

Converted Sinhala script:"""
        
        response = gemini_model.generate_content(prompt)
        result = response.text.strip()
        
        # Clean up the response - remove any extra text that might be added
        if result and len(result) > 0:
            # Remove common prefixes that Gemini might add
            result = result.replace("Converted Sinhala script:", "").strip()
            result = result.replace("Sinhala script:", "").strip()
            return result
        else:
            return text
            
    except Exception as e:
        logger.warning(f"Sinhala transliteration failed: {e}")
        return text

def transliterate_tamil_roman_to_tamil(text):
    """Use Gemini to convert Roman Tamil to Tamil script with enhanced context"""
    if not gemini_api_key or not contains_tamil_roman(text):
        return text
    
    try:
        prompt = f"""You are a language expert specializing in Sri Lankan languages. Convert this Roman Tamil text (Tamil words written in English letters) to proper Tamil script.

IMPORTANT CONTEXT:
- This is for a Sri Lankan budget proposals search system
- The user is likely searching for government policies, economic proposals, or budget information
- Use formal Tamil appropriate for policy discussions
- Use Sri Lankan Tamil dialect and terminology
- Only convert if it's actually Tamil words in Roman script
- If it's English or other language, return as is
- Be accurate with Sri Lankan Tamil terminology and context

Text to convert: "{text}"

Converted Tamil script:"""
        
        response = gemini_model.generate_content(prompt)
        result = response.text.strip()
        
        # Clean up the response - remove any extra text that might be added
        if result and len(result) > 0:
            # Remove common prefixes that Gemini might add
            result = result.replace("Converted Tamil script:", "").strip()
            result = result.replace("Tamil script:", "").strip()
            return result
        else:
            return text
            
    except Exception as e:
        logger.warning(f"Tamil transliteration failed: {e}")
        return text

def preprocess_query(query, language):
    """Preprocess query with transliteration if needed"""
    if language == 'si' and contains_sinhala_roman(query):
        logger.info(f"Transliterating Roman Sinhala: {query}")
        transliterated = transliterate_sinhala_roman_to_sinhala(query)
        logger.info(f"Transliterated to: {transliterated}")
        return transliterated
    elif language == 'ta' and contains_tamil_roman(query):
        logger.info(f"Transliterating Roman Tamil: {query}")
        transliterated = transliterate_tamil_roman_to_tamil(query)
        logger.info(f"Transliterated to: {transliterated}")
        return transliterated
    return query

# Load dynamic metadata
def load_dynamic_metadata():
    """Load metadata from dynamic_metadata.json"""
    try:
        if os.path.exists("dynamic_metadata.json"):
            with open("dynamic_metadata.json", 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Error loading dynamic metadata: {e}")
    return {}

# Load dynamic metadata (will be reloaded on each request)
DYNAMIC_METADATA = load_dynamic_metadata()

def get_language_specific_data(proposal_data, field, language='en'):
    """Get language-specific data from proposal metadata"""
    # If it's the old format (single language), return as-is
    if isinstance(proposal_data.get(field), str):
        return proposal_data.get(field, '')
    
    # If it's the new multi-language format, return language-specific data
    if isinstance(proposal_data.get(field), dict):
        # Only return data for the requested language, no fallback
        return proposal_data.get(field, {}).get(language, '')
    
    return ''

def get_pinecone_index(language='en'):
    """Get the appropriate Pinecone index based on language"""
    try:
        if language == 'en':
            return pc.Index(INDEX_NAME_EN)
        else:  # si, ta, or any other language
            return pc.Index(INDEX_NAME_MULTILINGUAL)
    except Exception as e:
        logger.error(f"Error accessing Pinecone index: {e}")
        return None

def semantic_search(query: str, top_k=1, category_filter=None, language='en'):
    """Perform semantic search on budget proposals with multi-language support"""
    try:
        # Reload metadata to get latest updates
        global DYNAMIC_METADATA
        DYNAMIC_METADATA = load_dynamic_metadata()
        
        # Preprocess query with transliteration if needed
        original_query = query
        query = preprocess_query(query, language)
        
        pc_index = get_pinecone_index(language)
        if not pc_index:
            return []
        
        # Use language-specific embedding model
        model = get_embedding_model(language)
        query_emb = model.encode(query).tolist()
        
        # Build filter if category is specified
        filter_dict = {"source": "budget_proposals"}
        if category_filter and category_filter != "All categories":
            filter_dict["category"] = category_filter
        
        # Get more results to find relevant documents
        res = pc_index.query(
            vector=query_emb, 
            top_k=50,  # Get more results to find relevant documents
            include_metadata=True,
            filter=filter_dict
        )

        # Track the best score for each unique document
        best_scores = {}  # file_path -> best_score
        
        for match in res["matches"]:
            metadata = match["metadata"]
            score = match["score"]
            file_path = metadata.get("file_path", "")
            
            # Keep track of the best score for each document
            if file_path not in best_scores or score > best_scores[file_path]:
                best_scores[file_path] = score
        
        # Debug logging for duplicate investigation
        if query.lower() == "quality industrial zone":
            logger.info(f"Debug - Query: {query}")
            logger.info(f"Debug - Total matches from Pinecone: {len(res['matches'])}")
            logger.info(f"Debug - Unique documents after deduplication: {len(best_scores)}")
            logger.info(f"Debug - Document scores: {list(best_scores.items())[:5]}")
            for file_path, score in list(best_scores.items())[:3]:
                logger.info(f"Debug - Document: {file_path}, Score: {score}")
        
        if not best_scores:
            return []
        
        # Sort documents by their best scores
        sorted_docs = sorted(best_scores.items(), key=lambda x: x[1], reverse=True)
        
        # Determine how many documents to return based on query specificity
        max_score = sorted_docs[0][1]  # Best score
        
        # If the best score is very high (>0.6), it's a specific query - show fewer results
        # If the best score is moderate (0.3-0.6), it's a medium query - show some results
        # If the best score is low (<0.3), it's a broad query - show more results
        if max_score > 0.6:
            # Specific query - show 1-2 documents
            threshold = max_score * 0.8  # Show documents within 80% of best score
            max_docs = 2
        elif max_score > 0.3:
            # Medium query - show 2-3 documents
            threshold = max_score * 0.7  # Show documents within 70% of best score
            max_docs = 3
        else:
            # Broad query - show 3-5 documents
            threshold = max_score * 0.5  # Show documents within 50% of best score
            max_docs = 5
        
        # Create a lookup dictionary for efficient metadata retrieval
        # Store the match with the highest score for each file_path
        metadata_lookup = {}
        for match in res["matches"]:
            file_path_key = match["metadata"].get("file_path", "")
            score = match["score"]
            
            # Only store if this is the first match for this file_path or if it has a higher score
            if file_path_key not in metadata_lookup or score > metadata_lookup[file_path_key]["score"]:
                metadata_lookup[file_path_key] = match
        
        results = []
        doc_count = 0
        
        for file_path, score in sorted_docs:
            if doc_count >= max_docs or score < threshold:
                break
            
            # Get the metadata for this document using the lookup
            if file_path in metadata_lookup:
                match = metadata_lookup[file_path]
                metadata = match["metadata"]
                
                # Use the DYNAMIC_METADATA mapping if available, otherwise use metadata
                proposal_data = DYNAMIC_METADATA.get(file_path, {
                    "title": metadata.get("title", "Unknown Title"),
                    "summary": metadata.get("summary", ""),
                    "category": metadata.get("category", "Budget Proposal"),
                    "costLKR": metadata.get("costLKR", "No Costing Available")
                })
                
                # Get language-specific data
                title = get_language_specific_data(proposal_data, "title", language)
                summary = get_language_specific_data(proposal_data, "summary", language)
                costLKR = get_language_specific_data(proposal_data, "costLKR", language)
                category = get_language_specific_data(proposal_data, "category", language)
                thumb_url = metadata.get("thumbUrl", "")
                
                # Only include documents that have meaningful content in the requested language
                # Skip documents where title and summary are empty or "Unknown"/"No summary available"
                if (title and title.strip() and title not in ["Unknown", "Unknown Title", ""] and
                    summary and summary.strip() and summary not in ["No summary available", ""]):
                    
                    result = {
                        "title": title,
                        "summary": summary,
                        "costLKR": costLKR,
                        "category": category,
                        "badge": proposal_data.get("badge", ""),  # Add badge field
                        "pdfUrl": f"assets/pdfs/{file_path}" if file_path else "",
                        "thumbUrl": f"assets/thumbs/{thumb_url}" if thumb_url else "",
                        "score": score,
                        "relevance_percentage": int(score * 100),
                        "file_path": file_path,
                        "id": match["id"],
                        "content": metadata.get("content", "")  # Add the actual content
                    }
                    
                    results.append(result)
                    doc_count += 1
        
        # Debug logging for final results
        if query.lower() == "quality industrial zone":
            logger.info(f"Debug - Final results count: {len(results)}")
            for i, result in enumerate(results):
                logger.info(f"Debug - Result {i+1}: {result.get('title', 'No title')} - {result.get('file_path', 'No path')}")
        
        return results
    except Exception as e:
        logger.error(f"Search error: {e}")
        return []

def get_all_proposals(category_filter=None, language='en'):
    """Get all budget proposals with multi-language support"""
    try:
        # Reload metadata to get latest updates
        global DYNAMIC_METADATA
        DYNAMIC_METADATA = load_dynamic_metadata()
        
        logger.info(f"Getting all proposals for language: {language}, category_filter: {category_filter}")
        
        results = []
        
        # Iterate through all files in DYNAMIC_METADATA to ensure we get everything
        for file_path, proposal_data in DYNAMIC_METADATA.items():
            # Get language-specific data
            title = get_language_specific_data(proposal_data, "title", language)
            summary = get_language_specific_data(proposal_data, "summary", language)
            costLKR = get_language_specific_data(proposal_data, "costLKR", language)
            category = get_language_specific_data(proposal_data, "category", language)
            thumb_url = proposal_data.get("thumbUrl", "")
            
            # Only include documents that have meaningful content in the requested language
            # Skip documents where title and summary are empty or "Unknown"/"No summary available"
            if (title and title.strip() and title not in ["Unknown", "Unknown Title", ""] and
                summary and summary.strip() and summary not in ["No summary available", ""]):
                
                # Apply category filter if specified
                if category_filter and category_filter != "All categories":
                    if category != category_filter:
                        continue
                
                result = {
                    "title": title,
                    "summary": summary,
                    "costLKR": costLKR,
                    "category": category,
                    "badge": proposal_data.get("badge", ""),  # Add badge field
                    "pdfUrl": f"assets/pdfs/{file_path}" if file_path else "",
                    "thumbUrl": f"assets/thumbs/{thumb_url}" if thumb_url else "",
                    "score": 1.0,  # Default score for all proposals
                    "relevance_percentage": 100,
                    "file_path": file_path,
                    "id": f"{file_path}_all_proposals"  # Generate a consistent ID
                }
                
                results.append(result)
        
        logger.info(f"Returning {len(results)} proposals for language {language}")
        return results
        
    except Exception as e:
        logger.error(f"Error getting all proposals: {e}")
        return []

@app.route('/api/search', methods=['POST'])
def search_proposals():
    """API endpoint for searching budget proposals with multi-language support"""
    try:
        data = request.get_json()
        query = data.get('query', '').strip()
        top_k = data.get('top_k', 10)
        category_filter = data.get('category_filter')
        language = data.get('language', 'en')  # Default to English
        
        if not query:
            # If no query, return all proposals
            results = get_all_proposals(category_filter, language)
        else:
            results = semantic_search(query, top_k, category_filter, language)
        
        return jsonify({
            "query": query,
            "results": results,
            "total_results": len(results),
            "category_filter": category_filter,
            "language": language
        })
    
    except Exception as e:
        logger.error(f"API error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/search', methods=['GET'])
def search_proposals_get():
    """API endpoint for searching proposals (GET method) with multi-language support"""
    try:
        query = request.args.get('query', '').strip()
        top_k = int(request.args.get('top_k', 10))
        category_filter = request.args.get('category_filter')
        language = request.args.get('language', 'en')  # Default to English
        
        if not query:
            # If no query, return all proposals
            results = get_all_proposals(category_filter, language)
        else:
            results = semantic_search(query, top_k, category_filter, language)
        
        return jsonify({
            "query": query,
            "results": results,
            "total_results": len(results),
            "category_filter": category_filter,
            "language": language
        })
    
    except Exception as e:
        logger.error(f"API error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/proposals', methods=['GET'])
def get_proposals():
    """Get all budget proposals with multi-language support"""
    try:
        category_filter = request.args.get('category_filter')
        language = request.args.get('language', 'en')  # Default to English
        results = get_all_proposals(category_filter, language)
        
        return jsonify({
            "results": results,
            "total_results": len(results),
            "category_filter": category_filter,
            "language": language
        })
    
    except Exception as e:
        logger.error(f"API error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/categories', methods=['GET'])
def get_categories():
    """Get all available categories"""
    try:
        # Get categories directly from dynamic metadata for reliability
        categories = set()
        for file_path, metadata in DYNAMIC_METADATA.items():
            category = metadata.get("category")
            if category:
                # Handle both string and dict formats
                if isinstance(category, dict):
                    # Extract English category from dict
                    category = category.get("en", "")
                if category:
                    categories.add(category)
        
        # If no categories from metadata, fallback to Pinecone
        if not categories:
            all_proposals = get_all_proposals()
            for proposal in all_proposals:
                category = proposal.get("category")
                if category:
                    categories.add(category)
        
        return jsonify({
            "categories": sorted(list(categories))
        })
    
    except Exception as e:
        logger.error(f"API error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        pc_index = get_pinecone_index()
        if pc_index:
            stats = pc_index.describe_index_stats()
            return jsonify({
                "status": "healthy", 
                "message": "Budget proposals semantic search API is running",
                "index_stats": {
                    "total_vector_count": stats.total_vector_count,
                    "dimension": stats.dimension,
                    "index_fullness": stats.index_fullness
                }
            })
        else:
            return jsonify({
                "status": "unhealthy",
                "message": "Cannot connect to Pinecone index"
            }), 500
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "message": f"Error: {str(e)}"
        }), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get index statistics"""
    try:
        pc_index = get_pinecone_index()
        if not pc_index:
            return jsonify({"error": "Cannot connect to Pinecone index"}), 500
        
        stats = pc_index.describe_index_stats()
        return jsonify({
            "total_vector_count": stats.total_vector_count,
            "dimension": stats.dimension,
            "index_fullness": stats.index_fullness
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    """Serve static assets like badge images"""
    try:
        # Check if the file exists in the Budget_Proposals copy-2/assets directory
        assets_dir = os.path.join("Budget_Proposals copy-2", "assets")
        if os.path.exists(os.path.join(assets_dir, filename)):
            return send_from_directory(assets_dir, filename)
        else:
            # Fallback to current directory assets
            return send_from_directory("assets", filename)
    except Exception as e:
        logger.error(f"Error serving asset {filename}: {e}")
        return jsonify({"error": f"Asset not found: {filename}"}), 404

@app.route('/', methods=['GET'])
def home():
    """Home endpoint with API documentation"""
    return jsonify({
        "message": "Budget Proposals Semantic Search API",
        "version": "1.0.0",
        "endpoints": {
            "POST /api/search": "Search proposals with JSON body",
            "GET /api/search?query=<search_term>": "Search proposals with query parameter",
            "GET /api/proposals": "Get all proposals",
            "GET /api/categories": "Get all categories",
            "GET /api/health": "Health check",
            "GET /api/stats": "Index statistics"
        },
        "status": "running"
    })

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=7860)
