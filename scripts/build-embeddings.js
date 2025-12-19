// Generate semantic embeddings for knowledge.json using @xenova/transformers (CPU-only, Vercel-friendly).
// Outputs knowledge-embeddings.json with vectors + metadata for server-side retrieval.

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_FILE = path.join(__dirname, '..', 'knowledge.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'knowledge-embeddings.json');
const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';

async function loadPipeline(modelId) {
    const { pipeline } = await import('@xenova/transformers');
    return pipeline('feature-extraction', modelId);
}

async function main() {
    const modelId = process.env.EMBED_MODEL || DEFAULT_MODEL;
    const limit = parseInt(process.env.EMBED_LIMIT || '0', 10); // optional debugging limiter

    if (!fs.existsSync(KNOWLEDGE_FILE)) {
        console.error(`Missing knowledge file at ${KNOWLEDGE_FILE}. Run scripts/build-knowledge.js first.`);
        process.exit(1);
    }

    const knowledge = JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, 'utf8'));
    let chunks = knowledge.chunks || [];
    if (limit > 0) {
        chunks = chunks.slice(0, limit);
        console.warn(`EMBED_LIMIT set; using first ${limit} chunks for embeddings.`);
    }

    console.log(`Embedding ${chunks.length} chunks using model ${modelId}...`);
    const extractor = await loadPipeline(modelId);

    const vectors = [];
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const output = await extractor(chunk.content, { pooling: 'mean', normalize: true });
        const embedding = Array.from(output.data); // Float32Array -> plain array for JSON
        vectors.push({
            id: i,
            source: chunk.source,
            content: chunk.content,
            embedding
        });
        if ((i + 1) % 50 === 0) {
            console.log(`  processed ${i + 1}/${chunks.length}`);
        }
    }

    const dimension = vectors[0]?.embedding?.length || 0;
    const payload = {
        generatedAt: new Date().toISOString(),
        model: modelId,
        dimension,
        count: vectors.length,
        vectors
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));
    console.log(`Wrote embeddings to ${OUTPUT_FILE} (count=${vectors.length}, dim=${dimension})`);
}

main().catch((err) => {
    console.error('Failed to build embeddings:', err);
    process.exit(1);
});
