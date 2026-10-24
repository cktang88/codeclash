import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './Root.tsx';
import './styles.css';
import { bakeTextures } from './ui/textures.ts';
import { bootServiceWorker } from './sw/register.ts';

bakeTextures();

// After the page is up: the handshake and registration never hold up the first paint.
addEventListener('load', () => void bootServiceWorker(), { once: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
