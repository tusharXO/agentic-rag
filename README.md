# 🚀 Agentic RAG Document Intelligence

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19-61dafb.svg?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646CFF.svg?logo=vite&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-20-339933.svg?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000.svg?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1.svg?logo=postgresql&logoColor=white)
![pgvector](https://img.shields.io/badge/pgvector-384--dim-00D26A.svg)
![Gemini](https://img.shields.io/badge/Google%20Gemini-Flash-8E75B2.svg?logo=google&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)

**An intelligent, multi-tenant, full-stack Retrieval-Augmented Generation (RAG) system with local transformer embeddings, Supabase/pgvector similarity search, and grounded Google Gemini question answering.**

[Features](#-key-features) • [Architecture](#-architecture) • [Quick Start](#-quick-start) • [Free Deployment](#-free-cloud-deployment-guide) • [API Reference](#-api-endpoints)

</div>

---

## ✨ Key Features

- ⚡ **Local 384-Dim Vector Embeddings**: Uses `@xenova/transformers` (`all-MiniLM-L6-v2` ONNX pipeline) to compute dense vector embeddings directly in Node.js with zero API latency or embedding costs.
- 🛡️ **Multi-Tenant Session Isolation**: Automatic, persistent workspace `sessionId` so each user's uploaded documents and queries remain strictly private and isolated.
- 🗄️ **Vector Database with `pgvector`**: Stores document chunks and high-dimensional vectors in PostgreSQL using native cosine distance indexing (`<=>`).
- 🤖 **Grounded AI Answers via Gemini**: Queries Google Gemini (`@google/genai`) with strict context-bounding system instructions to prevent hallucinations.
- 📂 **Live Document Library & File Manager**: Fetch, view chunk stats, filter queries by single or multiple files, and delete documents in real-time.
- 💾 **Persistent Chat & Workspace Switcher**: Chat progress and query history are preserved across browser refreshes with 1-click workspace sharing/loading.
- 🎨 **Modern Glassmorphic Dark UI**: High-end interface built with React 19, Tailwind CSS v4, Lucide icons, responsive layout, and collapsible source citations.

---

## 🏛️ Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Client ["Frontend (React 19 + Vite + Tailwind CSS)"]
        UI_Upload["📄 Upload PDF Document"]
        UI_Filter["🎯 Target: All or Specific Document"]
        UI_Query["💬 Ask Natural Language Question"]
        UI_Display["✨ View Grounded Answer + Source Citations"]
    end

    subgraph Backend ["Backend API (Express.js)"]
        PDFParser["PDF Parser (pdf-parse)"]
        Chunker["Sliding Window Chunker (1000 char / 200 overlap)"]
        Embedder["Local ONNX Embedder (all-MiniLM-L6-v2)"]
        VectorSearch["Cosine Distance Search (<=>)"]
        GeminiClient["Gemini LLM Prompting (@google/genai)"]
    end

    subgraph Database ["Vector Database (PostgreSQL + pgvector / Supabase)"]
        DBTable[("document_chunks table (384-dim vectors)")]
    end

    subgraph External ["Google AI"]
        GeminiAPI["Google Gemini 3.6 / 2.5 Flash"]
    end

    %% Ingestion Flow
    UI_Upload -->|POST /upload| PDFParser
    PDFParser --> Chunker
    Chunker --> Embedder
    Embedder -->|Store chunks & vectors by session_id| DBTable

    %% Query Flow
    UI_Query -->|POST /query (sessionId, question, filename)| Embedder
    Embedder -->|Generate query vector| VectorSearch
    DBTable <-->|Retrieve Top-3 Cosine Matches| VectorSearch
    VectorSearch -->|Context Chunks + Question| GeminiClient
    GeminiClient <-->|Strictly Grounded Synthesis| GeminiAPI
    GeminiClient -->|Answer + Citations| UI_Display
```

---

## 📁 Repository Structure

```
agentic-rag/
├── docker-compose.yml              # Multi-container orchestration (DB, Backend, Frontend)
├── init.sql                        # Database schema & pgvector index definition
├── README.md                       # Comprehensive project documentation
├── agentic-rag-backend/
│   ├── server.js                   # Express server, /upload, /query, /files REST endpoints
│   ├── embedding.js                # Xenova Transformers local embedding pipeline
│   ├── db.js                       # PostgreSQL connection pool with SSL & DATABASE_URL support
│   ├── Dockerfile                  # Container definition for Node.js backend
│   └── package.json                # Dependencies (@google/genai, @xenova/transformers, pg)
└── agentic-rag-frontend/
    ├── src/
    │   ├── App.jsx                 # Full-featured interactive RAG workspace UI
    │   ├── main.jsx                # React root mount
    │   └── index.css               # Tailwind CSS stylesheet
    ├── vite.config.js              # Vite bundler configuration
    ├── Dockerfile                  # Container definition for frontend
    └── package.json                # Frontend dependencies (React 19, Tailwind v4, Lucide)
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **PostgreSQL 16** with `pgvector` extension (or a free [Supabase](https://supabase.com) account)
- **Google Gemini API Key** (from [Google AI Studio](https://aistudio.google.com/app/apikey))

---

### 2. Option A: Run with Docker Compose (Fastest)

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/agentic-rag.git
   cd agentic-rag
   ```

2. Create a `.env` file in the root directory:
   ```env
   GEMINI_API_KEY=your_actual_gemini_api_key
   ```

3. Launch all containers:
   ```bash
   docker compose up --build
   ```

4. Open `http://localhost:5173` in your browser.

---

### 3. Option B: Run Locally without Docker

#### Backend Setup
```bash
cd agentic-rag-backend
npm install
```

Create `agentic-rag-backend/.env`:
```env
PORT=3000
GEMINI_API_KEY=your_gemini_api_key
DATABASE_URL=postgresql://postgres:password@localhost:5432/rag_db
# Or use discrete variables:
# DB_HOST=localhost
# DB_PORT=5432
# DB_USER=postgres
# DB_PASSWORD=mysecretpassword
# DB_NAME=rag_db
```

Start the backend server:
```bash
npm run dev
```

#### Frontend Setup
```bash
cd ../agentic-rag-frontend
npm install
```

Create `agentic-rag-frontend/.env`:
```env
VITE_BACKEND_URL=http://localhost:3000
```

Start the frontend development server:
```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🌐 100% Free Cloud Deployment Guide

| Component | Platform | Free Tier |
| :--- | :--- | :--- |
| **Vector DB** | [**Supabase**](https://supabase.com) | 500MB free PostgreSQL with native `pgvector` |
| **Backend API** | [**Render**](https://render.com) | Free Web Service (512MB RAM) |
| **Frontend UI** | [**Vercel**](https://vercel.com) | Free global CDN hosting for Vite/React |

### 1. Database (Supabase)
1. Create a free project on [Supabase](https://supabase.com).
2. Go to **SQL Editor** and run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;

   CREATE TABLE IF NOT EXISTS document_chunks (
       id SERIAL PRIMARY KEY,
       filename TEXT NOT NULL,
       chunk_index INT NOT NULL,
       content TEXT NOT NULL,
       embedding vector(384),
       session_id TEXT NOT NULL DEFAULT 'default',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );

   CREATE INDEX IF NOT EXISTS idx_doc_chunks_session ON document_chunks(session_id);
   CREATE INDEX IF NOT EXISTS idx_doc_chunks_session_file ON document_chunks(session_id, filename);
   ```
3. Copy your URI connection string from **Project Settings → Database**.

### 2. Backend (Render)
1. Create a **New Web Service** pointing to your GitHub repository.
2. Root Directory: `agentic-rag-backend`
3. Build Command: `npm install` | Start Command: `npm start`
4. Set Environment Variables:
   - `DATABASE_URL`: *(Your Supabase connection URI)*
   - `GEMINI_API_KEY`: *(Your Google AI Studio key)*
   - `PORT`: `3000`
5. *(Optional)* Set up a free 10-minute ping at [cron-job.org](https://cron-job.org) targeting `https://your-app.onrender.com/` to eliminate cold starts.

### 3. Frontend (Vercel)
1. Import repository on [Vercel](https://vercel.com).
2. Root Directory: `agentic-rag-frontend`
3. Environment Variable:
   - `VITE_BACKEND_URL`: `https://your-backend.onrender.com`
4. Click **Deploy**.

---

## 📡 API Endpoints

| Method | Route | Parameters / Body | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | — | Healthcheck endpoint. |
| `GET` | `/files` | Query: `?sessionId=xyz` | Lists all documents uploaded under the specified session ID. |
| `DELETE` | `/files/:filename` | Query: `?sessionId=xyz` | Deletes the specified file and all associated vector chunks. |
| `POST` | `/upload` | Multipart: `file` (PDF), `sessionId` | Extracts text, generates 384-dim vectors, and saves chunks to PostgreSQL. |
| `POST` | `/query` | JSON: `{ question, sessionId, filename? }` | Computes question vector, finds top cosine matches in pgvector, and synthesizes answer with Gemini. |

---

## 🛡️ License

This project is licensed under the [MIT License](LICENSE).
