/**
 * Validates ISBN-10 and ISBN-13 checksums, returning normalized digits/X or null.
 */
export function isValidIsbn(raw) {
  const clean = String(raw || '').replace(/[-\s]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(clean)) {
    let sum = 0;
    for (let i = 0; i < 10; i += 1) {
      const val = clean[i] === 'X' ? 10 : Number(clean[i]);
      sum += val * (10 - i);
    }
    return sum % 11 === 0 ? clean : null;
  }
  if (/^\d{13}$/.test(clean)) {
    let sum = 0;
    for (let i = 0; i < 12; i += 1) {
      sum += Number(clean[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const check = (10 - (sum % 10)) % 10;
    return check === Number(clean[12]) ? clean : null;
  }
  return null;
}

export function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseBooksCsv(csvText) {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return { validRows: [], rejectedRows: [{ line: 1, isbn: '', title: '', reason: 'EMPTY_CSV' }] };
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const validRows = [];
  const rejectedRows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row = Object.fromEntries(headers.map((h, idx) => [h, values[idx] ?? '']));
    const isbn = isValidIsbn(row.isbn);
    if (!isbn) {
      rejectedRows.push({
        line: i + 1,
        isbn: row.isbn || '',
        title: row.title || '',
        reason: 'INVALID_ISBN_CHECKSUM',
      });
      continue;
    }
    if (!row.title || !row.author) {
      rejectedRows.push({
        line: i + 1,
        isbn: row.isbn || '',
        title: row.title || '',
        reason: 'MISSING_REQUIRED_FIELD',
      });
      continue;
    }
    const parsedYear = row.published_year ? Number.parseInt(row.published_year, 10) : null;
    validRows.push({
      isbn,
      title: row.title,
      author: row.author,
      category: row.category || 'Computer Science',
      publisher: row.publisher || null,
      publishedYear: Number.isFinite(parsedYear) ? parsedYear : null,
      description: row.description || '',
    });
  }

  return { validRows, rejectedRows };
}
