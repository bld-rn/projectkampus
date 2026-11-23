import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PembatasPercobaan,
  bacaCookie,
  buatCookie,
  buatToken,
  cocokSandi,
  hashSandi,
  samaAman,
  sidik,
} from '../src/security.js';
import { bolehkan, namaPeran } from '../src/roles.js';
import { atr, esc, html, mentah } from '../src/views.js';
import { bukaDatabase, buatKodeKelas, pastikanKodeKelas } from '../src/db.js';

test('hashSandi: hash berbeda tiap kali (garam acak) tetapi sama-sama cocok', async () => {
  const a = await hashSandi('contoh-sandi-uji');
  const b = await hashSandi('contoh-sandi-uji');
  assert.notEqual(a, b);
  assert.ok(await cocokSandi('contoh-sandi-uji', a));
  assert.ok(await cocokSandi('contoh-sandi-uji', b));
  assert.ok(!(await cocokSandi('contoh-sandi-uja', a)));
});

test('cocokSandi: format hash rusak ditolak tanpa melempar galat', async () => {
  assert.equal(await cocokSandi('apa-saja', 'bukan-hash'), false);
  assert.equal(await cocokSandi('apa-saja', ''), false);
  assert.equal(await cocokSandi('apa-saja', 'bcrypt$a$b'), false);
});

test('buatToken dan sidik', () => {
  const t1 = buatToken();
  assert.match(t1, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(t1, buatToken());
  assert.match(sidik(t1), /^[0-9a-f]{64}$/);
  assert.equal(sidik(t1), sidik(t1));
});

test('samaAman membandingkan teks dengan panjang berbeda tanpa galat', () => {
  assert.equal(samaAman('abc', 'abc'), true);
  assert.equal(samaAman('abc', 'abcd'), false);
  assert.equal(samaAman('', 'a'), false);
});

test('bacaCookie: mengabaikan cookie rusak dan memakai nilai pertama bila ganda', () => {
  assert.deepEqual(bacaCookie('a=1; b=%E0%A4%A; c=3'), { a: '1', c: '3' });
  assert.deepEqual(bacaCookie('sid=pertama; sid=kedua'), { sid: 'pertama' });
  assert.deepEqual(bacaCookie(undefined), {});
  assert.deepEqual(bacaCookie('tanpa-sama-dengan'), {});
});

test('buatCookie: atribut keamanan', () => {
  const dev = buatCookie('sid', 'x', { maxAge: 60 });
  assert.match(dev, /HttpOnly/);
  assert.match(dev, /SameSite=Lax/);
  assert.match(dev, /Max-Age=60/);
  assert.doesNotMatch(dev, /Secure/);
  assert.match(buatCookie('sid', 'x', { secure: true }), /Secure/);
});

test('PembatasPercobaan: mengunci setelah batas, bisa dibersihkan, kedaluwarsa', () => {
  const p = new PembatasPercobaan({ maks: 3, jendelaMs: 50 });
  assert.equal(p.terkunci('k'), false);
  p.gagal('k');
  p.gagal('k');
  assert.equal(p.terkunci('k'), false);
  p.gagal('k');
  assert.equal(p.terkunci('k'), true);
  assert.equal(p.terkunci('lain'), false);
  p.bersihkan('k');
  assert.equal(p.terkunci('k'), false);
});

test('PembatasPercobaan: kunci lepas sendiri setelah jendela waktu', async () => {
  const p = new PembatasPercobaan({ maks: 1, jendelaMs: 20 });
  p.gagal('k');
  assert.equal(p.terkunci('k'), true);
  await new Promise((selesai) => setTimeout(selesai, 40));
  assert.equal(p.terkunci('k'), false);
});

test('roles: izin sesuai keputusan', () => {
  assert.equal(bolehkan('admin', 'struktur.ubah'), true);
  assert.equal(bolehkan('ketua', 'struktur.ubah'), true);
  assert.equal(bolehkan('wakil', 'struktur.ubah'), true);
  assert.equal(bolehkan('sekretaris', 'struktur.ubah'), false);
  assert.equal(bolehkan('bendahara', 'struktur.ubah'), false);
  assert.equal(bolehkan('anggota', 'struktur.ubah'), false);
  assert.equal(bolehkan('ketua', 'pengguna.kelola'), false);
  assert.equal(bolehkan('admin', 'pengguna.kelola'), true);
  assert.equal(bolehkan('admin', 'izin-yang-tidak-ada'), false);
});

test('roles: nama peran tidak bisa dibajak lewat properti prototipe', () => {
  assert.equal(namaPeran('ketua'), 'Ketua Kelas');
  assert.equal(namaPeran('constructor'), 'Anggota');
  assert.equal(namaPeran('__proto__'), 'Anggota');
  assert.equal(bolehkan('constructor', 'pengguna.kelola'), false);
});

test('views: nilai di-escape, html bersarang dan mentah tidak di-escape ganda', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(html`<p>${'<b>'}</p>`.teks, '<p>&lt;b&gt;</p>');
  assert.equal(html`<p>${html`<b>${'x'}</b>`}</p>`.teks, '<p><b>x</b></p>');
  assert.equal(html`<ul>${['a', '<b>'].map((x) => html`<li>${x}</li>`)}</ul>`.teks, '<ul><li>a</li><li>&lt;b&gt;</li></ul>');
  assert.equal(html`${mentah('<i>')}`.teks, '<i>');
  assert.equal(html`[${null}${undefined}${false}]`.teks, '[]');
});

test('views: atr membuat atribut dan meng-escape nilainya', () => {
  assert.equal(atr({ a: 'x"y', b: true, c: false, d: null }).teks, ' a="x&quot;y" b');
});

test('db: skema, versi migrasi, dan kode kelas', () => {
  const db = bukaDatabase(':memory:');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);

  const kode = buatKodeKelas();
  assert.match(kode, /^[A-HJKMNP-Z2-9]{8}$/);
  assert.doesNotMatch(kode, /[01OIL]/);

  assert.equal(pastikanKodeKelas(db, ' abc123xy '), 'ABC123XY');
  assert.equal(pastikanKodeKelas(db, 'diabaikan'), 'ABC123XY'); // sudah ada, tidak ditimpa
  db.close();
});

test('db: menghapus pengguna ikut menghapus sesinya', () => {
  const db = bukaDatabase(':memory:');
  db.prepare("INSERT INTO pengguna (nim, nama, sandi_hash) VALUES ('X1', 'X', 'h')").run();
  db.prepare("INSERT INTO sesi (token_hash, pengguna_id, kedaluwarsa) VALUES ('t', 1, 1)").run();
  db.prepare('DELETE FROM pengguna WHERE id = 1').run();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sesi').get().n, 0);
  db.close();
});
