import { describe, expect, it } from 'vitest';
import { tokenise } from '../src/tokeniser.js';

/**
 * The tokenisation rule is a decision with consequences (see tokeniser.ts):
 * terms this corpus is dense with must survive as single tokens, or lexical
 * retrieval cannot match them. Each case names the reason the split is the
 * one the retrieval behaviour depends on.
 */
describe('tokenise', () => {
  it('keeps an alphanumeric acronym whole and lower-cases it', () => {
    expect(tokenise('nDCG')).toEqual(['ndcg']);
  });

  it('keeps @ inside a term, so Recall@10 is one token rather than recall + 10', () => {
    expect(tokenise('Recall@10')).toEqual(['recall@10']);
    expect(tokenise('Recall@K')).toEqual(['recall@k']);
  });

  it('keeps a product name intact', () => {
    expect(tokenise('pgvector')).toEqual(['pgvector']);
  });

  it('keeps the hyphen in AG-UI, so it is one token rather than ag + ui', () => {
    expect(tokenise('AG-UI')).toEqual(['ag-ui']);
  });

  it('splits only on the delimiters, keeping / and - inside their terms', () => {
    // `;` and `=` delimit the MIME type from its profile parameters; `/` and
    // `-` join `text/html` and `mcp-app`, which are the terms that matter.
    expect(tokenise('text/html;profile=mcp-app')).toEqual(['text/html', 'profile', 'mcp-app']);
  });

  it('treats a full stop as a boundary, so a sentence-final word matches a bare one', () => {
    expect(tokenise('built.')).toEqual(['built']);
    expect(tokenise('Next.js')).toEqual(['next', 'js']);
  });

  it('drops runs with no letter or digit', () => {
    expect(tokenise('--- //')).toEqual([]);
  });

  it('returns nothing for empty or punctuation-only input', () => {
    expect(tokenise('')).toEqual([]);
    expect(tokenise('?!.;=')).toEqual([]);
  });
});
