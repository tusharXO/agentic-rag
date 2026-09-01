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
    // Normalize whitespace, then strip stray Markdown formatting that often
    // leaks into PDFs exported from Markdown sources (Pandoc, slide tools,
    // etc.). We keep the readable text but drop the syntax that would
    // otherwise echo back into Gemini's output and confuse retrieval.
    const cleanText = text
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        // Collapse 3+ blank lines into a single paragraph break.
        .replace(/\n{3,}/g, '\n\n')
        // Strip leading Markdown bullets / list markers at the start of a line.
        .replace(/^\s*[*\-+]\s+/gm, '')
        // Strip Markdown bold / italic markers.
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1')
        // Strip inline code backticks (keep contents).
        .replace(/`([^`]+)`/g, '$1')
        // Strip Markdown link syntax, keep the label.
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim();
    if (!cleanText) return [];

    const paragraphs = cleanText
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(Boolean);

    const chunks = [];
    let current = '';

    const flush = () => {
        if (current.trim().length === 0) return;
        chunks.push(current.trim());
        const tail = current.trim().slice(-overlap);
        current = tail;
    };

    for (const paragraph of paragraphs) {
        if (paragraph.length <= chunkSize) {
            if (current.length === 0) {
                current = paragraph;
            } else if (current.length + 2 + paragraph.length <= chunkSize) {
                current = current + '\n\n' + paragraph;
            } else {
                flush();
                current = (current ? current + '\n\n' : '') + paragraph;
            }
            continue;
        }

        flush();
        const sentenceParts = splitLongParagraph(paragraph, chunkSize, overlap);
        for (const part of sentenceParts) {
            if (current.length === 0) {
                current = part;
            } else if (current.length + 2 + part.length <= chunkSize) {
                current = current + '\n\n' + part;
            } else {
                flush();
                current = part;
            }
        }
    }

    flush();
    return chunks.filter(c => c.length > 0);
}


function splitLongParagraph(paragraph, chunkSize, overlap) {
    const sentenceRegex = /[^.!?]+[.!?]+(?=\s+[A-Z]|$)|[^.!?]+$/g;
    const sentences = paragraph.match(sentenceRegex) || [paragraph];
    const pieces = [];

    for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed) continue;

        if (trimmed.length <= chunkSize) {
            pieces.push(trimmed);
            continue;
        }

        // Single sentence longer than chunkSize — hard-slice it.
        let start = 0;
        while (start < trimmed.length) {
            const end = Math.min(start + chunkSize, trimmed.length);
            pieces.push(trimmed.slice(start, end));
            if (end >= trimmed.length) break;
            start = end - overlap;
        }
    }

    return pieces;
}

async function saveDocumentChunks(filename, chunkObject, sessionId = 'default') {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
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

// Build the grounding prompt used for both streaming and non-streaming calls.
function buildPrompt(contextChunks, question) {
    const formattedContext = contextChunks
        .map((chunk, i) => `[Source Chunk ${i + 1} (${chunk.filename || 'Document'})]:\n${chunk.content || chunk}`)
        .join('\n\n');

    return `
You are an intelligent, precise AI research assistant. Answer the user's question accurately and concisely based STRICTLY on the provided context below.
- Do NOT make assumptions or hallucinate information not present in the context.
- If the answer cannot be determined directly from the context, respond with: "I cannot answer this question based on the provided document(s)."
- Highlight key facts and structure your answer with clear bullet points or short paragraphs when appropriate.

CONTEXT:
${formattedContext}

QUESTION:
${question}
`;
}

// Resolve which Gemini model to call. Override via GEMINI_MODEL env var.
function getModelName() {
    return process.env.GEMINI_MODEL || "gemini-3.6-flash";
}

// Stream Gemini's response token-by-token. Yields string chunks as they
// arrive. Errors propagate to the caller.
async function* streamAnswer(contextChunks, question) {
    const prompt = buildPrompt(contextChunks, question);
    const response = await ai.models.generateContentStream({
        model: getModelName(),
        contents: prompt,
        // Cap output length so a single response can't run for 15+ seconds.
        // Adjust via env if you want longer answers; default keeps first-token
        // latency under ~2s for typical context sizes.
        config: {
            maxOutputTokens: parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '800', 10),
        },
    });
    for await (const chunk of response) {
        // Each chunk may contain a partial `text` field; concatenate and yield.
        const text = chunk.text
            || chunk.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')
            || '';
        if (text) yield text;
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

// POST /query - Semantic search and LLM synthesis (SSE streamed)
//
// Wire format (text/event-stream):
//   event: sources\n data: <json with sources + targetDocument>\n\n
//   event: token\n   data: {"t": "<text delta>"}\n\n        (one or more)
//   event: done\n    data: {}\n\n
//   event: error\n   data: {"error": "<message>"}\n\n
app.post("/query", async (req, res) => {
    if (!req.body || !req.body.question || !req.body.question.trim()) {
        return res.status(400).json({ error: "Property 'question' is required in request body." });
    }

    const question = req.body.question.trim();
    const sessionId = req.body.sessionId || req.headers['x-session-id'] || 'default';
    const filename = req.body.filename ? req.body.filename.trim() : null;

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sendEvent = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // SSE comment line — defeats intermediate buffering on most proxies
    // (nginx, Render, etc.) and keeps the connection warm. Sent once at
    // the start; the browser ignores comment lines.
    res.write(`: connected ${Date.now()}\n\n`);

    try {
        // Verify the session has any documents at all.
        const countCheck = await pool.query(
            'SELECT COUNT(*) FROM document_chunks WHERE session_id = $1;',
            [sessionId]
        );

        if (parseInt(countCheck.rows[0].count, 10) === 0) {
            sendEvent('error', { error: "No documents found in your library. Please upload a PDF document before asking questions." });
            return res.end();
        }

        const queryEmbedding = await generateEmbedding(question);

        let sqlQuery;
        let sqlValues;
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
            sendEvent('error', {
                error: filename
                    ? `No relevant content found in '${filename}'.`
                    : "No matching document content found."
            });
            return res.end();
        }

        const contextChunks = result.rows.map(row => ({
            id: row.id,
            filename: row.filename,
            chunkIndex: row.chunk_index,
            content: row.content,
            distance: parseFloat(row.distance)
        }));

        // Send the sources up front so the UI can render the citation
        // drawer immediately, then start streaming the answer.
        sendEvent('sources', {
            targetDocument: filename || "ALL",
            sources: contextChunks.map(c => ({
                id: c.id,
                filename: c.filename,
                chunkIndex: c.chunkIndex,
                content: c.content,
                similarity: Math.max(0, (1 - c.distance)).toFixed(3)
            }))
        });

        // Tear down the stream if the client disconnects mid-generation.
        let aborted = false;
        req.on('close', () => { aborted = true; });

        for await (const text of streamAnswer(contextChunks, question)) {
            if (aborted) break;
            sendEvent('token', { t: text });
        }

        sendEvent('done', {});
        return res.end();
    } catch (error) {
        console.error("Query error:", error);
        try {
            sendEvent('error', { error: error.message || "Failed to process query and generate answer." });
            res.end();
        } catch {
            // Connection already closed; nothing more to do.
        }
    }
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) console.error("Database connection error:", err);
    else console.log("PostgreSQL connected at:", res.rows[0].now);
});

app.listen(port, () => {
    console.log(`Server started on port: ${port}`);
});
