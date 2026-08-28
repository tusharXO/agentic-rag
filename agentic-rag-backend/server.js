require("dotenv").config();
const express = require("express");
const multer = require("multer");
const { PDFParse } = require('pdf-parse');
const { generateEmbedding } = require("./embedding");
const pool = require("./db");
const { GoogleGenAI } = require("@google/genai");
const cors = require("cors");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

const storage = multer.memoryStorage();
const upload = multer({ storage });

const app = express()
app.use(cors())
app.use(express.json());
const port = process.env.PORT || 3000;

function chunkText(text, chunkSize = 1000, overlap = 200) {
    const chunk = []
    let start = 0

    while (start < text.length) {
        const end = start + chunkSize
        chunk.push(text.slice(start, end))
        start += (chunkSize - overlap);
    }

    return chunk;
}

async function saveDocumentChunks(filename, chunkObject) {

    const client = await pool.connect()

    try {
        await client.query('BEGIN')
        await client.query('DELETE FROM document_chunks WHERE filename = $1;',[filename])
        const text = 'INSERT INTO document_chunks (filename,chunk_index,content,embedding) VALUES($1,$2,$3,$4)';

        for (const chunk of chunkObject) {
            await client.query(text, [
                filename,
                chunk.chunkIndex,
                chunk.text,
                JSON.stringify(chunk.embedding)
            ])
        }

        await client.query('COMMIT')
    } catch (error) {
        await client.query('ROLLBACK')
        throw error;
    } finally {
        client.release()
    }
}

async function aiAnswer(contextChunks, question) {

    const formattedContext = contextChunks.map((chunk, i) => `[Chunk ${i + 1}]:\n${chunk}`).join('\n\n');

    const prompt = `
    You are an AI assistant answering questions based STRICTLY on the provided context below.
    If the answer cannot be found in the context, say "I cannot answer this based on the provided document."

    CONTEXT:
    ${formattedContext}

    QUESTION:
    ${question}
    `;

    const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
    })
    return response.text;
}

app.get("/", (req, res) => {
    res.send("hello world")
})

app.post("/upload", upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploded" })
        }
        const parser = new PDFParse({ data: req.file.buffer })
        const result = await parser.getText()
        await parser.destroy();

        const chunks = chunkText(result.text);
 
        const chunkObject = await Promise.all(
            chunks.map(async (text, index) => {
                const embedding = await generateEmbedding(text)
                return {
                    chunkIndex: index,
                    text: text,
                    embedding: embedding
                }
            })
        )

        await saveDocumentChunks(req.file.originalname, chunkObject)

        return res.json({
            filename: req.file.originalname,
            totalchunks: chunkObject.length,
            chunks: chunkObject
        })

    }
    catch (error) {
        console.log("Upload error:", error)
        return res.status(500).json({ error: "Internal server error" })
    }
})

app.post("/query", async (req, res) => {
    if (!req.body || !req.body.question) {
        return res.status(400).json({ error: "Property 'question' is required in request body" })
    }

    const queryEmbedding = await generateEmbedding(req.body.question)

    const sqlQuery = "SELECT id,filename,chunk_index,content,(embedding <=> $1) AS distance FROM document_chunks ORDER BY distance ASC LIMIT 2;"

    const sqlValue = [JSON.stringify(queryEmbedding)]

    const result = await pool.query(sqlQuery, sqlValue)

    const contextChunks = result.rows.map(row => row.content)

    const answer = await aiAnswer(contextChunks, req.body.question)

    return res.status(200).json({
        query: req.body.question,
        answer: answer,
        sources: contextChunks
    })
})

pool.query('SELECT NOW()', (err, res) => {
    if (err) console.log("Database connection error:", err)
    else console.log("PostgreSQL connected at:", res.rows[0].now)
})

app.listen(port, () => {
    console.log(`server started on port:${port}`)
})

