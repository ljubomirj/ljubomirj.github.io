.PHONY: install install-npm install-know knowledge embeddings feeds bookmarklet all

# Install JS dependencies (uses package-lock.json for exact versions)
install-npm:
	npm install

# Install knowledge tooling (lynx, pdftotext) for macOS Homebrew or apt-based Linux
install-know:
	@if command -v brew >/dev/null 2>&1; then \
		echo "Detected Homebrew; installing lynx and poppler (pdftotext)..."; \
		brew list --versions lynx >/dev/null 2>&1 || brew install lynx; \
		brew list --versions poppler >/dev/null 2>&1 || brew install poppler; \
	elif command -v apt-get >/dev/null 2>&1; then \
		echo "Detected apt; installing lynx and poppler-utils (pdftotext)..."; \
		sudo apt-get update && sudo apt-get install -y lynx poppler-utils; \
	else \
		echo "Unsupported package manager. Install lynx and pdftotext yourself (brew or apt)."; \
		exit 1; \
	fi

# Combined install for convenience
install: install-npm install-know

# Rebuild knowledge.json from local sources (requires lynx and pdftotext)
knowledge:
	node scripts/build-knowledge.js

# Generate semantic embeddings (requires knowledge.json first)
embeddings: knowledge
	npm run build:embeddings

# Build RSS + Atom feeds
feeds:
	python3 scripts/build-feeds.py

# Produce bookmarklet minified copy via inline Node script (see instructions in .js file)
twitter-LJ-posts-archive-bookmarklet.txt: twitter-LJ-posts-archive-bookmarklet.js
	node scripts/build-bookmarklet.js

# Default pipeline: rebuild knowledge + embeddings + feeds
all: embeddings feeds
