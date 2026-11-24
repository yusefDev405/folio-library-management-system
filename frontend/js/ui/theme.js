const SCHEME_KEY = 'color-scheme';
const PAPER_KEY = 'folio-paper';

export function getSystemScheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getSchemeOverride() {
  try {
    const val = localStorage.getItem(SCHEME_KEY);
    return val === 'light' || val === 'dark' ? val : 'system';
  } catch {
    return 'system';
  }
}

export function setSchemeOverride(scheme) {
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (scheme === 'light' || scheme === 'dark') {
    if (meta) meta.content = scheme;
    try {
      localStorage.setItem(SCHEME_KEY, scheme);
    } catch {
      // ignore storage block
    }
  } else {
    if (meta) meta.content = 'light dark';
    try {
      localStorage.removeItem(SCHEME_KEY);
    } catch {
      // ignore
    }
  }
}

export function getPaperTint() {
  try {
    return localStorage.getItem(PAPER_KEY) === 'sepia' ? 'sepia' : 'archival';
  } catch {
    return 'archival';
  }
}

export function setPaperTint(paper) {
  if (paper === 'sepia') {
    document.documentElement.dataset.paper = 'sepia';
    try {
      localStorage.setItem(PAPER_KEY, 'sepia');
    } catch {
      // ignore
    }
  } else {
    delete document.documentElement.dataset.paper;
    try {
      localStorage.removeItem(PAPER_KEY);
    } catch {
      // ignore
    }
  }
}

export function initThemeSync() {
  window.addEventListener('storage', (e) => {
    if (e.key === SCHEME_KEY) {
      setSchemeOverride(e.newValue === 'light' || e.newValue === 'dark' ? e.newValue : 'system');
    } else if (e.key === PAPER_KEY) {
      setPaperTint(e.newValue === 'sepia' ? 'sepia' : 'archival');
    }
  });
}
