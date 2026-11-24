-- Tiny, realistic seed dataset (< 200 KB total DB size)

-- 1. Users (admin, librarian, 4 members)
INSERT INTO users (id, email, password_hash, role, is_active) VALUES
  (1, 'admin@library.local', '__ADMIN_HASH__', 'admin', 1),
  (2, 'librarian@library.local', '__LIBRARIAN_HASH__', 'librarian', 1),
  (3, 'nadia.student@library.local', '__MEMBER_HASH__', 'member', 1),
  (4, 'omar.staff@library.local', '__MEMBER_HASH__', 'member', 1),
  (5, 'sara.external@library.local', '__MEMBER_HASH__', 'member', 1),
  (6, 'tarek.expired@library.local', '__MEMBER_HASH__', 'member', 1);

-- 2. Members
INSERT INTO members (id, user_id, member_number, first_name, last_name, phone, member_type, status, expires_at) VALUES
  (1, 3, 'MEM-1001', 'Nadia', 'Mansour', '+201001112233', 'student', 'active', date('now', '+180 days')),
  (2, 4, 'MEM-1002', 'Omar', 'El-Sayed', '+201002223344', 'staff', 'active', date('now', '+365 days')),
  (3, 5, 'MEM-1003', 'Sara', 'Haddad', '+201003334455', 'external', 'active', date('now', '+120 days')),
  (4, 6, 'MEM-1004', 'Tarek', 'Kamel', '+201004445566', 'student', 'expired', date('now', '-15 days'));

-- 3. Categories (hierarchical)
INSERT INTO categories (id, name, parent_id) VALUES
  (1, 'Computer Science', NULL),
  (2, 'Database Systems', 1),
  (3, 'Software Engineering', 1),
  (4, 'Literature', NULL),
  (5, 'History & Philosophy', NULL),
  (6, 'Mathematics', NULL);

-- 4. Authors
INSERT INTO authors (id, name) VALUES
  (1, 'Martin Kleppmann'),
  (2, 'Thomas H. Cormen'),
  (3, 'Charles E. Leiserson'),
  (4, 'Robert C. Martin'),
  (5, 'Eric Evans'),
  (6, 'Alex Petrov'),
  (7, 'Naguib Mahfouz'),
  (8, 'Umberto Eco'),
  (9, 'Georgina Pólya'),
  (10, 'Donald E. Knuth');

-- 5. Books (12 titles)
INSERT INTO books (id, isbn, title, publisher, published_year, category_id, description) VALUES
  (1, '9781449373320', 'Designing Data-Intensive Applications', 'O''Reilly Media', 2017, 2, 'Foundational guide to reliable, scalable, and maintainable distributed data systems and storage engines.'),
  (2, '9780262046305', 'Introduction to Algorithms', 'MIT Press', 2022, 1, 'Comprehensive reference covering sorting, graph algorithms, dynamic programming, and amortized analysis.'),
  (3, '9780132350884', 'Clean Code', 'Prentice Hall', 2008, 3, 'Practical handbook of agile software craftsmanship, naming, modularity, and refactoring discipline.'),
  (4, '9780321125215', 'Domain-Driven Design', 'Addison-Wesley', 2003, 3, 'Tackling complexity in the heart of software through ubiquitous language, aggregates, and bounded contexts.'),
  (5, '9781492040347', 'Database Internals', 'O''Reilly Media', 2019, 2, 'Deep dive into B-trees, LSM-trees, write-ahead logs, and distributed consensus protocols.'),
  (6, '9780385264709', 'Palace Walk', 'Anchor Books', 1990, 4, 'First volume of the Cairo Trilogy depicting family, politics, and tradition in early twentieth-century Cairo.'),
  (7, '9780156001311', 'The Name of the Rose', 'Harcourt', 1983, 4, 'Historical mystery set in a fourteenth-century Italian abbey centered around a labyrinthine monastic library.'),
  (8, '9780691164076', 'How to Solve It', 'Princeton University Press', 2014, 6, 'Classic treatise on mathematical problem-solving heuristics, proofs, and structured reasoning.'),
  (9, '9780201896831', 'The Art of Computer Programming Vol. 1', 'Addison-Wesley', 1997, 1, 'Rigorous treatment of fundamental algorithms, information structures, and asymptotic analysis.'),
  (10, '9780134757599', 'Refactoring', 'Addison-Wesley', 2018, 3, 'Improving the design of existing code safely through small behavior-preserving transformations.'),
  (11, '9780140449136', 'The Muqaddimah', 'Penguin Classics', 2005, 5, 'Ibn Khaldun''s fourteenth-century philosophy of history, historiography, and social cohesion.'),
  (12, '9780201616224', 'The Pragmatic Programmer', 'Addison-Wesley', 1999, 3, 'Timeless engineering practices for orthogonality, tracer bullets, and maintainable systems.');

-- 6. Book Authors
INSERT INTO book_authors (book_id, author_id) VALUES
  (1, 1),
  (2, 2), (2, 3),
  (3, 4),
  (4, 5),
  (5, 6),
  (6, 7),
  (7, 8),
  (8, 9),
  (9, 10),
  (10, 4),
  (11, 8),
  (12, 5);

-- 7. Physical Copies (24 copies; books 1 and 5 have 0 available copies so reservations can be tested immediately)
INSERT INTO book_copies (id, book_id, barcode, shelf_location, status) VALUES
  (1,  1, 'LIB-000101', 'CS-DB-01', 'on_loan'),
  (2,  1, 'LIB-000102', 'CS-DB-01', 'reserved'),
  (3,  2, 'LIB-000201', 'CS-AL-02', 'available'),
  (4,  2, 'LIB-000202', 'CS-AL-02', 'available'),
  (5,  3, 'LIB-000301', 'CS-SE-01', 'on_loan'),
  (6,  3, 'LIB-000302', 'CS-SE-01', 'available'),
  (7,  4, 'LIB-000401', 'CS-SE-02', 'available'),
  (8,  4, 'LIB-000402', 'CS-SE-02', 'damaged'),
  (9,  5, 'LIB-000501', 'CS-DB-03', 'on_loan'),
  (10, 5, 'LIB-000502', 'CS-DB-03', 'on_loan'),
  (11, 6, 'LIB-000601', 'LIT-AR-01', 'available'),
  (12, 6, 'LIB-000602', 'LIT-AR-01', 'available'),
  (13, 7, 'LIB-000701', 'LIT-EU-04', 'available'),
  (14, 7, 'LIB-000702', 'LIT-EU-04', 'available'),
  (15, 8, 'LIB-000801', 'MTH-01', 'available'),
  (16, 8, 'LIB-000802', 'MTH-01', 'available'),
  (17, 9, 'LIB-000901', 'CS-AL-05', 'available'),
  (18, 9, 'LIB-000902', 'CS-AL-05', 'lost'),
  (19, 10, 'LIB-001001', 'CS-SE-04', 'available'),
  (20, 10, 'LIB-001002', 'CS-SE-04', 'available'),
  (21, 11, 'LIB-001101', 'HIS-02', 'available'),
  (22, 11, 'LIB-001102', 'HIS-02', 'available'),
  (23, 12, 'LIB-001201', 'CS-SE-05', 'available'),
  (24, 12, 'LIB-001202', 'CS-SE-05', 'available');

-- 8. Loans (3 active loans + 3 returned loans, including 1 currently overdue for Nadia)
INSERT INTO loans (id, copy_id, member_id, checked_out_at, due_at, returned_at, renewals_count, checked_out_by) VALUES
  (1, 1, 1, datetime('now', '-18 days'), datetime('now', '-4 days'), NULL, 0, 2),
  (2, 5, 1, datetime('now', '-5 days'),  datetime('now', '+9 days'), NULL, 0, 2),
  (3, 9, 2, datetime('now', '-6 days'),  datetime('now', '+24 days'), NULL, 0, 2),
  (4, 10, 3, datetime('now', '-10 days'), datetime('now', '+4 days'), NULL, 0, 2),
  (5, 3, 1, datetime('now', '-40 days'), datetime('now', '-26 days'), datetime('now', '-24 days'), 0, 2),
  (6, 11, 2, datetime('now', '-30 days'), datetime('now', '-2 days'), datetime('now', '-5 days'), 1, 2);

-- 9. Reservations (Omar has a ready hold on Book 1 copy LIB-000102; Nadia is waiting on Book 5)
INSERT INTO reservations (id, book_id, member_id, reserved_at, status, ready_at, expires_at) VALUES
  (1, 1, 2, datetime('now', '-2 days'), 'ready', datetime('now', '-1 day'), datetime('now', '+4 days')),
  (2, 5, 1, datetime('now', '-1 day'),  'waiting', NULL, NULL);

-- 10. Fines (1 unpaid fine for Nadia from past late return; 1 paid fine)
INSERT INTO fines (id, loan_id, member_id, amount, reason, status, assessed_at, paid_at) VALUES
  (1, 5, 1, 1.00, 'overdue', 'unpaid', datetime('now', '-24 days'), NULL),
  (2, 6, 2, 0.50, 'overdue', 'paid',   datetime('now', '-20 days'), datetime('now', '-18 days'));

-- 11. Tiny sample reading list, reviews, and notifications
INSERT INTO reading_list (member_id, book_id, shelf, notes) VALUES
  (1, 1, 'reading', 'Focus on chapter 7 transactions and serializability.'),
  (1, 5, 'want_to_read', 'Waiting on hold queue to read B-tree vs LSM comparison.');

INSERT INTO book_reviews (book_id, member_id, rating, comment) VALUES
  (1, 1, 5, 'Clear, rigorous explanation of replication and consensus trade-offs.'),
  (2, 2, 5, 'Essential reference for algorithm proofs and asymptotic bounds.');

INSERT INTO notifications (user_id, kind, title, body, dedupe_key) VALUES
  (3, 'overdue', 'Overdue item: Designing Data-Intensive Applications', 'Copy LIB-000101 is past due. Please return it at the circulation desk.', 'seed:overdue:1'),
  (4, 'hold_ready', 'Hold ready for pickup: Designing Data-Intensive Applications', 'Copy LIB-000102 is reserved for you on the Hold Shelf.', 'seed:hold_ready:1');
