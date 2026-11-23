import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Skema versi 1: akun pengguna, sesi login, dan pengaturan kelas.
const SKEMA_V1 = `
CREATE TABLE pengguna (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nim         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  nama        TEXT    NOT NULL,
  sandi_hash  TEXT    NOT NULL,
  peran       TEXT    NOT NULL DEFAULT 'anggota',
  dibuat_pada TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sesi (
  token_hash  TEXT    PRIMARY KEY,
  pengguna_id INTEGER NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  kedaluwarsa INTEGER NOT NULL
);
CREATE INDEX sesi_kedaluwarsa ON sesi(kedaluwarsa);

CREATE TABLE pengaturan (
  kunci TEXT PRIMARY KEY,
  nilai TEXT NOT NULL
);
`;

const MIGRASI = [SKEMA_V1];

export function bukaDatabase(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrasi(db);
  return db;
}

function migrasi(db) {
  const { user_version: versi } = db.prepare('PRAGMA user_version').get();
  for (let i = versi; i < MIGRASI.length; i += 1) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRASI[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

// Huruf dan angka yang tidak mudah tertukar (tanpa 0/O, 1/I/L).
const ABJAD_KODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function buatKodeKelas(panjang = 8) {
  let kode = '';
  for (let i = 0; i < panjang; i += 1) kode += ABJAD_KODE[crypto.randomInt(ABJAD_KODE.length)];
  return kode;
}

export function ambilKodeKelas(db) {
  const baris = db.prepare("SELECT nilai FROM pengaturan WHERE kunci = 'kode_kelas'").get();
  return baris ? baris.nilai : null;
}

export function setKodeKelas(db, kode) {
  db.prepare(
    "INSERT INTO pengaturan (kunci, nilai) VALUES ('kode_kelas', ?) " +
      'ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai',
  ).run(kode);
}

/** Pastikan kode kelas ada. Mengembalikan kodenya. */
export function pastikanKodeKelas(db, kodeAwal) {
  const ada = ambilKodeKelas(db);
  if (ada) return ada;
  const kode = (kodeAwal || buatKodeKelas()).trim().toUpperCase();
  setKodeKelas(db, kode);
  return kode;
}

export function jumlahPengguna(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM pengguna').get().n;
}
