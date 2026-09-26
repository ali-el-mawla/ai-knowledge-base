# 0004. Structure-aware chunking and its sizes

- Status: accepted
- Date: 2026-09-26

## Context

Retrieval can only return what chunking produced. Fixed-size windows cut through headings, tables and code, and a chunk from the middle of a document often does not say what it is about ("Limits: 120 USD per attendee"). The embedding model sets a ceiling: `nomic-embed-text` under Ollama reads at most 2,048 tokens and silently truncates the rest (checked on Ollama 0.34.4: inputs that differ only after that point get identical vectors).

## Decision

`chunkMarkdown` in `@repo/rag`, pure and unit-tested:

1. **Sections first:** the `marked` lexer splits the blocks. Every heading opens a section that is never merged with another, and its heading path travels with each chunk.
2. **Target about 1,200 characters:** whole blocks are merged until the next one would pass it.
3. **Hard limit 2,000 characters, header included** (the exact embedded text): about 500 tokens, far below the window.
4. **Code blocks and tables stay whole** when they fit the limit. Bigger blocks split at natural boundaries: list items, sentences, then words for prose; lines for code and tables, repeating the fence or header rows.
5. **Overlap only inside a split section:** up to 200 characters of trailing sentences, never across a heading.
6. **Contextual header:** `Document title > heading path` is prepended before embedding.

A naive fixed-size chunker with the same limits is the evaluation baseline.

## Consequences

- Demo corpus: 127 chunks (naive: 67), about 490 characters on average and 1,590 at most, because most sections are shorter than the target. Citations point at focused passages and prompts stay small.
- The header disambiguates generic headings (`Limits` exists in two documents).
- The sizes are reasoned, not tuned. `npm run eval` compares this chunker with the naive one, and only one set of sizes was tested.
- The header is the free form of contextual retrieval; the LLM-written form waits for prompt caching.
