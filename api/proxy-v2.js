const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// --- Tree index (loaded once, cached across warm invocations) ---
let treeIndex = null;   // lightweight: titles + node_ids + source_file (no text)
let treeData = null;    // full: titles + text + node_ids
let nodeMap = null;     // flat map: node_id -> { title, text, source_file }

function loadTreeData() {
    if (treeIndex && treeData && nodeMap) return;
    try {
        const indexPath = path.join(__dirname, '..', 'v2', 'tree-index.json');
        const dataPath = path.join(__dirname, '..', 'v2', 'tree-with-text.json');
        treeIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        treeData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        nodeMap = buildNodeMap(treeData);
        console.log(`Loaded tree index: ${Object.keys(nodeMap).length} nodes`);
    } catch (err) {
        console.error('Failed to load tree data:', err.message);
        treeIndex = null;
        treeData = null;
        nodeMap = null;
    }
}

function buildNodeMap(tree) {
    const map = {};
    function walk(nodes) {
        for (const node of nodes) {
            map[node.node_id] = {
                title: node.title,
                text: node.text || '',
                source_file: node.source_file || '',
            };
            if (node.nodes && node.nodes.length > 0) walk(node.nodes);
        }
    }
    walk(tree);
    return map;
}

// --- CORS ---
const allowedOrigins = [
    'https://ljubomirj.github.io',
    'http://localhost:8000',
    'http://127.0.0.1:8000'
];

function handleCors(req, res) {
    const origin = req.headers.origin;
    const allowed = origin && allowedOrigins.includes(origin);
    if (allowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Max-Age', '86400');
    }
    return allowed;
}

// --- LLM helper ---
async function callLLM(messages, { temperature = 0, maxTokens = 1024 } = {}) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: false,
        }),
    });

    if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`LLM call failed (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    if (!data?.choices?.[0]?.message?.content) {
        throw new Error('LLM returned unexpected structure');
    }
    return data;
}

// --- Tree search ---
async function treeSearch(userQuestion) {
    loadTreeData();
    if (!treeIndex) return { thinking: '', nodeIds: [], error: 'Tree index not loaded' };

    const prompt = `You are a retrieval assistant for a personal website belonging to Ljubomir Josifovski (LJ), a computational researcher based in the UK.

You are given a question and a hierarchical tree structure of LJ's website content and twitter posts. Each node has a node_id, title, and source_file indicating where it came from.

Your task: identify ALL nodes whose content is likely relevant to answering the question. Be thorough — if in doubt, include the node. Select between 3 and 15 nodes.

Question: ${userQuestion}

Document tree structure:
${JSON.stringify(treeIndex, null, 2)}

Reply in this exact JSON format:
{
    "thinking": "<Your reasoning about which sections are relevant and WHY>",
    "node_list": ["0001", "0002"]
}
Return ONLY the JSON. No markdown fences, no other text.`;

    try {
        const data = await callLLM([{ role: 'user', content: prompt }], {
            temperature: 0,
            maxTokens: 2048,
        });

        const raw = data.choices[0].message.content.trim();
        // Strip markdown code fences if present
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleaned);

        return {
            thinking: parsed.thinking || '',
            nodeIds: Array.isArray(parsed.node_list) ? parsed.node_list : [],
        };
    } catch (err) {
        console.error('Tree search failed:', err.message);
        return { thinking: '', nodeIds: [], error: err.message };
    }
}

// --- Main handler ---
function findLastUserMessageIndex(msgs) {
    for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i]?.role === 'user') return i;
    }
    return -1;
}

module.exports = async (req, res) => {
    const isAllowed = handleCors(req, res);

    if (req.method === 'OPTIONS') {
        return isAllowed ? res.status(204).end() : res.status(403).end();
    }

    if (!isAllowed && req.headers.origin) {
        return res.status(403).json({ error: 'Origin not allowed.' });
    }

    // Validate API key
    if (!process.env.OPENROUTER_API_KEY) {
        console.error('OPENROUTER_API_KEY not set');
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    try {
        const body = req.body;
        const messages = body?.messages;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({
                error: 'Expected JSON with a non-empty messages array.'
            });
        }

        // --- Step 1: Tree search ---
        const messagesForModel = [...messages];
        const lastUserIdx = findLastUserMessageIndex(messagesForModel);
        const userContent = lastUserIdx !== -1
            ? (messagesForModel[lastUserIdx].content || '')
            : '';

        let v2Meta = { tree_search_thinking: '', retrieved_nodes: [] };

        if (userContent) {
            console.log(`[v2] Tree search for: "${userContent.substring(0, 80)}..."`);
            const { thinking, nodeIds, error } = await treeSearch(userContent);

            if (!error && nodeIds.length > 0) {
                loadTreeData();

                // Look up text for retrieved nodes
                const retrieved = nodeIds
                    .filter(id => nodeMap && nodeMap[id])
                    .map(id => ({
                        node_id: id,
                        title: nodeMap[id].title,
                        source_file: nodeMap[id].source_file,
                        text: nodeMap[id].text,
                    }));

                // Cap context size (~24000 chars ≈ ~6000 tokens)
                const maxChars = 24000;
                let usedChars = 0;
                const contextParts = [];
                for (const node of retrieved) {
                    const piece = `[Section: ${node.title} | Source: ${node.source_file}]\n${node.text}`;
                    if (usedChars + piece.length > maxChars) break;
                    contextParts.push(piece);
                    usedChars += piece.length;
                }

                const context = contextParts.join('\n\n---\n\n');
                console.log(`[v2] Retrieved ${retrieved.length} nodes, context ${(usedChars / 1024).toFixed(1)}KB`);

                // Augment last user message with reasoning bridge + context
                messagesForModel[lastUserIdx] = {
                    ...messagesForModel[lastUserIdx],
                    content: `The retrieval system searched through LJ's writings and identified relevant sections.

Retrieval reasoning: "${thinking}"

Relevant content from LJ's writings (weave naturally into your response, don't quote-dump):

${context}

---
${userContent}`
                };

                v2Meta = {
                    tree_search_thinking: thinking,
                    retrieved_nodes: retrieved.map(n => ({
                        node_id: n.node_id,
                        title: n.title,
                        source_file: n.source_file,
                    })),
                };
            } else {
                console.log(`[v2] Tree search returned no results${error ? ': ' + error : ''}, proceeding without context`);
            }
        }

        // --- Step 2: Answer generation ---
        console.log(`[v2] Generating answer with ${messagesForModel.length} messages...`);
        const answerData = await callLLM(messagesForModel, {
            temperature: 0.9,
            maxTokens: 4096,
        });

        // Attach v2 metadata for frontend source attribution
        answerData._v2_meta = v2Meta;

        console.log('[v2] Response generated successfully');
        res.status(200).json(answerData);

    } catch (error) {
        console.error('[v2] Unhandled error:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};
