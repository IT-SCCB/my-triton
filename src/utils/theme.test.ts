import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyThemeToBody,
  readStoredTheme,
  resolveInitialTheme,
  saveThemePreference,
  THEME_STORAGE_KEY,
} from './theme';

function createMockGlobals(initialStorage: Record<string, string> = {}, prefersDark = false) {
  const store = new Map<string, string>(Object.entries(initialStorage));
  const bodyClasses = new Set<string>();

  const mockWindow = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
    matchMedia: (query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
    }),
  };

  const mockDocument = {
    body: {
      classList: {
        toggle: (cls: string, force?: boolean) => {
          const shouldAdd = force !== undefined ? force : !bodyClasses.has(cls);
          if (shouldAdd) {
            bodyClasses.add(cls);
          } else {
            bodyClasses.delete(cls);
          }
          return shouldAdd;
        },
        contains: (cls: string) => bodyClasses.has(cls),
      },
    },
  };

  return { store, bodyClasses, mockWindow, mockDocument };
}

test('theme helpers resolve stored preference, toggle body.dark, and persist to localStorage', () => {
  const prevWindow = (globalThis as { window?: unknown }).window;
  const prevDocument = (globalThis as { document?: unknown }).document;

  try {
    const env = createMockGlobals({ [THEME_STORAGE_KEY]: 'dark' }, false);
    (globalThis as { window: unknown }).window = env.mockWindow;
    (globalThis as { document: unknown }).document = env.mockDocument;

    assert.equal(readStoredTheme(), 'dark');
    assert.equal(resolveInitialTheme(), 'dark');

    applyThemeToBody('dark');
    assert.equal(env.bodyClasses.has('dark'), true);

    applyThemeToBody('light');
    saveThemePreference('light');
    assert.equal(env.bodyClasses.has('dark'), false);
    assert.equal(env.store.get(THEME_STORAGE_KEY), 'light');
  } finally {
    (globalThis as { window?: unknown }).window = prevWindow;
    (globalThis as { document?: unknown }).document = prevDocument;
  }
});

test('resolveInitialTheme falls back to system dark preference when localStorage is empty', () => {
  const prevWindow = (globalThis as { window?: unknown }).window;
  try {
    const darkEnv = createMockGlobals({}, true);
    (globalThis as { window: unknown }).window = darkEnv.mockWindow;
    assert.equal(resolveInitialTheme(), 'dark');

    const lightEnv = createMockGlobals({}, false);
    (globalThis as { window: unknown }).window = lightEnv.mockWindow;
    assert.equal(resolveInitialTheme(), 'light');
  } finally {
    (globalThis as { window?: unknown }).window = prevWindow;
  }
});
