/**
 * Tokenises text for lexical retrieval.
 *
 * The tokeniser is a decision with consequences, not a detail: this corpus is
 * dense with terms a naive split-on-every-non-alphanumeric destroys — `nDCG`,
 * `Recall@10`, `pgvector`, `AG-UI`, `text/html;profile=mcp-app`. Split on every
 * non-alphanumeric, `Recall@10` becomes `recall` + `10`, `AG-UI` becomes `ag`
 * + `ui`, and `text/html;profile=mcp-app` becomes five fragments. Lexical
 * retrieval matches a query term to a document term literally, so those are
 * exactly the terms it exists to match.
 *
 * Rule: lower-case the text, then take maximal runs of the characters that
 * occur *inside* technical identifiers — letters, digits, and `@ - / _` — as
 * tokens. Everything else is a boundary: whitespace, and the punctuation that
 * *delimits* rather than joins (`;`, `=`, `:`, `,`, `.`, quotes, brackets).
 * `.` is always a boundary, so a sentence-final `word.` tokenises the same as
 * a bare `word`, and `Next.js` becomes `next` + `js` — both sides of the match
 * split identically, so the term is still reachable. Runs with no letter or
 * digit (`---`, `//`) are dropped.
 *
 * The same function indexes documents and parses queries; a term matches only
 * when both sides split it the same way, which is the consistency lexical
 * retrieval depends on.
 */
const TOKEN = /[a-z0-9@\-\/_]+/g;

export function tokenise(text: string): string[] {
  const tokens = text.toLowerCase().match(TOKEN) ?? [];
  return tokens.filter((token) => /[a-z0-9]/.test(token));
}
