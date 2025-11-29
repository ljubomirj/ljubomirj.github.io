const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OUTPUT_FILE = 'knowledge.json';
const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;

// Configuration for file patterns
const HTML_PATTERN = '*.html';
const PDF_PATTERN = 'cvlj*.pdf';

function getFiles(pattern) {
    try {
        // Use ls to get files matching the pattern. 
        // This relies on the shell's glob expansion which matches the user's manual process.
        const output = execSync(`ls ${pattern}`, { encoding: 'utf-8' });
        return output.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
        console.warn(`No files found for pattern: ${pattern}`);
        return [];
    }
}

function extractText(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    try {
        if (ext === '.html') {
            // Use lynx -dump for HTML
            return execSync(`lynx -dump "${filePath}"`, { encoding: 'utf-8' });
        } else if (ext === '.pdf') {
            // Use pdftotext for PDF. Output to stdout (-)
            return execSync(`pdftotext "${filePath}" -`, { encoding: 'utf-8' });
        }
    } catch (error) {
        console.error(`Error extracting text from ${filePath}:`, error.message);
        return '';
    }
    return '';
}

function chunkText(text, source) {
    const chunks = [];
    let start = 0;
    
    // Normalize text: remove excessive whitespace
    const cleanText = text.replace(/\s+/g, ' ').trim();

    while (start < cleanText.length) {
        const end = Math.min(start + CHUNK_SIZE, cleanText.length);
        let chunk = cleanText.substring(start, end);
        
        // Try to break at a sentence boundary if possible, but don't lose too much content
        if (end < cleanText.length) {
            const lastPeriod = chunk.lastIndexOf('.');
            if (lastPeriod > CHUNK_SIZE * 0.8) { // Only if it's near the end
                chunk = chunk.substring(0, lastPeriod + 1);
                start += (lastPeriod + 1) - CHUNK_OVERLAP; 
            } else {
                start += CHUNK_SIZE - CHUNK_OVERLAP;
            }
        } else {
            start += CHUNK_SIZE - CHUNK_OVERLAP;
        }

        chunks.push({
            source: source,
            content: chunk.trim()
        });
    }
    return chunks;
}

function main() {
    console.log('Starting knowledge base generation...');
    
    const htmlFiles = getFiles(HTML_PATTERN);
    const pdfFiles = getFiles(PDF_PATTERN);
    const allFiles = [...htmlFiles, ...pdfFiles];

    console.log(`Found ${allFiles.length} files to process.`);

    let allChunks = [];

    for (const file of allFiles) {
        // Skip the output file itself if it happens to match (unlikely with current patterns but good practice)
        // Also skip the chat interface itself to avoid recursion if it were indexed
        if (file === 'post-chat-LJ.html') continue; 
        if (file.startsWith('twitter-history')) {
             // Special handling for large twitter history if needed, or just let it process
             // The user's prompt command used `head -1000 twitter-history.html`, maybe we should respect that?
             // For now, let's process the whole thing but be aware it might be slow.
             // Actually, the user's manual process was:
             // head -1000 twitter-history.html >twitter-history-sample.html
             // We should probably check if twitter-history-sample.html exists and use that, 
             // OR just process the big file. 
             // Let's stick to the simple glob for now, but maybe exclude the huge raw history if a sample exists?
             // The user's glob `post-*.html` excludes `twitter-history.html`.
             // Wait, the user's command was: `for a in *.html`. That INCLUDES twitter-history.html.
             // But in the "short" prompt generation they used `head -1000`.
             // Let's filter out the huge twitter-history.html to avoid bloating the vector search with low-value tweets for now,
             // unless it's the sample.
             if (file === 'twitter-history.html') {
                 console.log('Skipping full twitter-history.html to avoid noise. Use twitter-history-sample.html if available.');
                 continue;
             }
        }

        console.log(`Processing ${file}...`);
        const text = extractText(file);
        if (text) {
            const chunks = chunkText(text, file);
            allChunks = allChunks.concat(chunks);
            console.log(`  -> Generated ${chunks.length} chunks.`);
        }
    }

    const output = {
        generatedAt: new Date().toISOString(),
        chunks: allChunks
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`Successfully wrote ${allChunks.length} chunks to ${OUTPUT_FILE}`);
}

main();
