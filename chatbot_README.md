---
title: Budget Proposals Chatbot API
emoji: 🤖
colorFrom: green
colorTo: blue
sdk: gradio
sdk_version: 5.44.0
app_file: app.py
pinned: false
---

# Budget Proposals Chatbot API

An intelligent chatbot API for budget proposals using LangChain, Gemini AI, and RAG (Retrieval-Augmented Generation) with conversation memory.

## Features

- **RAG-powered responses** using semantic search of budget proposals
- **Conversation memory** with session management
- **Gemini AI integration** for natural language processing
- **Source citation** for all responses
- **Session management** with chat history
- **Suggested questions** for easy interaction

## API Endpoints

### Chat
- **POST** `/api/chat` - Chat with memory and RAG
- **POST** `/api/chat/clear` - Clear chat memory

### Session Management
- **GET** `/api/chat/sessions` - List active sessions
- **GET** `/api/chat/history/<session_id>` - Get chat history

### Utility
- **GET** `/api/chat/health` - Health check
- **GET** `/api/chat/suggestions` - Get suggested questions
- **GET** `/api/chat/available-pdfs` - Get available PDF files

## Environment Variables

Set these in your Hugging Face Spaces secrets:

- `GEMINI_API_KEY` - Your Google Gemini API key (required)
- `PINECONE_API_KEY` - Your Pinecone API key (required)

## Usage Examples

### Chat with the Bot
```bash
curl -X POST https://your-space-url.hf.space/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What are the maternity leave benefits?", "session_id": "user123"}'
```

### Clear Chat Memory
```bash
curl -X POST https://your-space-url.hf.space/api/chat/clear \
  -H "Content-Type: application/json" \
  -d '{"session_id": "user123"}'
```

### Get Chat History
```bash
curl https://your-space-url.hf.space/api/chat/history/user123
```

## Response Format

```json
{
  "response": "Based on the budget proposals database, the maternity leave benefits proposal...",
  "confidence": "high",
  "session_id": "user123",
  "conversation_length": 5,
  "memory_used": true,
  "rag_used": true,
  "sources": ["MLB.pdf"],
  "user_message": "What are the maternity leave benefits?"
}
```

## Integration

This chatbot integrates with the semantic search API to provide accurate, context-aware responses about budget proposals. It maintains conversation context and can reference previous interactions.

## Deployment

This API is deployed on Hugging Face Spaces and automatically serves on port 7860.
