import { CARD_TYPES } from '@rgux/contracts';

/**
 * Shell only (#50). This page exists to prove the app builds and that the
 * contracts package is reachable across the workspace link; the card types
 * below are read from the discriminated union at runtime rather than listed
 * here, so this page cannot drift from the contract.
 *
 * Card components are #18. Nothing on this page renders corpus content.
 */
export default function Home() {
  return (
    <main
      style={{
        maxWidth: '46rem',
        margin: '0 auto',
        padding: '3rem 1.5rem',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: '1.25rem', margin: 0 }}>rag-generative-ui-explorer</h1>
      <p style={{ color: '#5a6470' }}>
        Application shell. No retrieval, no generation, and no corpus content is rendered
        here yet.
      </p>
      <h2 style={{ fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        Card types defined by @rgux/contracts
      </h2>
      <ul>
        {CARD_TYPES.map((type) => (
          <li key={type}>
            <code>{type}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}
