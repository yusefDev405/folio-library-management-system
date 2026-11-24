export function downloadBlob(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename, headers, rows) {
  const escapeCell = (v) => {
    const str = String(v ?? '');
    if (/[",\r\n]/.test(str)) {
      return `"${str.replaceAll('"', '""')}"`;
    }
    return str;
  };
  const csv = [headers.map(escapeCell).join(',')]
    .concat(rows.map((r) => r.map(escapeCell).join(',')))
    .join('\r\n');
  downloadBlob(filename, csv, 'text/csv;charset=utf-8');
}

function toIcsUtc(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function downloadLoanIcs(loan) {
  const due = new Date(loan.dueAt);
  const start = new Date(due.getTime() - 60 * 60 * 1000);
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Folio Library System//Circulation Reminder//EN',
    'BEGIN:VEVENT',
    `UID:folio-loan-${loan.id}@library.local`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${toIcsUtc(start.toISOString())}`,
    `DTEND:${toIcsUtc(due.toISOString())}`,
    `SUMMARY:Library Book Due — ${loan.title}`,
    `DESCRIPTION:Barcode ${loan.barcode} (ISBN ${loan.isbn}) is due at the Folio Library circulation desk.`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  downloadBlob(`folio-due-${loan.barcode}.ics`, ics, 'text/calendar;charset=utf-8');
}

export function formatCitations(book) {
  const authors = (book.authors || []).map((a) => a.name);
  const authorText = authors.length ? authors.join(', ') : 'Unknown Author';
  const year = book.publishedYear || 'n.d.';
  const publisher = book.publisher || 'Unknown Publisher';

  const apa = `${authorText} (${year}). ${book.title}. ${publisher}. ISBN ${book.isbn}.`;
  const mla = `${authorText}. ${book.title}. ${publisher}, ${year}.`;
  const firstLast = (authors[0] || 'unknown').split(/\s+/).pop().toLowerCase().replace(/[^a-z0-9]/g, '');
  const bibtex = `@book{${firstLast}${year},\n  title     = {${book.title}},\n  author    = {${authors.join(' and ') || 'Unknown'}},\n  publisher = {${publisher}},\n  year      = {${year}},\n  isbn      = {${book.isbn}}\n}`;

  return { apa, mla, bibtex };
}
