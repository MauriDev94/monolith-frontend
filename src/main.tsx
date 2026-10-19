import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
// Self-hosted fonts (no runtime request to Google Fonts). See ADR 0001.
import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import '@/styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
