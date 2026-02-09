const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- Configuration ---

const ROOT = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'v2');
const LUA_FILTER = path.join(__dirname, 'strip-nav.lua');
const TWITTER_CLUSTERS_DIR = '/Users/ljubomir/LJ-twitter-clusters-md';

// HTML pages to include (sidebar order), relative to ROOT
const HTML_PAGES = [
    'post-ljubomirj.html',
    'post-why-write.html',
    'post-my-HOME.html',
    'post-social-networks.html',
    'post-twitter.html',
    'post-knowing.html',
    'post-ml-llm-dev.html',
    'post-data-debugging.html',
    'post-picmem.html',
    'post-links-to.html',
    'post-consciousness.html',
    'taste-is-all-you-need-always-has-been.html',
    'a-person-of-good-taste-spoke.html',
    'post-deepwiki.html',
    'index.html',
];

// PDFs to include
const PDF_PATTERN = 'cvlj*.pdf';
const EXTRA_PDFS = ['ljbio.pdf', 'tha.pdf'];

// Twitter cluster markdown files (glob pattern)
const TWITTER_CLUSTER_GLOB = 'logBook-history-theme-*.md';

// --- Helpers ---

function htmlToMarkdown(htmlPath) {
    try {
        const md = execSync(
            `pandoc --from html --to markdown --wrap=none --lua-filter="${LUA_FILTER}" "${htmlPath}"`,
            { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 }
        );
        return md;
    } catch (err) {
        console.error(`pandoc failed for ${htmlPath}: ${err.message}`);
        return '';
    }
}

function pdfToText(pdfPath) {
    try {
        return execSync(`pdftotext "${pdfPath}" -`, {
            encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024
        });
    } catch (err) {
        console.error(`pdftotext failed for ${pdfPath}: ${err.message}`);
        return '';
    }
}

function getPdfFiles() {
    const files = [];
    try {
        const matched = execSync(`ls ${path.join(ROOT, PDF_PATTERN)}`, {
            encoding: 'utf-8'
        }).split('\n').filter(Boolean);
        files.push(...matched);
    } catch (_) { /* no matches */ }
    for (const f of EXTRA_PDFS) {
        const full = path.join(ROOT, f);
        if (fs.existsSync(full) && !files.includes(full)) files.push(full);
    }
    return files;
}

function getTwitterClusterFiles() {
    try {
        const matched = execSync(`ls ${path.join(TWITTER_CLUSTERS_DIR, TWITTER_CLUSTER_GLOB)}`, {
            encoding: 'utf-8'
        }).split('\n').filter(Boolean);
        return matched.sort();
    } catch (_) {
        console.warn('No twitter cluster files found');
        return [];
    }
}

// --- Markdown heading parser (ported from PageIndex page_index_md.py) ---

function extractNodesFromMarkdown(markdownContent) {
    const headerPattern = /^(#{1,6})\s+(.+)$/;
    const codeBlockPattern = /^```/;
    const nodeList = [];
    const lines = markdownContent.split('\n');
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1; // 1-indexed
        const stripped = lines[i].trim();

        if (codeBlockPattern.test(stripped)) {
            inCodeBlock = !inCodeBlock;
            continue;
        }
        if (!stripped) continue;

        if (!inCodeBlock) {
            const match = stripped.match(headerPattern);
            if (match) {
                nodeList.push({
                    title: match[2].trim(),
                    level: match[1].length,
                    lineNum
                });
            }
        }
    }
    return { nodeList, lines };
}

function extractNodeTextContent(nodeList, lines) {
    const nodes = [];
    for (let i = 0; i < nodeList.length; i++) {
        const node = nodeList[i];
        const startLine = node.lineNum - 1; // 0-indexed
        const endLine = (i + 1 < nodeList.length)
            ? nodeList[i + 1].lineNum - 1
            : lines.length;
        const text = lines.slice(startLine, endLine).join('\n').trim();
        nodes.push({ ...node, text });
    }
    return nodes;
}

// Stack-based tree builder (ported from PageIndex build_tree_from_nodes)
function buildTreeFromNodes(nodeList) {
    if (!nodeList.length) return [];

    const stack = []; // [{treeNode, level}]
    const rootNodes = [];
    let counter = 1;

    for (const node of nodeList) {
        const treeNode = {
            title: node.title,
            node_id: String(counter).padStart(4, '0'),
            source_file: node.sourceFile || '',
            text: node.text,
            line_num: node.lineNum,
            nodes: []
        };
        counter++;

        // Pop nodes from stack that are at same or deeper level
        while (stack.length && stack[stack.length - 1].level >= node.level) {
            stack.pop();
        }

        if (!stack.length) {
            rootNodes.push(treeNode);
        } else {
            stack[stack.length - 1].treeNode.nodes.push(treeNode);
        }

        stack.push({ treeNode, level: node.level });
    }
    return rootNodes;
}

// Strip text fields from tree (for lightweight index)
function stripText(tree) {
    return tree.map(node => {
        const cleaned = {
            title: node.title,
            node_id: node.node_id,
            source_file: node.source_file,
        };
        if (node.nodes && node.nodes.length > 0) {
            cleaned.nodes = stripText(node.nodes);
        }
        return cleaned;
    });
}

// Count nodes in tree
function countNodes(tree) {
    let count = 0;
    for (const node of tree) {
        count++;
        if (node.nodes) count += countNodes(node.nodes);
    }
    return count;
}

// --- Source file tracking ---
// We insert special HTML comments <!-- source: filename --> before each page's content.
// After parsing, we map line numbers to source files.

function buildSourceMap(lines) {
    const sourceMap = {}; // lineNum -> sourceFile
    let currentSource = '';
    const sourcePattern = /^<!-- source: (.+) -->$/;
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].trim().match(sourcePattern);
        if (match) {
            currentSource = match[1];
        }
        sourceMap[i + 1] = currentSource; // 1-indexed
    }
    return sourceMap;
}

// --- Main ---

function main() {
    console.log('Building v2 tree index...\n');

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const parts = [];

    // 1. HTML pages
    console.log('Processing HTML pages...');
    for (const file of HTML_PAGES) {
        const fullPath = path.join(ROOT, file);
        if (!fs.existsSync(fullPath)) {
            console.warn(`  Skipping missing: ${file}`);
            continue;
        }
        const md = htmlToMarkdown(fullPath);
        if (md.trim()) {
            parts.push(`<!-- source: ${file} -->\n${md}`);
            console.log(`  + ${file} (${md.length} chars)`);
        }
    }

    // 2. PDFs
    console.log('\nProcessing PDFs...');
    const pdfFiles = getPdfFiles();
    for (const pdfPath of pdfFiles) {
        const basename = path.basename(pdfPath);
        const text = pdfToText(pdfPath);
        if (text.trim()) {
            // Wrap in synthetic heading since PDFs have no markdown headings
            parts.push(`<!-- source: ${basename} -->\n# [PDF] ${basename}\n\n${text}`);
            console.log(`  + ${basename} (${text.length} chars)`);
        }
    }

    // 3. Twitter cluster markdown files
    console.log('\nProcessing twitter clusters...');
    const clusterFiles = getTwitterClusterFiles();
    for (const clusterPath of clusterFiles) {
        const basename = path.basename(clusterPath);
        const content = fs.readFileSync(clusterPath, 'utf-8');
        if (content.trim()) {
            parts.push(`<!-- source: ${basename} -->\n${content}`);
            console.log(`  + ${basename} (${content.length} chars)`);
        }
    }

    // 4. Concatenate
    const allContent = parts.join('\n\n');
    const allContentPath = path.join(OUTPUT_DIR, 'all-content.md');
    fs.writeFileSync(allContentPath, allContent, 'utf-8');
    console.log(`\nConcatenated: ${allContentPath} (${(allContent.length / 1024).toFixed(0)} KB)`);

    // 5. Parse headings and build tree
    console.log('\nParsing headings...');
    const { nodeList: rawNodes, lines } = extractNodesFromMarkdown(allContent);
    console.log(`  Found ${rawNodes.length} headings`);

    // 6. Extract text content
    const nodesWithText = extractNodeTextContent(rawNodes, lines);

    // 7. Map source files to nodes
    const sourceMap = buildSourceMap(lines);
    for (const node of nodesWithText) {
        node.sourceFile = sourceMap[node.lineNum] || '';
    }

    // 8. Build tree
    console.log('Building tree...');
    const tree = buildTreeFromNodes(nodesWithText);
    const totalNodes = countNodes(tree);
    console.log(`  Tree has ${tree.length} root nodes, ${totalNodes} total nodes`);

    // 9. Output full tree (with text)
    const treeWithTextPath = path.join(OUTPUT_DIR, 'tree-with-text.json');
    fs.writeFileSync(treeWithTextPath, JSON.stringify(tree, null, 2), 'utf-8');
    const treeWithTextSize = fs.statSync(treeWithTextPath).size;
    console.log(`  ${treeWithTextPath} (${(treeWithTextSize / 1024).toFixed(0)} KB)`);

    // 10. Output lightweight index (no text)
    const treeIndex = stripText(tree);
    const treeIndexPath = path.join(OUTPUT_DIR, 'tree-index.json');
    fs.writeFileSync(treeIndexPath, JSON.stringify(treeIndex, null, 2), 'utf-8');
    const treeIndexSize = fs.statSync(treeIndexPath).size;
    console.log(`  ${treeIndexPath} (${(treeIndexSize / 1024).toFixed(0)} KB)`);

    console.log('\nDone!');
}

main();
