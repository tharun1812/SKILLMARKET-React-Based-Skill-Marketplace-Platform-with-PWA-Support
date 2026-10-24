import '@testing-library/jest-dom/vitest';
import { MotionGlobalConfig } from 'framer-motion';

// Skip animations so dialogs open and close instantly in tests.
MotionGlobalConfig.skipAnimations = true;

// jsdom does not implement matchMedia (every real browser does); react-hot-toast and framer-motion read it.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  });
}
