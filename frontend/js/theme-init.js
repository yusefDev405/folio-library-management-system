/* Synchronous FOUC-prevention script (no inline JS to preserve strict CSP) */
try {
  const storedScheme = localStorage.getItem('color-scheme');
  if (storedScheme === 'light' || storedScheme === 'dark') {
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.content = storedScheme;
  }
  const paper = localStorage.getItem('folio-paper');
  if (paper === 'sepia') {
    document.documentElement.dataset.paper = 'sepia';
  }
} catch {
  /* ignore storage errors */
}
