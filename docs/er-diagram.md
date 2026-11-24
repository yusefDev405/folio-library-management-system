# Entity-Relationship Diagram

See [er-diagram.svg](./er-diagram.svg) for the visual schema diagram of all 12 core tables.

## Core Relationships
- `users` 1:1 `members` (`members.user_id` UNIQUE FK)
- `loan_policies` 1:N `members` (`members.member_type` FK)
- `categories` 1:N `books` and self-referencing `categories.parent_id`
- `books` M:N `authors` via `book_authors`
- `books` 1:N `book_copies` (loans attach to physical `book_copies`, never `books`)
- `members` 1:N `loans` and `book_copies` 1:N `loans` (enforced to at most one open loan per copy via `active_copy_id` generated column + UNIQUE index)
- `books` 1:N `reservations` and `members` 1:N `reservations` (enforced to at most one open reservation per member+book via `active_member_book`)
- `loans` 1:N `fines` and `members` 1:N `fines`
- `users` 1:N `refresh_tokens`
- `audit_log` append-only table populated by `AFTER INSERT` / `AFTER UPDATE` triggers on `loans`, `fines`, and `reservations`
