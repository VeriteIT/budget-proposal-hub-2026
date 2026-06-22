#!/usr/bin/env python3
"""
Enhanced Budget Proposals Chatbot API using LangChain with Memory and Agentic RAG
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import logging
import json
from datetime import datetime
from typing import Dict, List, Any

# LangChain imports
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.memory import ConversationBufferWindowMemory
from langchain.schema import HumanMessage, AIMessage
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import LLMChain
from langchain_community.chat_message_histories import RedisChatMessageHistory
from langchain.tools import Tool
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain.agents.openai_functions_agent.base import OpenAIFunctionsAgent
from langchain.schema import BaseMessage

# Vector database imports
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer

# Language detection imports
import re
import requests
import json

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure Gemini
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    logger.error("GEMINI_API_KEY not found in environment variables")
    raise ValueError("Please set GEMINI_API_KEY in your .env file")

# Configure Pinecone
PINECONE_API_KEY = os.getenv('PINECONE_API_KEY')
if not PINECONE_API_KEY:
    logger.error("PINECONE_API_KEY not found in environment variables")
    raise ValueError("Please set PINECONE_API_KEY in your .env file")

# Configure Hugging Face (optional - needed for some models)
HF_TOKEN = os.getenv('HUGGINGFACE_TOKEN')
if HF_TOKEN:
    logger.info("Hugging Face token found - will use for model downloads")
else:
    logger.warning("HUGGINGFACE_TOKEN not found - some models may not work")

# Initialize Pinecone and embedding model - Using all-MiniLM model only
pc = Pinecone(api_key=PINECONE_API_KEY)
BUDGET_INDEX_NAME = "budget-proposals-optimized"  # Index for all-MiniLM model

# Initialize all-MiniLM model (no HF token needed)
embed_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
logger.info("✅ all-MiniLM model loaded successfully")

# Initialize LangChain components
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=GEMINI_API_KEY,
    temperature=0.7,
    max_tokens=2000  # Increased for longer Sinhala responses
)

# Simplified initialization - Let Gemini handle everything
logger.info("Using Gemini for all language processing (transliteration, translation, responses)")

def detect_sinhala_content(text: str) -> bool:
    """Detect if text contains Sinhala characters"""
    # Sinhala Unicode range: U+0D80 to U+0DFF
    sinhala_pattern = re.compile(r'[\u0D80-\u0DFF]')
    return bool(sinhala_pattern.search(text))

def detect_tamil_content(text: str) -> bool:
    """Detect if text contains Tamil characters"""
    # Tamil Unicode range: U+0B80 to U+0BFF
    tamil_pattern = re.compile(r'[\u0B80-\u0BFF]')
    return bool(tamil_pattern.search(text))

def simple_detect_language(text: str) -> Dict[str, Any]:
    """Simplified language detection with Tamil support - let Gemini handle the complexity"""
    try:
        # Check for Sinhala Unicode first (most reliable)
        has_sinhala_unicode = detect_sinhala_content(text)
        if has_sinhala_unicode:
            return {
                'language': 'si',
                'confidence': 0.95,
                'is_sinhala_unicode': True,
                'is_tamil_unicode': False,
                'is_romanized_sinhala': False,
                'is_english': False,
                'detection_method': 'unicode_detection'
            }
        
        # Check for Tamil Unicode
        has_tamil_unicode = detect_tamil_content(text)
        if has_tamil_unicode:
            return {
                'language': 'ta',
                'confidence': 0.95,
                'is_sinhala_unicode': False,
                'is_tamil_unicode': True,
                'is_romanized_sinhala': False,
                'is_english': False,
                'detection_method': 'unicode_detection'
            }
        
        # Use enhanced rule-based detection for Singlish
        return enhanced_rule_based_detection(text)
        
    except Exception as e:
        logger.error(f"Language detection failed: {e}")
        return rule_based_language_detection(text)

def enhanced_rule_based_detection(text: str) -> Dict[str, Any]:
    """Enhanced rule-based detection with Singlish and Romanized Tamil recognition"""
    has_sinhala_unicode = detect_sinhala_content(text)
    has_tamil_unicode = detect_tamil_content(text)
    is_romanized_sinhala = detect_singlish(text) and not has_sinhala_unicode and not has_tamil_unicode
    is_romanized_tamil = detect_romanized_tamil(text) and not has_sinhala_unicode and not has_tamil_unicode and not is_romanized_sinhala
    
    # More sophisticated Singlish detection
    if not has_sinhala_unicode and not is_romanized_sinhala:
        # Check for common Sinhala sentence patterns in English letters
        sinhala_patterns = [
            r'\b(mokadda|kohomada|api|oya|mama)\b',
            r'\b(eka|meka|thiyenne|kiyala)\b',
            r'\b(gana|genna|danna|karanna)\b',
            r'\b(budget|proposal).*\b(gana|eka)\b'
        ]
        
        text_lower = text.lower()
        pattern_matches = sum(1 for pattern in sinhala_patterns if re.search(pattern, text_lower))
        
        if pattern_matches >= 2:  # More conservative threshold to avoid false positives
            is_romanized_sinhala = True
    
    if has_sinhala_unicode:
        language_code = 'si'
        confidence = 0.9
    elif has_tamil_unicode:
        language_code = 'ta'
        confidence = 0.9
    elif is_romanized_sinhala:
        language_code = 'singlish'
        confidence = 0.8
    elif is_romanized_tamil:
        language_code = 'romanized_tamil'
        confidence = 0.8
    else:
        language_code = 'en'
        confidence = 0.7
    
    return {
        'language': language_code,
        'confidence': confidence,
        'is_sinhala_unicode': has_sinhala_unicode,
        'is_tamil_unicode': has_tamil_unicode,
        'is_romanized_sinhala': is_romanized_sinhala,
        'is_romanized_tamil': is_romanized_tamil,
        'is_english': language_code == 'en',
        'detection_method': 'enhanced_rule_based'
    }

def rule_based_language_detection(text: str) -> Dict[str, Any]:
    """Fallback rule-based language detection with Tamil and Romanized Tamil support"""
    has_sinhala_unicode = detect_sinhala_content(text)
    has_tamil_unicode = detect_tamil_content(text)
    is_romanized_sinhala = detect_singlish(text) and not has_sinhala_unicode and not has_tamil_unicode
    is_romanized_tamil = detect_romanized_tamil(text) and not has_sinhala_unicode and not has_tamil_unicode and not is_romanized_sinhala
    is_english = not has_sinhala_unicode and not has_tamil_unicode and not is_romanized_sinhala and not is_romanized_tamil
    
    if has_sinhala_unicode:
        language_code = 'si'
    elif has_tamil_unicode:
        language_code = 'ta'
    elif is_romanized_sinhala:
        language_code = 'singlish'
    elif is_romanized_tamil:
        language_code = 'romanized_tamil'
    else:
        language_code = 'en'
    
    return {
        'language': language_code,
        'confidence': 0.8,  # Default confidence for rule-based
        'is_sinhala_unicode': has_sinhala_unicode,
        'is_tamil_unicode': has_tamil_unicode,
        'is_romanized_sinhala': is_romanized_sinhala,
        'is_romanized_tamil': is_romanized_tamil,
        'is_english': is_english,
        'detection_method': 'rule_based'
    }

def detect_singlish(text: str) -> bool:
    """Detect common Singlish patterns and words"""
    singlish_words = [
        'mokadda', 'kohomada', 'api', 'oya', 'mama', 'eka', 'meka', 'oya', 'dan', 'kiyala',
        'karan', 'karanna', 'gana', 'genna', 'danna', 'ahala', 'denna',
        'mata', 'ape', 'wage', 'wenas', 'thiyenne', 'kiyanawa', 'balanawa', 'pennanna',
        'sampura', 'mudal', 'pasal', 'vyaparayak', 'rajaye', 'arthikaya', 'sammandala',
        'kara', 'karanna', 'giya', 'yanawa', 'enawa', 'gihin', 'awe', 'nane', 'inne',
        'danna', 'kiyanna', 'balanna', 'ganna', 'denna', 'yanna', 'enna'
    ]
    
    # Convert to lowercase and check for common Singlish words
    text_lower = text.lower()
    singlish_word_count = sum(1 for word in singlish_words if word in text_lower)
    
    # Consider it Singlish if it has 3 or more Singlish words (more conservative)
    return singlish_word_count >= 3

def detect_romanized_tamil(text: str) -> bool:
    """Detect common Romanized Tamil patterns and words (Tamil written in English letters)"""
    romanized_tamil_words = [
        # Common Tamil words in Roman script
        'enna', 'epdi', 'enga', 'yaar', 'naa', 'nee', 'avar', 'ivan', 'ival', 'ithu', 'athu',
        'vandhu', 'ponga', 'vanga', 'sollu', 'kelu', 'paaru', 'irukku', 'irukkanga', 'irundhu',
        'seiya', 'panna', 'mudiyum', 'mudiyathu', 'venum', 'vendam', 'puriyuthu', 'puriyala',
        'nalla', 'ketta', 'romba', 'konjam', 'neraya', 'kammi', 'adhikam', 'thaan', 'daan',
        # Budget/government related Tamil terms (excluding common English words)
        'sarkar', 'arasaangam', 'vyavasai', 'panam', 'kaasu', 'thogai',
        'nilai', 'mari', 'maatram', 'thiruththam', 'yojana', 'thittam', 'mudhal', 'selavu',
        'varumanam', 'aayam', 'viduli'
    ]
    
    # Convert to lowercase and check for common Romanized Tamil words
    text_lower = text.lower()
    tamil_word_count = sum(1 for word in romanized_tamil_words if word in text_lower)
    
    # Consider it Romanized Tamil if it has 3 or more Tamil words (more conservative)
    return tamil_word_count >= 3

# Removed: AI transliteration and Google Translate functions
# Gemini will handle all transliteration and translation needs

def simple_process_input(user_message: str) -> tuple:
    """
    Simplified input processing - let Gemini handle everything
    """
    # Step 1: Simple language detection
    language_info = simple_detect_language(user_message)
    original_language = language_info['language']
    confidence = language_info['confidence']
    detection_method = language_info['detection_method']
    
    logger.info(f"Language detection: {original_language} (confidence: {confidence:.2f}, method: {detection_method})")
    
    # Use original message for all processing - Gemini will handle the rest
    processed_message = user_message
    needs_translation = False  # Gemini handles translation internally
    transliteration_used = False  # Gemini handles transliteration internally
    ai_detection_used = detection_method == 'ai'
    
    logger.info(f"Input processing: keeping original '{user_message}' for Gemini to handle")
    
    return processed_message, original_language, needs_translation, transliteration_used, ai_detection_used, confidence

# Removed: translate_response_if_needed function
# Gemini handles all language responses automatically

def get_pinecone_index():
    """Get the Pinecone index - single index for all languages"""
    try:
        return pc.Index(BUDGET_INDEX_NAME)
    except Exception as e:
        logger.error(f"Error accessing Pinecone index: {e}")
        return None

def get_embedding_model():
    """Get the embedding model - single model for all languages"""
    return embed_model

def search_budget_proposals(query: str) -> str:
    """Search budget proposals using all-MiniLM model for all languages"""
    try:
        # Detect language for logging and result filtering
        language_info = simple_detect_language(query)
        detected_language = language_info.get('language', 'en')
        
        logger.info(f"Detected language: {detected_language} for query: {query[:50]}...")
        
        # Get index and model (single model for all languages)
        index = get_pinecone_index()
        if not index:
            return "Error: Could not access vector database."
        
        # Use all-MiniLM model for all languages
        model = get_embedding_model()
        query_embedding = model.encode(query).tolist()
        
        logger.info(f"Using all-MiniLM model for {detected_language}")
        
        # Query the vector database directly
        search_results = index.query(
            vector=query_embedding,
            top_k=5,
            include_metadata=True
        )
        
        matches = search_results.get('matches', [])
        
        # Debug: Log what we're getting from the vector database
        logger.info(f"Vector DB returned {len(matches)} results")
        if matches:
            sample_match = matches[0]
            logger.info(f"Sample match metadata keys: {list(sample_match.get('metadata', {}).keys())}")
        
        if not matches:
            return "No relevant budget proposals found in the database."
        
        # Build context from vector database results, filtering by language
        context_parts = []
        language_specific_matches = []
        
        # Filter matches to only include English documents
        english_matches = []
        for match in matches:
            metadata = match.get('metadata', {})
            file_path = metadata.get('file_path', '')
            
            # Only include English documents (no language suffixes)
            is_english_document = not any(lang in file_path.lower() for lang in ['_sin_', '_tam_', '-sin', '-tam', 'sinhala', 'tamil', 'si/', 'ta/'])
            
            if is_english_document:
                english_matches.append(match)
        
        # Use English matches only, or fallback to top match if no English documents found
        if english_matches:
            language_specific_matches = english_matches[:1]  # Take only the most relevant English document
        else:
            language_specific_matches = matches[:1]  # Fallback to any document if no English found
        
        logger.info(f"Returning {len(language_specific_matches)} most relevant document(s) for {detected_language}")
        
        for match in language_specific_matches:
            metadata = match.get('metadata', {})
            score = match.get('score', 0)
            
            file_path = metadata.get('file_path', '')
            category = metadata.get('category', '')
            title = metadata.get('title', '')
            content = metadata.get('content', '')
            summary = metadata.get('summary', '')
            cost = metadata.get('costLKR', '')
            
            # Include relevance score for debugging
            context_parts.append(f"From {file_path} ({category}) [Relevance: {score:.3f}]: {title}")
            
            # Prioritize content over summary, but include both if available
            if content and len(content.strip()) > 50:  # Only use substantial content
                context_parts.append(f"Content: {content}")
            elif summary:
                context_parts.append(f"Summary: {summary}")
            
            # Always include cost information if available
            if cost and cost != "No Costing Available":
                context_parts.append(f"Cost: {cost}")
            
            # Add any additional relevant fields from metadata
            if metadata.get('implementation_period'):
                context_parts.append(f"Implementation Period: {metadata.get('implementation_period')}")
            if metadata.get('beneficiaries'):
                context_parts.append(f"Beneficiaries: {metadata.get('beneficiaries')}")
            if metadata.get('revenue_impact'):
                context_parts.append(f"Revenue Impact: {metadata.get('revenue_impact')}")
            if metadata.get('proposal_type'):
                context_parts.append(f"Proposal Type: {metadata.get('proposal_type')}")
            if metadata.get('sector'):
                context_parts.append(f"Sector: {metadata.get('sector')}")
        
        return "\n\n".join(context_parts)
        
    except Exception as e:
        logger.error(f"Error searching vector database: {e}")
        return f"Error searching database: {str(e)}"

# Create the RAG tool
search_tool = Tool(
    name="search_budget_proposals",
    description="Search for relevant budget proposals in the vector database. Use this when you need specific information about budget proposals, costs, policies, or implementation details.",
    func=search_budget_proposals
)

# Create the prompt template for the agent
agent_prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a helpful assistant for budget proposals in Sri Lanka. You have access to a vector database containing detailed information about various budget proposals. You can communicate in English, Sinhala, and understand Singlish (Sinhala written in English letters).

When a user asks about budget proposals, you should:
1. Use the search_budget_proposals tool to find relevant information
2. Provide accurate, detailed responses based on the retrieved information
3. Reference proposals by their content/topic, not by filename
4. Be professional but approachable in any language
5. If the search doesn't return relevant results, acknowledge this and provide general guidance
6. Respond in the same language or style as the user's question when possible

Guidelines:
- Always use the search tool for specific questions about budget proposals
- When mentioning proposals, refer to them by topic (e.g., "maternity leave benefits proposal", "EPF tax removal proposal") rather than document filenames
- Keep responses clear and informative in any language
- Use a balanced tone - helpful but not overly casual
- If asked about topics not covered, redirect to relevant topics professionally
- Be culturally sensitive when discussing Sri Lankan policies and economic matters
- When responding in Sinhala, use appropriate formal language for policy discussions
- DO NOT include long document filenames in your responses - refer to proposals by their topic instead"""),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad")
])

# Store conversation memories for different sessions
conversation_memories: Dict[str, ConversationBufferWindowMemory] = {}

def get_or_create_memory(session_id: str) -> ConversationBufferWindowMemory:
    """Get or create a memory instance for a session"""
    if session_id not in conversation_memories:
        # Create new memory with window of 10 messages (5 exchanges)
        conversation_memories[session_id] = ConversationBufferWindowMemory(
            k=10,  # Remember last 10 messages
            return_messages=True,
            memory_key="chat_history"
        )
        logger.info(f"Created new memory for session: {session_id}")
    
    return conversation_memories[session_id]

def create_agent(session_id: str) -> AgentExecutor:
    """Create a LangChain agent with memory and RAG capabilities"""
    memory = get_or_create_memory(session_id)
    
    # Create the agent
    agent = create_openai_functions_agent(
        llm=llm,
        tools=[search_tool],
        prompt=agent_prompt
    )
    
    # Create agent executor with memory
    agent_executor = AgentExecutor(
        agent=agent,
        tools=[search_tool],
        memory=memory,
        verbose=False,
        handle_parsing_errors=True
    )
    
    return agent_executor

def get_short_document_name(filename: str) -> str:
    """
    Convert long document names to shorter, user-friendly names automatically
    
    SHORT NAME GENERATION GUIDE:
    ===========================
    
    1. MANUAL MAPPING (Priority 1):
       - Add entries to the 'short_names' dictionary for specific files
       - Format: 'full_filename_without_extension': 'Short Display Name'
       - Example: '20250813_Budget2026Proposal_MaternityLeaveBenefit_Raj_D01': 'Maternity Leave Benefits'
    
    2. AUTOMATIC PATTERN MATCHING (Priority 2):
       - System automatically detects proposal types and languages
       - Proposal Types Detected:
         * MaternityLeaveBenefit/MaternityLeave → "Maternity Leave Benefits"
         * RemovalOfTaxationOnEPF/EPF → "EPF Tax Removal" 
         * ExpandingIndustrialLand/IndustrialLand → "Industrial Land Expansion"
         * Budget2025/Budget2026 → "Budget 2025/2026 Proposals"
         * Template → "Budget Template"
         * OnePagers → "Budget YYYY One-Pagers"
       
       - Language Detection:
         * _Sin_/_Sinhala_ → "(Sinhala)"
         * _Tam_/_Tamil_ → "(Tamil)"
         * _En_/_English_ → "(EN)"
         * _Raj_ → No language suffix (treated as default/English)
         * No language indicator → No language suffix
    
    3. GENERIC FALLBACK (Priority 3):
       - Removes date prefixes: 20250813_ → ""
       - Removes language suffixes: _Sin_, _Tam_, _Raj_, _En_, _F_, _Final_, _D01
       - Removes budget prefixes: Budget2026Proposal_ → ""
       - Converts underscores to spaces: _ → " "
       - Capitalizes words: "maternity leave" → "Maternity Leave"
       - Limits length: Truncates to 37 chars + "..." if longer than 40
    
    EXAMPLES:
    =========
    Input: "20250813_Budget2026Proposal_MaternityLeaveBenefit_Sin_F.pdf"
    Output: "Maternity Leave Benefits (Sinhala)"
    
    Input: "20250825_Budget2026Proposal_RemovalOfTaxationOnEPF_Tam_F.pdf"  
    Output: "EPF Tax Removal (Tamil)"
    
    Input: "20250813_Budget2026_Proposal_ExpandingIndustrialLand_En_F.pdf"
    Output: "Industrial Land Expansion (EN)"
    
    Input: "20250813_Budget2026Proposal_MaternityLeaveBenefit_Raj_D01.pdf"
    Output: "Maternity Leave Benefits" (no language suffix)
    
    HOW TO ADD NEW DOCUMENTS:
    =========================
    1. Drop the PDF/DOCX file in the assets/pdfs/ folder
    2. The system will automatically generate a short name using pattern matching
    3. If you want a custom name, add it to the 'short_names' dictionary
    4. No code changes needed for automatic naming!
    """
    # Remove file extension
    name = filename.replace('.pdf', '').replace('.docx', '')
    
    # Create mapping for common document types (can be updated manually for special cases)
    short_names = {
        '20241211_Econ_VRProposals_Budget2025_OnePagers': 'Budget 2025 One-Pagers',
        '20250813_Budget2026_Proposal_ExpandingIndustrialLand_En_F': 'Industrial Land Expansion (EN)',
        '20250813_Budget2026Proposal_ExpandingIndustrialLand_F': 'Industrial Land Expansion (English)',
        '20250813_Budget2026Proposal_ExpandingIndustrialLand_F - Sinhala': 'Industrial Land Expansion (Sinhala)',
        '20250813_Budget2026Proposal_MaternityLeaveBenefit_Raj_D01': 'Maternity Leave Benefits',
        '20250813_Budget2026Proposal_RemovalOfTaxationOnEPF_Raj_F': 'EPF Tax Removal',
        '20250825_Budget2026Proposal_MaternityLeaveBenefit_Sin_F': 'Maternity Leave Benefits (Sinhala)',
        '20250825_Budget2026Proposal_MaternityLeaveBenefit_Tam_F': 'Maternity Leave Benefits (Tamil)',
        '20250825_Budget2026Proposal_RemovalOfTaxationOnEPF_Sin_Final': 'EPF Tax Removal (Sinhala)',
        '20250825_Budget2026Proposal_RemovalOfTaxationOnEPF_Tam_F': 'EPF Tax Removal (Tamil)',
        '20250908_Budget2026Proposal_Template': 'Budget 2026 Template'
    }
    
    # Return short name if found in manual mapping
    if name in short_names:
        return short_names[name]
    
    # Automatic pattern-based naming (works for new files without manual updates)
    # Extract year
    year_match = re.search(r'20\d{2}', name)
    year = year_match.group() if year_match else ''
    
    # Extract language indicators
    language = ''
    if '_Sin_' in name or '_Sinhala_' in name:
        language = ' (Sinhala)'
    elif '_Tam_' in name or '_Tamil_' in name:
        language = ' (Tamil)'
    elif '_Raj_' in name:
        language = ' (Raj)'
    elif '_En_' in name or '_English_' in name:
        language = ' (EN)'
    
    # Extract proposal type
    if 'MaternityLeaveBenefit' in name or 'MaternityLeave' in name:
        return f'Maternity Leave Benefits{language}'
    elif 'RemovalOfTaxationOnEPF' in name or 'EPF' in name:
        return f'EPF Tax Removal{language}'
    elif 'ExpandingIndustrialLand' in name or 'IndustrialLand' in name:
        return f'Industrial Land Expansion{language}'
    elif 'Budget' in name and year:
        return f'Budget {year} Proposals{language}'
    elif 'Template' in name:
        return f'Budget Template{language}'
    elif 'OnePagers' in name:
        return f'Budget {year} One-Pagers'
    else:
        # Generic fallback - clean up the name
        # Remove date prefixes and common suffixes
        clean_name = re.sub(r'^\d{8}_', '', name)  # Remove date prefix
        clean_name = re.sub(r'_(En|Sin|Tam|Raj|F|Final|D01)$', '', clean_name)  # Remove language/version suffixes
        clean_name = re.sub(r'Budget\d{4}Proposal_?', '', clean_name)  # Remove budget proposal prefix
        clean_name = re.sub(r'_', ' ', clean_name)  # Replace underscores with spaces
        
        # Capitalize words
        clean_name = ' '.join(word.capitalize() for word in clean_name.split())
        
        # Limit length
        if len(clean_name) > 40:
            clean_name = clean_name[:37] + '...'
        
        return clean_name + language

def get_available_pdfs() -> List[str]:
    """Dynamically get list of available PDF files from all language directories"""
    try:
        import os
        import glob
        
        # Search in all language directories
        pdf_dirs = [
            "Budget_Proposals copy-2/en/assets/pdfs/",
            "Budget_Proposals copy-2/si/assets/pdfs/",
            "Budget_Proposals copy-2/ta/assets/pdfs/",
            "Budget_Proposals copy-2/assets/pdfs/"
        ]
        
        pdf_files = set()
        for pdf_dir in pdf_dirs:
            if os.path.exists(pdf_dir):
                files = [f for f in os.listdir(pdf_dir) if f.lower().endswith(('.pdf', '.docx'))]
                pdf_files.update(files)
        
        if pdf_files:
            return list(pdf_files)
        else:
            # Fallback to known PDFs if no directories exist
            return [
                '20250813_Budget2026Proposal_ExpandingIndustrialLand_F.pdf',
                '20250813_Budget2026Proposal_ExpandingIndustrialLand_F - Sinhala.pdf',
                '20250813_Budget2026Proposal_ExpandingIndustrialLand_F - TamilReviewed.pdf',
                '20250813_Budget2026Proposal_MaternityLeaveBenefit_Raj_D01.pdf',
                '20250813_Budget2026Proposal_RemovalOfTaxationOnEPF_Raj_F.pdf',
                '20250825_Budget2026Proposal_MaternityLeaveBenefit_Sin_F.pdf',
                '20250825_Budget2026Proposal_MaternityLeaveBenefit_Tam_F.pdf',
                '20250825_Budget2026Proposal_RemovalOfTaxationOnEPF_Sin_Final.pdf',
                '20250825_Budget2026Proposal_RemovalOfTaxationOnEPF_Tam_F.pdf'
            ]
    except Exception as e:
        logger.error(f"Error getting available PDFs: {e}")
        # Fallback to known PDFs
        return [
            '20250813_Budget2026Proposal_ExpandingIndustrialLand_F.pdf',
            '20250813_Budget2026Proposal_ExpandingIndustrialLand_F - Sinhala.pdf',
            '20250813_Budget2026Proposal_ExpandingIndustrialLand_F - TamilReviewed.pdf',
            '20250813_Budget2026Proposal_MaternityLeaveBenefit_Raj_D01.pdf',
            '20250813_Budget2026Proposal_RemovalOfTaxationOnEPF_Raj_F.pdf',
            '20250825_Budget2026Proposal_MaternityLeaveBenefit_Sin_F.pdf',
            '20250825_Budget2026Proposal_MaternityLeaveBenefit_Tam_F.pdf',
            '20250825_Budget2026Proposal_RemovalOfTaxationOnEPF_Sin_Final.pdf',
            '20250825_Budget2026Proposal_RemovalOfTaxationOnEPF_Tam_F.pdf'
        ]

# DISABLED - Source extraction removed
def extract_sources_from_search_context_DISABLED(search_context: str, user_language: str = 'en') -> List[Dict[str, str]]:
    """Extract source documents from search context with short names, filtered by user language"""
    sources = []
    
    # Get dynamically available PDF files
    available_pdfs = get_available_pdfs()
    
    # Look for the specific pattern "From {filename} ({category}):" in search context
    import re
    found_files = set()
    
    # Pattern to match "From filename.pdf (category):" or "From filename.docx (category):"
    # Updated to handle assets/pdfs/ prefix and empty parentheses, and stop at the colon
    from_pattern = r'From\s+assets/pdfs/([^:]+\.(?:pdf|docx))\s*\([^)]*\)'
    matches = re.findall(from_pattern, search_context)
    
    for match in matches:
        if match in available_pdfs:
            found_files.add(match)
    
    # Fallback: if no "From" pattern found, look for direct filename mentions
    if not found_files:
        for pdf in available_pdfs:
            if pdf in search_context:
                found_files.add(pdf)
    
    # Filter to return sources in the user's language, but prioritize by relevance
    language_filtered_files = []
    
    # First, try to find documents in the user's language
    for pdf in found_files:
        doc_language = get_document_language(pdf)
        
        # Language matching logic - return sources in user's language
        should_include = False
        if user_language == 'en' or user_language == 'singlish':
            # English users get English documents
            if doc_language in ['en', 'english']:
                should_include = True
        elif user_language == 'si' or user_language == 'sinhala':
            # Sinhala users get Sinhala documents
            if doc_language in ['si', 'sinhala']:
                should_include = True
        elif user_language == 'ta' or user_language == 'tamil':
            # Tamil users get Tamil documents
            if doc_language in ['ta', 'tamil']:
                should_include = True
        else:
            # Default: show English documents
            if doc_language in ['en', 'english']:
                should_include = True
            
        if should_include:
            language_filtered_files.append(pdf)
    
    # If no language-specific documents found, fallback to English
    if not language_filtered_files:
        for pdf in found_files:
            doc_language = get_document_language(pdf)
            if doc_language in ['en', 'english']:
                language_filtered_files.append(pdf)
    
    # If still no documents, use any available document
    if not language_filtered_files and found_files:
        language_filtered_files = [list(found_files)[0]]
    
    # Return only the most relevant document in the user's language
    if language_filtered_files:
        language_filtered_files = [language_filtered_files[0]]
    
    # Convert to list with short names and correct URLs
    for pdf in language_filtered_files:
        sources.append({
            "filename": pdf,
            "short_name": get_short_document_name(pdf),
            "pdf_url": get_correct_pdf_url(pdf)
        })
    
    return sources

def get_document_language(filename: str) -> str:
    """Determine the language of a document from its filename"""
    filename_lower = filename.lower()
    
    if any(indicator in filename_lower for indicator in ['_sin_', '-sin', 'sinhala', 'si/', '- sinhala']):
        return 'si'
    elif any(indicator in filename_lower for indicator in ['_tam_', '-tam', 'tamil', 'ta/']):
        return 'ta'
    elif '_raj_' in filename_lower:
        return 'en'  # Treat Raj as English/default
    elif '_en_' in filename_lower or '_english_' in filename_lower:
        return 'en'
    else:
        # Default to English if no language indicator found
        return 'en'

def get_correct_pdf_url(filename: str) -> str:
    """Get the correct PDF URL based on document language"""
    doc_language = get_document_language(filename)
    
    # Map language to directory
    if doc_language == 'si':
        return f"../si/assets/pdfs/{filename}"
    elif doc_language == 'ta':
        return f"../ta/assets/pdfs/{filename}"
    else:
        # English documents
        return f"assets/pdfs/{filename}"

# DISABLED - Source extraction removed
def extract_sources_from_response_DISABLED(response: str) -> List[Dict[str, str]]:
    """Extract source documents mentioned in the response with short names (fallback method)"""
    sources = []
    
    # Get dynamically available PDF files
    available_pdfs = get_available_pdfs()
    
    # Look for source patterns like "(Source: filename.pdf)" or "(Sources: file1.pdf, file2.pdf)"
    # Also look for partial matches for the new budget proposal files
    found_files = set()
    for pdf in available_pdfs:
        if pdf in response:
            found_files.add(pdf)
        # Also check for partial matches (e.g., "MaternityLeaveBenefit" matches the full filename)
        elif any(keyword in response for keyword in pdf.split('_') if len(keyword) > 5):
            found_files.add(pdf)
    
    # Convert to list with short names and correct URLs
    for pdf in found_files:
        sources.append({
            "filename": pdf,
            "short_name": get_short_document_name(pdf),
            "pdf_url": get_correct_pdf_url(pdf)
        })
    
    return sources

def generate_response_with_rag(user_message: str, session_id: str) -> Dict[str, Any]:
    """Generate response using RAG with memory and multilingual support"""
    try:
        # Process multilingual input
        processed_message, original_language, needs_translation, transliteration_used, ai_detection_used, confidence = simple_process_input(user_message)
        logger.info(f"Input processing: original='{user_message}', processed='{processed_message}', lang='{original_language}', transliteration='{transliteration_used}', ai_detection='{ai_detection_used}', confidence='{confidence:.2f}'")
        
        # Get or create memory for this session
        memory = get_or_create_memory(session_id)
        
        # Let Gemini handle both specific and general questions intelligently
        # Always search with the user's actual query - Gemini will handle vague questions
        search_context = search_budget_proposals(processed_message)
        
        # Get conversation history for context
        chat_history = memory.chat_memory.messages
        conversation_context = ""
        if chat_history:
            # Get last few messages for context
            recent_messages = chat_history[-6:]  # Last 3 exchanges
            conversation_parts = []
            for msg in recent_messages:
                if isinstance(msg, HumanMessage):
                    conversation_parts.append(f"User: {msg.content}")
                elif isinstance(msg, AIMessage):
                    conversation_parts.append(f"Assistant: {msg.content}")
            conversation_context = "\n".join(conversation_parts)
        
        # Create a prompt with conversation history and retrieved context
        language_instruction = ""
        if original_language == 'si':
            language_instruction = "\n\nIMPORTANT: The user asked in Sinhala. Please respond in the same language (Sinhala) using proper Sinhala script and formal language appropriate for policy discussions. The question was: '{}'".format(user_message)
        elif original_language == 'ta':
            language_instruction = "\n\nIMPORTANT: The user asked in Tamil. Please respond in the same language (Tamil) using proper Tamil script and formal language appropriate for policy discussions. Use Sri Lankan Tamil terminology and context. The question was: '{}'".format(user_message)
        elif original_language == 'singlish':
            language_instruction = "\n\nIMPORTANT: The user asked in Singlish (Romanized Sinhala - Sinhala words written in English letters). Please respond in proper Sinhala script using formal language appropriate for policy discussions. Translate their question and provide a comprehensive answer in Sinhala. The original question was: '{}'".format(user_message)
        elif original_language == 'romanized_tamil':
            language_instruction = "\n\nIMPORTANT: The user asked in Romanized Tamil (Tamil words written in English letters). Please respond in proper Tamil script using formal language appropriate for policy discussions. Use Sri Lankan Tamil terminology and context. Translate their question and provide a comprehensive answer in Tamil. The original question was: '{}'".format(user_message)
        
        prompt = f"""You are a helpful assistant for budget proposals in Sri Lanka. You can communicate in English, Sinhala, Tamil (Sri Lankan Tamil), and understand Singlish and Romanized Tamil.

FORMATTING RULES:
- DO NOT use asterisks (*) for formatting or emphasis
- DO NOT use markdown formatting like **bold** or *italic*
- Use plain text without any special formatting characters
- Keep responses clean and readable without formatting symbols

IMPORTANT: This website contains various budget proposals for Sri Lanka including:
- Maternity leave benefits proposals (multiple language versions)
- EPF (Employee Provident Fund) taxation removal proposals
- Industrial land expansion proposals
- Cigarette tax reform proposals  
- Electricity tariff reforms
- Tax policy changes
- Economic growth initiatives
- Social protection measures
- Budget 2025 and 2026 proposals

Based on the following information from the budget proposals database:

{search_context}

{conversation_context}

Current user question: {processed_message}
Original user input: {user_message}
{language_instruction}

Guidelines:
- For general questions like "monada meh" (what is this), "help", or vague inquiries, provide a helpful overview of available budget proposals
- Never say "I couldn't process your request" - always provide useful information about budget proposals  
- Be professional but approachable in any language
- Include specific details from the retrieved information when available
- When mentioning proposals, refer to them by topic (e.g., "maternity leave benefits proposal", "EPF tax removal proposal") - DO NOT include long document filenames
- If the search doesn't return relevant results, provide an overview of available proposals with examples
- For vague questions, proactively explain what's available and guide users to specific topics (EPF, electricity, maternity leave, cigarette taxes, etc.)
- Keep responses clear and informative
- Reference previous conversation context when relevant
- Maintain conversation continuity
- Be culturally sensitive when discussing Sri Lankan policies
- When responding in Sinhala, use appropriate formal language for policy discussions
- When responding in Tamil, use Sri Lankan Tamil dialect and formal language appropriate for policy discussions
- Always be helpful - turn any question into an opportunity to inform about budget proposals

Please provide a helpful response:"""

        # Generate response using the LLM directly
        response = llm.invoke(prompt)
        response_text = response.content.strip()
        
        # No need to translate response - Gemini handles language matching automatically
        
        # Sources removed - no longer extracting source documents
        
        # Add messages to memory (store original user message for context)
        memory.chat_memory.add_user_message(user_message)
        memory.chat_memory.add_ai_message(response_text)
        
        # Get updated conversation history for context
        chat_history = memory.chat_memory.messages
        
        return {
            "response": response_text,
            "confidence": "high",
            "session_id": session_id,
            "conversation_length": len(chat_history),
            "memory_used": True,
            "rag_used": True,
            "sources": [],
            "language_detected": original_language,
            "translation_used": needs_translation,
            "transliteration_used": transliteration_used,
            "ai_detection_used": ai_detection_used,
            "detection_confidence": confidence
        }
        
    except Exception as e:
        logger.error(f"Error generating response with RAG: {e}")
        # Provide error message in appropriate language
        error_message = "I'm sorry, I'm having trouble processing your request right now. Please try again later."
        
        return {
            "response": error_message,
            "confidence": "error",
            "session_id": session_id,
            "memory_used": False,
            "rag_used": False,
            "sources": [],
            "language_detected": original_language if 'original_language' in locals() else 'en',
            "translation_used": False,
            "transliteration_used": False,
            "ai_detection_used": False,
            "detection_confidence": 0.0
        }

def clear_session_memory(session_id: str) -> bool:
    """Clear memory for a specific session"""
    try:
        if session_id in conversation_memories:
            del conversation_memories[session_id]
            logger.info(f"Cleared memory for session: {session_id}")
            return True
        return False
    except Exception as e:
        logger.error(f"Error clearing memory: {e}")
        return False

@app.route('/api/chat', methods=['POST'])
def chat():
    """Enhanced chat endpoint with memory"""
    try:
        data = request.get_json()
        user_message = data.get('message', '').strip()
        session_id = data.get('session_id', 'default')
        
        if not user_message:
            return jsonify({
                "error": "Message is required"
            }), 400
        
        # Generate response with memory
        result = generate_response_with_rag(user_message, session_id)
        
        return jsonify({
            "response": result["response"],
            "confidence": result["confidence"],
            "session_id": session_id,
            "conversation_length": result.get("conversation_length", 0),
            "memory_used": result.get("memory_used", False),
            "rag_used": result.get("rag_used", False),
            "sources": [],
            "user_message": user_message,
            "language_detected": result.get("language_detected", "en"),
            "translation_used": result.get("translation_used", False),
            "transliteration_used": result.get("transliteration_used", False),
            "ai_detection_used": result.get("ai_detection_used", False),
            "detection_confidence": result.get("detection_confidence", 0.0)
        })
    
    except Exception as e:
        logger.error(f"Chat API error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat/clear', methods=['POST'])
def clear_chat():
    """Clear chat memory for a session"""
    try:
        data = request.get_json()
        session_id = data.get('session_id', 'default')
        
        success = clear_session_memory(session_id)
        
        return jsonify({
            "success": success,
            "session_id": session_id,
            "message": "Chat memory cleared successfully" if success else "Session not found"
        })
    
    except Exception as e:
        logger.error(f"Clear chat error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat/sessions', methods=['GET'])
def list_sessions():
    """List all active chat sessions"""
    try:
        sessions = []
        for session_id, memory in conversation_memories.items():
            messages = memory.chat_memory.messages
            sessions.append({
                "session_id": session_id,
                "message_count": len(messages),
                "last_activity": datetime.now().isoformat()  # Simplified for now
            })
        
        return jsonify({
            "sessions": sessions,
            "total_sessions": len(sessions)
        })
    
    except Exception as e:
        logger.error(f"List sessions error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat/history/<session_id>', methods=['GET'])
def get_chat_history(session_id: str):
    """Get chat history for a specific session"""
    try:
        if session_id not in conversation_memories:
            return jsonify({
                "session_id": session_id,
                "history": [],
                "message_count": 0
            })
        
        memory = conversation_memories[session_id]
        messages = memory.chat_memory.messages
        
        history = []
        for msg in messages:
            if isinstance(msg, HumanMessage):
                history.append({
                    "type": "human",
                    "content": msg.content,
                    "timestamp": datetime.now().isoformat()
                })
            elif isinstance(msg, AIMessage):
                history.append({
                    "type": "ai",
                    "content": msg.content,
                    "timestamp": datetime.now().isoformat()
                })
        
        return jsonify({
            "session_id": session_id,
            "history": history,
            "message_count": len(history)
        })
    
    except Exception as e:
        logger.error(f"Get chat history error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat/health', methods=['GET'])
def chat_health():
    """Health check for the enhanced chatbot"""
    try:
        # Test LangChain connection and vector database
        test_agent = create_agent("health_check")
        test_response = test_agent.invoke({"input": "Hello"})
        
        # Test vector database connection
        pc_index = get_pinecone_index()
        vector_db_status = "connected" if pc_index else "disconnected"
        
        return jsonify({
            "status": "healthy",
            "message": "Enhanced budget proposals chatbot with RAG is running",
            "langchain_status": "connected" if test_response else "disconnected",
            "vector_db_status": vector_db_status,
            "rag_enabled": True,
            "active_sessions": len(conversation_memories),
            "memory_enabled": True
        })
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "message": f"Error: {str(e)}"
        }), 500

@app.route('/api/chat/debug/<session_id>', methods=['GET'])
def debug_session(session_id: str):
    """Debug endpoint to check session memory"""
    try:
        memory_exists = session_id in conversation_memories
        memory_info = {
            "session_id": session_id,
            "memory_exists": memory_exists,
            "total_sessions": len(conversation_memories),
            "session_keys": list(conversation_memories.keys())
        }
        
        if memory_exists:
            memory = conversation_memories[session_id]
            messages = memory.chat_memory.messages
            memory_info.update({
                "message_count": len(messages),
                "messages": [
                    {
                        "type": getattr(msg, 'type', 'unknown'),
                        "content": getattr(msg, 'content', '')[:100] + "..." if len(getattr(msg, 'content', '')) > 100 else getattr(msg, 'content', '')
                    }
                    for msg in messages
                ]
            })
        
        return jsonify(memory_info)
    
    except Exception as e:
        logger.error(f"Debug session error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat/suggestions', methods=['GET'])
def get_chat_suggestions():
    """Get suggested questions for the chatbot with multilingual support"""
    suggestions = [
        "What are the maternity leave benefits proposed? 🤱",
        "What are the industrial land expansion proposals? 🏭",
        "How do the cigarette tax proposals work? 💰",
        "What changes are proposed for electricity tariffs? ⚡",
        "Tell me about the EPF taxation removal proposals 💰",
        "What tax reforms are being suggested? 🏛️",
        "How will these proposals affect the economy? 📈",
        "What is the cost of implementing these proposals? 💵",
        "Can you compare the costs of different proposals? ⚖️",
        "What are the main benefits of these proposals? ✨",
        "Budget proposals gana kiyanna 📋",
        "EPF eka gana mokadda thiyenne? 💰",
        "Industrial land expansion kiyannako 🏭",
        "Electricity bill eka wenas wenawada? ⚡",
        "Maternity leave benefits kiyannako 🤱",
        "මේ budget proposals වල cost එක කීයද? 💵",
        "රජයේ ආර්థික ප්‍රතිපත්ති ගැන කියන්න 🏛️"
    ]
    
    return jsonify({
        "suggestions": suggestions,
        "supported_languages": ["English", "Sinhala", "Singlish"]
    })

@app.route('/api/chat/available-pdfs', methods=['GET'])
def get_available_pdfs_endpoint():
    """Get list of available PDF files with short names for UI display"""
    try:
        available_pdfs = get_available_pdfs()
        
        # Create list with both full names and short names
        pdf_list = []
        short_names = []
        for pdf in available_pdfs:
            short_name = get_short_document_name(pdf)
            pdf_list.append({
                "filename": pdf,
                "short_name": short_name,
                "type": "PDF" if pdf.endswith('.pdf') else "DOCX"
            })
            short_names.append(short_name)
        
        return jsonify({
            "available_pdfs": available_pdfs,
            "pdf_list": pdf_list,
            "short_names": short_names,  # Simple array for easy frontend use
            "count": len(available_pdfs),
            "pdf_directory": "Budget_Proposals copy-2/assets/pdfs"
        })
    except Exception as e:
        logger.error(f"Error getting available PDFs: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat/document-names', methods=['GET'])
def get_document_names():
    """Get document names with short names for UI display"""
    try:
        available_pdfs = get_available_pdfs()
        
        # Create mapping of full names to short names
        document_mapping = {}
        for pdf in available_pdfs:
            document_mapping[pdf] = get_short_document_name(pdf)
        
        return jsonify({
            "document_mapping": document_mapping,
            "count": len(available_pdfs)
        })
    except Exception as e:
        logger.error(f"Error getting document names: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat/short-document-names', methods=['GET'])
def get_short_document_names():
    """Get just the short document names as a simple array for frontend display"""
    try:
        available_pdfs = get_available_pdfs()
        
        # Create simple array of short names
        short_names = []
        for pdf in available_pdfs:
            short_names.append(get_short_document_name(pdf))
        
        return jsonify({
            "short_names": short_names,
            "count": len(short_names)
        })
    except Exception as e:
        logger.error(f"Error getting short document names: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat/document-buttons', methods=['GET'])
def get_document_buttons():
    """Get document names formatted specifically for UI buttons (simple strings only)"""
    try:
        available_pdfs = get_available_pdfs()
        
        # Create simple array of just the short names as strings
        button_names = []
        for pdf in available_pdfs:
            button_names.append(get_short_document_name(pdf))
        
        # Return just the array of strings - no objects
        return jsonify(button_names)
    except Exception as e:
        logger.error(f"Error getting document buttons: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat/detect-language', methods=['POST'])
def detect_language():
    """Test language detection functionality"""
    try:
        data = request.get_json()
        text = data.get('text', '').strip()
        
        if not text:
            return jsonify({
                "error": "Text is required"
            }), 400
        
        processed_message, original_language, needs_translation, transliteration_used, ai_detection_used, confidence = simple_process_input(text)
        
        return jsonify({
            "original_text": text,
            "processed_text": processed_message,
            "language_detected": original_language,
            "translation_needed": needs_translation,
            "transliteration_used": transliteration_used,
            "ai_detection_used": ai_detection_used,
            "detection_confidence": confidence,
            "contains_sinhala": detect_sinhala_content(text),
            "is_singlish": detect_singlish(text)
        })
    
    except Exception as e:
        logger.error(f"Language detection error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/', methods=['GET'])
def home():
    """Home endpoint with API documentation"""
    return jsonify({
        "message": "Multilingual Budget Proposals Chatbot API with Swabhasha Pipeline",
        "version": "2.1.0",
        "supported_languages": ["English", "Sinhala", "Tamil (Sri Lankan)", "Romanized Sinhala (Singlish)", "Romanized Tamil"],
        "features": ["RAG", "Memory", "Swabhasha Transliteration", "Google Translation", "FAISS Vector Store"],
        "pipeline": "Romanized Sinhala → Swabhasha → Sinhala Script → Google Translate → English → LLM → Response",
        "endpoints": {
            "POST /api/chat": "Chat with memory, RAG, and multilingual support",
            "POST /api/chat/clear": "Clear chat memory",
            "GET /api/chat/sessions": "List active sessions",
            "GET /api/chat/history/<session_id>": "Get chat history",
            "GET /api/chat/health": "Health check",
            "GET /api/chat/suggestions": "Get suggested questions (multilingual)",
            "GET /api/chat/available-pdfs": "Get available PDF files with short names",
            "GET /api/chat/document-names": "Get document name mapping (full to short names)",
            "GET /api/chat/short-document-names": "Get simple array of short document names",
            "GET /api/chat/document-buttons": "Get document names as simple string array for UI buttons",
            "POST /api/chat/detect-language": "Test language detection"
        },
        "status": "running"
    })

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=7860)
