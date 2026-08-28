require("dotenv").config();
const express = require("express");
const multer = require("multer");
const { PDFParse } = require('pdf-parse');
const { generateEmbedding } = require("./embedding");
const pool = require("./db");
const { GoogleGenAI } = require("@google/genai");
const cors = require("cors");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB max file size
});

const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 3000;

// Initialize and ensure database schema & indexes exist
async function initDatabase() {
    try {
        await pool.query(`
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
            ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS session_id TEXT NOT NULL DEFAULT 'default';
            ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
            CREATE INDEX IF NOT EXISTS idx_doc_chunks_session ON document_chunks(session_id);
            CREATE INDEX IF NOT EXISTS idx_doc_chunks_session_file ON document_chunks(session_id, filename);
        `);
        console.log("Database schema and indexes verified.");
    } catch (err) {
        console.error("Database migration error:", err);
    }
}

initDatabase();

function chunkText(text, chunkSize = 1000, overlap = 200) {
    const chunks = [];
    let start = 0;

    // Clean whitespace
    const cleanText = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();

    while (start < cleanText.length) {
        const end = start + chunkSize;
        chunks.push(cleanText.slice(start, end));
        start += (chunkSize - overlap);
    }

    return chunks;
}

async function saveDocumentChunks(filename, chunkObject, sessionId = 'default') {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        // Delete previous versions of this document uploaded by this session
        await client.query('DELETE FROM document_chunks WHERE filename = $1 AND session_id = $2;', [filename, sessionId]);
        
        const insertSql = 'INSERT INTO document_chunks (filename, chunk_index, content, embedding, session_id, created_at) VALUES($1, $2, $3, $4, $5, NOW())';

        for (const chunk of chunkObject) {
            await client.query(insertSql, [
                filename,
                chunk.chunkIndex,
                chunk.text,
                JSON.stringify(chunk.embedding),
                sessionId
            ]);
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function aiAnswer(contextChunks, question) {
    const formattedContext = contextChunks.map((chunk, i) => `[Source Chunk ${i + 1} (${chunk.filename || 'Document'})]:\n${chunk.content || chunk}`).join('\n\n');

    const prompt = `
You are an intelligent, precise AI research assistant. Answer the user's question accurately and concisely based STRICTLY on the provided context below.
- Do NOT make assumptions or hallucinate information not present in the context.
- If the answer cannot be determined directly from the context, respond with: "I cannot answer this question based on the provided document(s)."
- Highlight key facts and structure your answer with clear bullet points or short paragraphs when appropriate.

CONTEXT:
${formattedContext}

QUESTION:
${question}
`;

    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
        });
        return response.text;
    } catch (err) {
        console.warn(`Gemini generation with '${modelName}' failed, trying fallback:`, err.message);
        // Fallback to gemini-1.5-flash or gemini-2.0-flash if configured model throws error
        const fallbackResponse = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: prompt,
        });
        return fallbackResponse.text;
    }
}

// Health check endpoint
app.get("/", (req, res) => {
    res.json({ status: "healthy", service: "agentic-rag-backend", timestamp: new Date().toISOString() });
});

// GET /files - List all documents uploaded by the current session
app.get("/files", async (req, res) => {
    try {
        const sessionId = req.query.sessionId || req.headers['x-session-id'] || 'default';

        const sql = `
            SELECT 
                filename, 
                COUNT(*)::int AS chunk_count, 
                MIN(created_at) AS uploaded_at
            FROM document_chunks
            WHERE session_id = $1
            GROUP BY filename
            ORDER BY uploaded_at DESC;
        `;

        const result = await pool.query(sql, [sessionId]);

        return res.json({
            sessionId,
            totalFiles: result.rows.length,
            files: result.rows.map(row => ({
                filename: row.filename,
                chunkCount: row.chunk_count,
                uploadedAt: row.uploaded_at
            }))
        });
    } catch (error) {
        console.error("Error fetching document files:", error);
        return res.status(500).json({ error: "Failed to fetch document library." });
    }
});

// DELETE /files/:filename - Remove a document and its chunks for this session
app.delete("/files/:filename", async (req, res) => {
    try {
        const sessionId = req.query.sessionId || req.headers['x-session-id'] || 'default';
        const { filename } = req.params;

        if (!filename) {
            return res.status(400).json({ error: "Filename parameter is required." });
        }

        const result = await pool.query(
            'DELETE FROM document_chunks WHERE filename = $1 AND session_id = $2 RETURNING id;',
            [filename, sessionId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: `File '${filename}' not found in your library.` });
        }

        return res.json({
            message: `Successfully deleted document '${filename}'.`,
            deletedChunks: result.rowCount
        });
    } catch (error) {
        console.error("Error deleting file:", error);
        return res.status(500).json({ error: "Failed to delete document." });
    }
});

// POST /upload - Parse PDF, generate vector embeddings, and save to Postgres
app.post("/upload", upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No PDF file uploaded. Please select a file." });
        }

        if (req.file.mimetype !== 'application/pdf' && !req.file.originalname.toLowerCase().endsWith('.pdf')) {
            return res.status(400).json({ error: "Invalid file type. Only PDF documents are supported." });
        }

        const sessionId = req.body.sessionId || req.headers['x-session-id'] || 'default';

        let parsedText = '';
        try {
            const parser = new PDFParse({ data: req.file.buffer });
            const result = await parser.getText();
            await parser.destroy();
            parsedText = result.text;
        } catch (pdfErr) {
            console.error("PDF Parsing error:", pdfErr);
            return res.status(422).json({ error: "Unable to read or parse PDF contents. The file may be password protected or corrupted." });
        }

        if (!parsedText || parsedText.trim().length === 0) {
            return res.status(422).json({ error: "The uploaded PDF contains no extractable text (it might be a scanned image)." });
        }

        const chunks = chunkText(parsedText);
        if (chunks.length === 0) {
            return res.status(422).json({ error: "Failed to create chunks from document." });
        }

        // Generate vector embeddings locally
        const chunkObject = await Promise.all(
            chunks.map(async (text, index) => {
                const embedding = await generateEmbedding(text);
                return {
                    chunkIndex: index,
                    text: text,
                    embedding: embedding
                };
            })
        );

        await saveDocumentChunks(req.file.originalname, chunkObject, sessionId);

        return res.json({
            filename: req.file.originalname,
            totalchunks: chunkObject.length,
            sessionId: sessionId,
            chunks: chunkObject.slice(0, 10) // return preview of first 10 chunks
        });

    } catch (error) {
        console.error("Upload error:", error);
        return res.status(500).json({ error: error.message || "Internal server error processing document." });
    }
});

// POST /query - Semantic search and LLM synthesis
app.post("/query", async (req, res) => {
    try {
        if (!req.body || !req.body.question || !req.body.question.trim()) {
            return res.status(400).json({ error: "Property 'question' is required in request body." });
        }

        const question = req.body.question.trim();
        const sessionId = req.body.sessionId || req.headers['x-session-id'] || 'default';
        const filename = req.body.filename ? req.body.filename.trim() : null;

        // Check if any documents exist for this session
        const countCheck = await pool.query(
            'SELECT COUNT(*) FROM document_chunks WHERE session_id = $1;',
            [sessionId]
        );

        if (parseInt(countCheck.rows[0].count, 10) === 0) {
            return res.status(404).json({
                error: "No documents found in your library. Please upload a PDF document before asking questions."
            });
        }

        const queryEmbedding = await generateEmbedding(question);

        let sqlQuery = "";
        let sqlValues = [];

        if (filename && filename !== 'ALL') {
            sqlQuery = `
                SELECT id, filename, chunk_index, content, (embedding <=> $1) AS distance 
                FROM document_chunks 
                WHERE session_id = $2 AND filename = $3
                ORDER BY distance ASC 
                LIMIT 3;
            `;
            sqlValues = [JSON.stringify(queryEmbedding), sessionId, filename];
        } else {
            sqlQuery = `
                SELECT id, filename, chunk_index, content, (embedding <=> $1) AS distance 
                FROM document_chunks 
                WHERE session_id = $2
                ORDER BY distance ASC 
                LIMIT 3;
            `;
            sqlValues = [JSON.stringify(queryEmbedding), sessionId];
        }

        const result = await pool.query(sqlQuery, sqlValues);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: filename 
                    ? `No relevant content found in '${filename}'.` 
                    : "No matching document content found."
            });
        }

        const contextChunks = result.rows.map(row => ({
            id: row.id,
            filename: row.filename,
            chunkIndex: row.chunk_index,
            content: row.content,
            distance: parseFloat(row.distance)
        }));

        const answer = await aiAnswer(contextChunks, question);

        return res.status(200).json({
            query: question,
            answer: answer,
            targetDocument: filename || "ALL",
            sources: contextChunks.map(c => ({
                id: c.id,
                filename: c.filename,
                chunkIndex: c.chunkIndex,
                content: c.content,
                similarity: Math.max(0, (1 - c.distance)).toFixed(3)
            }))
        });

    } catch (error) {
        console.error("Query error:", error);
        return res.status(500).json({ error: error.message || "Failed to process query and generate answer." });
    }
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) console.error("Database connection error:", err);
    else console.log("PostgreSQL connected at:", res.rows[0].now);
});

app.listen(port, () => {
    console.log(`Server started on port: ${port}`);
});
