const fs = require('fs');
const fetch = require('node-fetch');

// Load tree data
const treeIndex = JSON.parse(fs.readFileSync('v2/tree-index.json', 'utf8'));
const treeData = JSON.parse(fs.readFileSync('v2/tree-with-text.json', 'utf8'));

function buildNodeMap(tree) {
    const map = {};
    function walk(nodes) {
        for (const n of nodes) {
            map[n.node_id] = { title: n.title, text: n.text || '', source_file: n.source_file || '' };
            if (n.nodes && n.nodes.length > 0) walk(n.nodes);
        }
    }
    walk(tree);
    return map;
}
const nodeMap = buildNodeMap(treeData);

const userQuestion = process.argv[2] || 'What is your background and what do you work on?';

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

console.log('Question:', userQuestion);
console.log('Tree search prompt:', prompt.length, 'chars (~' + Math.round(prompt.length / 4) + ' tokens)');
console.log('Calling OpenRouter (gemini-2.5-flash)...\n');

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error('OPENROUTER_API_KEY not set'); process.exit(1); }

(async () => {
    const t0 = Date.now();
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0,
            max_tokens: 2048,
            stream: false,
        }),
    });
    const t1 = Date.now();
    console.log('Tree search: ' + (t1 - t0) + 'ms, status ' + resp.status);

    if (!resp.ok) {
        console.error('ERROR:', await resp.text());
        process.exit(1);
    }

    const data = await resp.json();
    const raw = data.choices[0].message.content.trim();
    // Strip markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    } catch (e) {
        console.error('Failed to parse LLM response as JSON:');
        console.error(raw);
        process.exit(1);
    }

    console.log('\n--- Thinking ---');
    console.log(parsed.thinking);
    console.log('\n--- Retrieved nodes (' + parsed.node_list.length + ') ---');
    let totalChars = 0;
    for (const id of parsed.node_list) {
        const n = nodeMap[id];
        if (n) {
            console.log('  ' + id + ' [' + n.source_file + '] ' + n.title + ' (' + n.text.length + ' chars)');
            totalChars += n.text.length;
        } else {
            console.log('  ' + id + ' *** NOT FOUND ***');
        }
    }
    console.log('\nTotal context: ' + totalChars + ' chars (~' + Math.round(totalChars / 4) + ' tokens)');

    // Now test answer generation
    console.log('\n--- Answer generation ---');
    const maxChars = 24000;
    let usedChars = 0;
    const contextParts = [];
    for (const id of parsed.node_list) {
        const n = nodeMap[id];
        if (!n) continue;
        const piece = '[Section: ' + n.title + ' | Source: ' + n.source_file + ']\n' + n.text;
        if (usedChars + piece.length > maxChars) break;
        contextParts.push(piece);
        usedChars += piece.length;
    }
    const context = contextParts.join('\n\n---\n\n');

    const systemPrompt = `You are Ljubomir Josifovski (LJ) — a computational researcher based in Harpenden, UK, originally from Macedonia. You think in probability distributions, information theory, and cross-domain analogies.

Your voice:
- Conversational but precise. Mix colloquialisms ("TBH", "b/c", "afaics") with formal mathematical language when it fits.
- Dry, observational humor. You'd call your own chatbot "ELIZA-level poor approximation" without blinking.
- Transparently uncertain — mark gaps with "TBD" and admit when you don't know rather than bluffing.
- Cross-domain connections are your reflex: probability <-> life, computation <-> consciousness, information <-> physics.
- Short punchy statements mixed with denser compound sentences that have parenthetical asides (like this one).
- Substance over politeness. Don't pad responses with filler phrases like "Great question!" or "I'd be happy to help."

How to handle context:
- You'll sometimes receive context snippets from LJ's actual writings. Weave relevant bits naturally into your answers — never quote-dump them verbatim or say "According to my writings..."
- If context isn't relevant to the question, just ignore it.
- When you genuinely don't know something, say so. "Not sure about that one" is fine.
- Keep answers concise. Use code examples when relevant, markdown for code blocks.
- You're talking as LJ in first person, not about LJ in third person.`;

    const userMsg = `The retrieval system searched through LJ's writings and identified relevant sections.

Retrieval reasoning: "${parsed.thinking}"

Relevant content from LJ's writings (weave naturally into your response, don't quote-dump):

${context}

---
${userQuestion}`;

    console.log('Context: ' + usedChars + ' chars (~' + Math.round(usedChars / 4) + ' tokens)');
    console.log('Calling OpenRouter for answer...\n');

    const t2 = Date.now();
    const resp2 = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMsg },
            ],
            temperature: 0.9,
            max_tokens: 4096,
            stream: false,
        }),
    });
    const t3 = Date.now();
    console.log('Answer generation: ' + (t3 - t2) + 'ms, status ' + resp2.status);

    if (!resp2.ok) {
        console.error('ERROR:', await resp2.text());
        process.exit(1);
    }

    const data2 = await resp2.json();
    const answer = data2.choices[0].message.content;
    console.log('\n=== ANSWER ===');
    console.log(answer);
    console.log('\n=== TIMING ===');
    console.log('Tree search: ' + (t1 - t0) + 'ms');
    console.log('Answer gen:  ' + (t3 - t2) + 'ms');
    console.log('Total:       ' + (t3 - t0) + 'ms');
})();
