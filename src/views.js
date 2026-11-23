import { bolehkan, namaPeran } from './roles.js';

// ---------------------------------------------------------------------------
// Template HTML yang otomatis meng-escape nilai (mencegah XSS).
// Nilai biasa selalu di-escape. Hanya hasil `html` atau `mentah` yang dianggap aman.
// ---------------------------------------------------------------------------

class Mentah {
  constructor(teks) {
    this.teks = teks;
  }
}

/** Tandai teks sebagai HTML aman. Pakai HANYA untuk teks buatan kode sendiri. */
export const mentah = (teks) => new Mentah(String(teks));

const PETA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(nilai) {
  return String(nilai ?? '').replace(/[&<>"']/g, (c) => PETA[c]);
}

function ubah(nilai) {
  if (nilai instanceof Mentah) return nilai.teks;
  if (Array.isArray(nilai)) return nilai.map(ubah).join('');
  if (nilai === null || nilai === undefined || nilai === false) return '';
  return esc(nilai);
}

export function html(potongan, ...nilai) {
  let hasil = potongan[0];
  for (let i = 0; i < nilai.length; i += 1) hasil += ubah(nilai[i]) + potongan[i + 1];
  return new Mentah(hasil);
}

/** Atribut HTML dari objek. `true` = atribut tanpa nilai, `false`/null = dilewati. */
export function atr(objek) {
  const bagian = Object.entries(objek).map(([kunci, nilai]) => {
    if (nilai === true) return ` ${kunci}`;
    if (nilai === false || nilai === null || nilai === undefined) return '';
    return ` ${kunci}="${esc(nilai)}"`;
  });
  return mentah(bagian.join(''));
}

// ---------------------------------------------------------------------------
// Komponen kecil
// ---------------------------------------------------------------------------

export const bidangCsrf = (token) => html`<input type="hidden" name="_csrf" value="${token}">`;

export function kolom({ id, label, tipe = 'text', nilai = '', bantuan = '', atribut = {} }) {
  const idBantuan = bantuan ? `${id}-bantuan` : false;
  return html`<div class="kolom">
    <label for="${id}">${label}</label>
    <input id="${id}" name="${id}" type="${tipe}"${atr({
      value: nilai === '' ? false : nilai,
      'aria-describedby': idBantuan,
      ...atribut,
    })}>
    ${bantuan ? html`<span class="bantuan" id="${idBantuan}">${bantuan}</span>` : ''}
  </div>`;
}

export function kotakPesan(pesan) {
  if (!pesan) return '';
  const galat = pesan.jenis === 'galat';
  return html`<div class="${galat ? 'pesan' : 'pesan pesan-info'}" role="${galat ? 'alert' : 'status'}">${pesan.teks}</div>`;
}

// ---------------------------------------------------------------------------
// Menu dan daftar modul
// ---------------------------------------------------------------------------

export const MODUL = [
  { href: '/tugas', kunci: 'tugas', nama: 'Tugas', ket: 'Catat tugas, tenggatnya, dan mata kuliah asalnya.' },
  { href: '/jadwal', kunci: 'jadwal', nama: 'Jadwal', ket: 'Jadwal kuliah mingguan yang bisa diubah pengurus.' },
  { href: '/materi', kunci: 'materi', nama: 'Materi', ket: 'Modul, konsep dasar, dan ringkasan tiap mata kuliah.' },
  { href: '/latihan', kunci: 'latihan', nama: 'Latihan', ket: 'Bank soal tiap bab, dari dasar sampai soal HOTS.' },
  { href: '/struktur', kunci: 'struktur', nama: 'Struktur kelas', ket: 'Bagan pengurus kelas yang bisa diperbarui.' },
];

function daftarMenu(pengguna) {
  const menu = [{ href: '/', kunci: 'beranda', nama: 'Beranda' }, ...MODUL];
  if (pengguna && bolehkan(pengguna.peran, 'pengguna.kelola')) {
    menu.push({ href: '/admin/pengguna', kunci: 'admin', nama: 'Pengguna' });
  }
  return menu;
}

// ---------------------------------------------------------------------------
// Kerangka halaman: kotak judul ala lembar gambar kerja + menu + isi
// ---------------------------------------------------------------------------

function kerangka({ config, pengguna, csrf, judul, aktif, isi }) {
  const selPengguna = pengguna
    ? html`<div class="sel">
        <span class="label">Masuk sebagai</span>
        <span class="nilai">${pengguna.nama}</span>
        <span class="label">${namaPeran(pengguna.peran)}</span>
      </div>
      ${csrf
        ? html`<div class="sel sel-aksi">
            <form method="post" action="/keluar">
              ${bidangCsrf(csrf)}
              <button class="tombol-teks" type="submit">Keluar</button>
            </form>
          </div>`
        : ''}`
    : '';

  const menu = pengguna
    ? html`<nav class="menu" aria-label="Menu utama">
        ${daftarMenu(pengguna).map(
          (m) => html`<a href="${m.href}"${atr({ 'aria-current': m.kunci === aktif ? 'page' : false })}>${m.nama}</a>`,
        )}
      </nav>`
    : '';

  return html`<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${judul} | ${config.appNama}</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>
  <a class="lompat" href="#isi">Lewati ke isi halaman</a>
  <div class="lembar">
    <header class="kepala">
      <div class="sel sel-nama">
        <span class="label">Kelas</span>
        <span class="nilai">${config.appNama}</span>
      </div>
      <div class="sel">
        <span class="label">Kampus</span>
        <span class="nilai">${config.kampusNama}</span>
      </div>
      ${selPengguna}
    </header>
    ${menu}
    <main id="isi">${isi}</main>
  </div>
</body>
</html>
`;
}

/** Kirim satu halaman lengkap. */
export function kirim(req, res, { judul, aktif = '', isi, status = 200 }) {
  const teks = kerangka({
    config: req.app.locals.config,
    pengguna: req.pengguna ?? null,
    csrf: res.locals.csrf,
    judul,
    aktif,
    isi,
  }).teks;
  res.status(status).type('html').send(teks);
}

/** Halaman galat (403, 404, 500): jelaskan apa yang terjadi dan apa yang bisa dilakukan. */
export function kirimGalat(req, res, status, judul, penjelasan) {
  kirim(req, res, {
    status,
    judul,
    isi: html`<h1>${judul}</h1>
      <p class="pengantar">${penjelasan}</p>
      <p><a href="/">Kembali ke beranda</a></p>`,
  });
}
