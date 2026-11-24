import { escapeHtml } from './format.js';

// Pure-SVG Code-39 barcode patterns (1 = wide bar/space, 0 = narrow)
const CODE39 = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
  '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
  'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
  'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
  'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
  'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
  'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
  '-': '010000101', '.': '110000100', ' ': '011000100', '*': '010010100',
};

export function renderCode39Svg(rawValue, { height = 42 } = {}) {
  const clean = String(rawValue || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\-. ]/g, '-');
  const encoded = `*${clean}*`;

  let x = 8;
  const rects = [];
  for (const ch of encoded) {
    const pattern = CODE39[ch] || CODE39['-'];
    for (let i = 0; i < pattern.length; i += 1) {
      const width = pattern[i] === '1' ? 4 : 1.6;
      if (i % 2 === 0) {
        rects.push(`<rect x="${x.toFixed(1)}" y="4" width="${width}" height="${height}" fill="#1A1917" />`);
      }
      x += width;
    }
    x += 2; // inter-character narrow space
  }
  const totalWidth = Math.ceil(x + 6);

  return `
    <div class="barcode-box">
      <svg role="img" aria-label="Barcode ${escapeHtml(clean)}" viewBox="0 0 ${totalWidth} ${height + 8}" width="${Math.min(260, totalWidth)}" height="${height + 8}" style="background:#fff;border-radius:3px;">
        ${rects.join('')}
      </svg>
      <div class="mono" style="font-size:0.78rem;letter-spacing:0.08em;">${escapeHtml(clean)}</div>
    </div>
  `;
}
