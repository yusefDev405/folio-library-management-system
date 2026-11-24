import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getDb, withTransaction } from '../../config/db.js';
import { env, ROOT_DIR } from '../../config/env.js';
import { spExpireHolds } from '../../db/procedures.js';
import { domainError } from '../../utils/errors.js';

export function listUsers() {
  return getDb()
    .prepare(
      `SELECT u.id, u.email, u.role, u.is_active, u.created_at,
              m.id AS member_id, m.member_number
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
       ORDER BY u.id ASC`
    )
    .all()
    .map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
      memberId: r.member_id,
      memberNumber: r.member_number,
    }));
}

export function createUser({ email, passwordHash, role, actorUserId }) {
  const db = getDb();
  return withTransaction(db, actorUserId, () => {
    const info = db
      .prepare('INSERT INTO users (email, password_hash, role, is_active) VALUES (?, ?, ?, 1)')
      .run(email, passwordHash, role);
    const id = Number(info.lastInsertRowid);
    const r = db
      .prepare('SELECT id, email, role, is_active, created_at FROM users WHERE id = ?')
      .get(id);
    return {
      id: r.id,
      email: r.email,
      role: r.role,
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
    };
  });
}

export function updateUser(userId, { role, isActive }, actorUserId) {
  const db = getDb();
  return withTransaction(db, actorUserId, () => {
    const existing = db.prepare('SELECT id, role, is_active FROM users WHERE id = ?').get(userId);
    if (!existing) throw domainError('USER_NOT_FOUND');

    const nextRole = role ?? existing.role;
    const nextActive = isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active;

    db.prepare('UPDATE users SET role = ?, is_active = ? WHERE id = ?').run(
      nextRole,
      nextActive,
      userId
    );

    const r = db
      .prepare('SELECT id, email, role, is_active, created_at FROM users WHERE id = ?')
      .get(userId);
    return {
      id: r.id,
      email: r.email,
      role: r.role,
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
    };
  });
}

export function listPolicies() {
  return getDb()
    .prepare(
      `SELECT member_type AS memberType, max_loans AS maxLoans, loan_days AS loanDays,
              max_renewals AS maxRenewals, daily_fine AS dailyFine,
              max_unpaid_fines AS maxUnpaidFines, hold_days AS holdDays
       FROM loan_policies
       ORDER BY member_type ASC`
    )
    .all()
    .map((p) => ({
      ...p,
      dailyFine: Number(p.dailyFine),
      maxUnpaidFines: Number(p.maxUnpaidFines),
    }));
}

export function updatePolicy(memberType, fields, actorUserId) {
  const db = getDb();
  return withTransaction(db, actorUserId, () => {
    const existing = db
      .prepare('SELECT * FROM loan_policies WHERE member_type = ?')
      .get(memberType);
    if (!existing) throw domainError('POLICY_NOT_FOUND');

    db.prepare(
      `UPDATE loan_policies
       SET max_loans = ?, loan_days = ?, max_renewals = ?, daily_fine = ?, max_unpaid_fines = ?, hold_days = ?
       WHERE member_type = ?`
    ).run(
      fields.maxLoans,
      fields.loanDays,
      fields.maxRenewals,
      fields.dailyFine,
      fields.maxUnpaidFines,
      fields.holdDays ?? existing.hold_days,
      memberType
    );

    return listPolicies().find((p) => p.memberType === memberType);
  });
}

export function listAuditLog({ entity, from, to, limit, offset }) {
  const db = getDb();
  const where = [];
  const params = [];

  if (entity) {
    where.push('a.entity = ?');
    params.push(entity);
  }
  if (from) {
    where.push('a.created_at >= ?');
    params.push(from);
  }
  if (to) {
    where.push('a.created_at <= ?');
    params.push(to);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db
    .prepare(`SELECT COUNT(*) AS cnt FROM audit_log a ${whereSql}`)
    .get(...params).cnt;

  const rows = db
    .prepare(
      `SELECT a.id, a.actor_user_id, u.email AS actor_email, a.action, a.entity, a.entity_id,
              a.old_data, a.new_data, a.created_at
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ${whereSql}
       ORDER BY a.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      actorUserId: r.actor_user_id,
      actorEmail: r.actor_email ?? null,
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id,
      oldData: r.old_data ? JSON.parse(r.old_data) : null,
      newData: r.new_data ? JSON.parse(r.new_data) : null,
      createdAt: r.created_at,
    })),
  };
}

export function runExpireHolds(actorUserId) {
  return spExpireHolds(getDb(), { actorUserId });
}

function getBackupsDir() {
  const dir = path.join(ROOT_DIR, 'data', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function listBackups() {
  const dir = getBackupsDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const stat = fs.statSync(path.join(dir, f));
      return {
        filename: f,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export function createBackupSnapshot() {
  const dir = getBackupsDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `library_${stamp}.db`;
  const outFile = path.join(dir, filename);
  if (fs.existsSync(outFile)) fs.rmSync(outFile, { force: true });

  const db = getDb();
  const escapedPath = outFile.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escapedPath}';`);

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('library_') && f.endsWith('.db'))
    .sort()
    .reverse();

  for (const oldFile of files.slice(env.backupRetention)) {
    fs.rmSync(path.join(dir, oldFile), { force: true });
  }

  return {
    filename,
    sizeBytes: fs.statSync(outFile).size,
    retainedBackups: Math.min(files.length, env.backupRetention),
  };
}

export function verifyBackupSnapshot(filename = null) {
  const dir = getBackupsDir();
  const backups = listBackups();
  if (backups.length === 0) {
    throw domainError('BOOK_NOT_FOUND', 'No backup snapshots exist yet.');
  }
  const targetName = filename ? path.basename(filename) : backups[0].filename;
  const fullPath = path.join(dir, targetName);
  if (!fs.existsSync(fullPath)) {
    throw domainError('BOOK_NOT_FOUND', `Backup file ${targetName} not found.`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-verify-'));
  const scratchPath = path.join(tmpDir, 'verify.db');
  fs.copyFileSync(fullPath, scratchPath);

  const liveDb = getDb();
  const restoredDb = new DatabaseSync(scratchPath);
  const tables = [
    'users',
    'loan_policies',
    'members',
    'authors',
    'categories',
    'books',
    'book_authors',
    'book_copies',
    'loans',
    'reservations',
    'fines',
    'audit_log',
  ];

  try {
    const rowCounts = tables.map((table) => {
      const liveCount = liveDb.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
      const restoredCount = restoredDb.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
      return { table, liveCount, restoredCount, match: liveCount === restoredCount };
    });

    const liveTriggers = liveDb
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
      .all()
      .map((r) => r.name);
    const restoredTriggers = restoredDb
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
      .all()
      .map((r) => r.name);

    const liveViews = liveDb
      .prepare("SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name")
      .all()
      .map((r) => r.name);
    const restoredViews = restoredDb
      .prepare("SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name")
      .all()
      .map((r) => r.name);

    const ok =
      rowCounts.every((r) => r.match) &&
      JSON.stringify(liveTriggers) === JSON.stringify(restoredTriggers) &&
      JSON.stringify(liveViews) === JSON.stringify(restoredViews);

    return {
      ok,
      filename: targetName,
      tablesVerified: rowCounts.length,
      triggersCount: restoredTriggers.length,
      viewsCount: restoredViews.length,
      rowCounts,
    };
  } finally {
    try {
      restoredDb.close();
    } catch {
      // ignore
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
