const { pipeline } = require("@xenova/transformers")

let pipe = null
let pipelinePromise = null;

async function generateEmbedding(text) {

    if (!pipe && !pipelinePromise) {
        console.log("loaing model for the first time ")
        pipelinePromise = pipeline('feature-extraction', "Xenova/all-MiniLM-L6-v2")
    }

    if(!pipe) {
        pipe = await pipelinePromise
        console.log("AI model succesfully loaded")
    }

    const output = await pipe(text, { pooling: "mean", normalize: true })

    const embeddingArray = Array.from(output.data)
    
    return embeddingArray;

}

module.exports = { generateEmbedding };