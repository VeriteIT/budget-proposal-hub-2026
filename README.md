---
title: Budget Proposals Semantic Search API
emoji: 🔍
colorFrom: blue
colorTo: purple
sdk: gradio
sdk_version: 5.44.0
app_file: app.py
pinned: false
---

# Budget Proposals Semantic Search API

A Flask-based API for semantic search of budget proposals using Pinecone vector database and sentence transformers.

## Features

- Semantic search of budget proposals using AI embeddings
- Category-based filtering
- Relevance scoring and ranking
- Health check and statistics endpoints
- CORS enabled for web applications

## API Endpoints

### Search Proposals
- **POST** `/api/search` - Search with JSON body
- **GET** `/api/search?query=<search_term>` - Search with query parameter

### Get All Proposals
- **GET** `/api/proposals` - Get all proposals
- **GET** `/api/proposals?category_filter=<category>` - Get proposals by category

### Categories
- **GET** `/api/categories` - Get all available categories

### Health & Stats
- **GET** `/api/health` - Health check
- **GET** `/api/stats` - Index statistics

## Environment Variables

Set these in your Hugging Face Spaces secrets:

- `PINECONE_API_KEY` - Your Pinecone API key (required)

## Usage Examples

### Search Proposals
```bash
curl -X POST https://your-space-url.hf.space/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "education funding", "top_k": 5}'
```

### Get All Proposals
```bash
curl https://your-space-url.hf.space/api/proposals
```

### Get Categories
```bash
curl https://your-space-url.hf.space/api/categories
```

## Response Format

```json
{
  "query": "education funding",
  "results": [
    {
      "title": "Education Enhancement Program",
      "summary": "Proposal for improving educational infrastructure...",
      "costLKR": "500,000,000",
      "category": "Education",
      "pdfUrl": "assets/pdfs/education_proposal.pdf",
      "thumbUrl": "assets/thumbs/education_proposal.jpg",
      "score": 0.85,
      "relevance_percentage": 85,
      "file_path": "education_proposal.pdf",
      "id": "doc_123"
    }
  ],
  "total_results": 1,
  "category_filter": null
}
```

## Deployment

This API is deployed on Hugging Face Spaces and automatically serves on port 7860.