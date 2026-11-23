import { Router } from 'express';
import {
  PembatasPercobaan,
  buatCookie,
  buatToken,
  cocokSandi,
  hashSandi,
  samaAman,
  sidik,
} from '../security.js';
import { ambilKodeKelas, jumlahPengguna } from '../db.js';
import { bidangCsrf, html, kirim, kolom, kotakPesan } from '../views.js';

// Hash palsu: dipakai agar waktu respons sama, baik NIM-nya ada maupun tidak.
const SANDI_PALSU = await hashSandi('pembanding-waktu-respons');

// Aturan input. NIM berupa 8 angka (contoh 26000000). Awalan angkatan sengaja tidak dipaksa
// supaya angkatan lain tetap bisa mendaftar. Bila ada NIM dengan panjang berbeda, ubah di sini.
const NIM_PANJANG = 8;
const POLA_NIM = new RegExp(`^[0-9]{${NIM_PANJANG}}$`);
const SANDI_MIN = 8;
const SANDI_MAKS = 128;

export function buatAuthRouter({ db, config }) {
  const router = Router();

  const batasMasukAkun = new PembatasPercobaan({ maks: 5 });
  const batasMasukIp = new PembatasPercobaan({ maks: 30 });
  const batasDaftar = new PembatasPercobaan({ maks: 10 });

  const cariPengguna = db.prepare('SELECT id, sandi_hash FROM pengguna WHERE nim = ?');
  const tambahPengguna = db.prepare(
    'INSERT INTO pengguna (nim, nama, sandi_hash, peran) VALUES (?, ?, ?, ?)',
  );
  const tambahSesi = db.prepare(
    'INSERT INTO sesi (token_hash, pengguna_id, kedaluwarsa) VALUES (?, ?, ?)',
  );
  const hapusSesi = db.prepare('DELETE FROM sesi WHERE token_hash = ?');

  /** Buat sesi baru, ganti sesi lama bila ada, lalu pasang cookie. */
  function mulaiSesi(req, res, penggunaId) {
    if (req.cookies?.sid) hapusSesi.run(sidik(req.cookies.sid));
    const token = buatToken();
    const detik = config.sesiHari * 24 * 60 * 60;
    tambahSesi.run(sidik(token), penggunaId, Date.now() + detik * 1000);
    res.append('Set-Cookie', buatCookie('sid', token, { maxAge: detik, secure: config.isProd }));
  }

  // --- Masuk ---------------------------------------------------------------

  function halamanMasuk(req, res, { nim = '', pesan = null, status = 200 } = {}) {
    const belumAdaAkun = jumlahPengguna(db) === 0;
    kirim(req, res, {
      judul: 'Masuk',
      status,
      isi: html`<h1>Masuk</h1>
        <p class="pengantar">Gunakan NIM dan kata sandi yang kamu buat saat mendaftar.</p>
        ${belumAdaAkun
          ? kotakPesan({
              jenis: 'info',
              teks: 'Belum ada akun sama sekali. Daftar dulu: akun pertama otomatis menjadi Admin.',
            })
          : ''}
        ${kotakPesan(pesan)}
        <form class="formulir" method="post" action="/masuk">
          ${bidangCsrf(res.locals.csrf)}
          ${kolom({
            id: 'nim',
            label: 'NIM',
            nilai: nim,
            atribut: { autocomplete: 'username', required: true, maxlength: NIM_PANJANG, inputmode: 'numeric' },
          })}
          ${kolom({
            id: 'sandi',
            label: 'Kata sandi',
            tipe: 'password',
            atribut: { autocomplete: 'current-password', required: true, maxlength: SANDI_MAKS },
          })}
          <div><button class="tombol" type="submit">Masuk</button></div>
        </form>
        <p class="tautan-bawah">Belum punya akun? <a href="/daftar">Daftar dengan kode kelas</a></p>`,
    });
  }

  router.get('/masuk', (req, res) => {
    if (req.pengguna) return res.redirect(303, '/');
    return halamanMasuk(req, res);
  });

  router.post('/masuk', async (req, res) => {
    const nim = String(req.body?.nim ?? '').trim();
    const sandi = String(req.body?.sandi ?? '');
    const kunciAkun = `${req.ip}|${nim.toLowerCase()}`;
    const kunciIp = String(req.ip);

    if (batasMasukAkun.terkunci(kunciAkun) || batasMasukIp.terkunci(kunciIp)) {
      return halamanMasuk(req, res, {
        nim,
        status: 429,
        pesan: {
          jenis: 'galat',
          teks: 'Terlalu banyak percobaan masuk yang gagal. Tunggu sekitar 15 menit, lalu coba lagi.',
        },
      });
    }

    const baris = sandi.length <= SANDI_MAKS ? cariPengguna.get(nim) : undefined;
    const cocok = await cocokSandi(sandi.slice(0, SANDI_MAKS), baris?.sandi_hash ?? SANDI_PALSU);

    if (!baris || !cocok) {
      batasMasukAkun.gagal(kunciAkun);
      batasMasukIp.gagal(kunciIp);
      return halamanMasuk(req, res, {
        nim,
        status: 401,
        pesan: {
          jenis: 'galat',
          teks: 'NIM atau kata sandi tidak cocok. Periksa ejaannya, atau daftar bila belum punya akun.',
        },
      });
    }

    batasMasukAkun.bersihkan(kunciAkun);
    mulaiSesi(req, res, baris.id);
    return res.redirect(303, '/');
  });

  // --- Daftar --------------------------------------------------------------

  function halamanDaftar(req, res, { nim = '', nama = '', galat = [], status = 200 } = {}) {
    const pesan = galat.length
      ? {
          jenis: 'galat',
          teks: html`Pendaftaran belum berhasil. ${galat.length === 1 ? 'Perbaiki hal ini:' : `Perbaiki ${galat.length} hal berikut:`}
            <ul>${galat.map((g) => html`<li>${g}</li>`)}</ul>`,
        }
      : null;

    kirim(req, res, {
      judul: 'Daftar',
      status,
      isi: html`<h1>Daftar</h1>
        <p class="pengantar">
          Pendaftaran hanya untuk teman sekelas. Minta kode kelas ke Ketua atau Admin.
        </p>
        ${kotakPesan(pesan)}
        <form class="formulir" method="post" action="/daftar">
          ${bidangCsrf(res.locals.csrf)}
          ${kolom({
            id: 'nim',
            label: 'NIM',
            nilai: nim,
            bantuan: `${NIM_PANJANG} angka, contoh 26000000. NIM menjadi nama pengguna untuk masuk.`,
            atribut: { autocomplete: 'username', required: true, maxlength: NIM_PANJANG, inputmode: 'numeric' },
          })}
          ${kolom({
            id: 'nama',
            label: 'Nama lengkap',
            nilai: nama,
            atribut: { autocomplete: 'name', required: true, maxlength: 80 },
          })}
          ${kolom({
            id: 'sandi',
            label: 'Kata sandi',
            tipe: 'password',
            bantuan: `Minimal ${SANDI_MIN} karakter. Kalimat panjang lebih kuat daripada kata pendek.`,
            atribut: { autocomplete: 'new-password', required: true, minlength: SANDI_MIN, maxlength: SANDI_MAKS },
          })}
          ${kolom({
            id: 'sandi2',
            label: 'Ulangi kata sandi',
            tipe: 'password',
            atribut: { autocomplete: 'new-password', required: true, minlength: SANDI_MIN, maxlength: SANDI_MAKS },
          })}
          ${kolom({
            id: 'kode',
            label: 'Kode kelas',
            atribut: { autocomplete: 'off', required: true, maxlength: 20, autocapitalize: 'characters' },
          })}
          <div><button class="tombol" type="submit">Buat akun</button></div>
        </form>
        <p class="tautan-bawah">Sudah punya akun? <a href="/masuk">Masuk</a></p>`,
    });
  }

  router.get('/daftar', (req, res) => {
    if (req.pengguna) return res.redirect(303, '/');
    return halamanDaftar(req, res);
  });

  router.post('/daftar', async (req, res) => {
    const nim = String(req.body?.nim ?? '').trim();
    const nama = String(req.body?.nama ?? '').trim().replace(/\s+/g, ' ');
    const sandi = String(req.body?.sandi ?? '');
    const sandi2 = String(req.body?.sandi2 ?? '');
    const kode = String(req.body?.kode ?? '').trim().toUpperCase();
    const kunciIp = String(req.ip);

    if (batasDaftar.terkunci(kunciIp)) {
      return halamanDaftar(req, res, {
        nim,
        nama,
        status: 429,
        galat: ['Terlalu banyak percobaan dari perangkat ini. Tunggu sekitar 15 menit, lalu coba lagi.'],
      });
    }

    // Semua kesalahan dikumpulkan dulu lalu ditampilkan sekaligus, urut sesuai kolom formulir.
    // Memeriksa format input tidak membocorkan apa pun. Hal yang sensitif (apakah NIM sudah
    // terdaftar) baru diperiksa setelah kode kelas terbukti benar.
    const kodeBenar = ambilKodeKelas(db);
    const kodeCocok = Boolean(kodeBenar) && samaAman(kode, kodeBenar);

    const galat = [];
    if (!POLA_NIM.test(nim)) galat.push(`NIM harus berupa ${NIM_PANJANG} angka, contoh 26000000.`);
    if (nama.length < 2 || nama.length > 80) galat.push('Nama lengkap harus 2 sampai 80 karakter.');
    if (sandi.length < SANDI_MIN) galat.push(`Kata sandi minimal ${SANDI_MIN} karakter.`);
    if (sandi.length > SANDI_MAKS) galat.push(`Kata sandi maksimal ${SANDI_MAKS} karakter.`);
    if (sandi !== sandi2) galat.push('Kata sandi dan ulangannya tidak sama.');
    if (!kodeCocok) {
      batasDaftar.gagal(kunciIp);
      galat.push('Kode kelas tidak cocok. Minta kode yang benar ke Ketua atau Admin.');
    }
    if (galat.length) return halamanDaftar(req, res, { nim, nama, galat, status: kodeCocok ? 400 : 403 });

    const hash = await hashSandi(sandi);

    let penggunaId;
    try {
      // Blok sinkron: hitung pengguna dan simpan tidak bisa disela permintaan lain,
      // jadi hanya satu orang yang bisa menjadi Admin pertama.
      const peran = jumlahPengguna(db) === 0 ? 'admin' : 'anggota';
      penggunaId = Number(tambahPengguna.run(nim, nama, hash, peran).lastInsertRowid);
    } catch (err) {
      if (String(err?.message).includes('UNIQUE')) {
        return halamanDaftar(req, res, {
          nim,
          nama,
          status: 409,
          galat: ['NIM ini sudah terdaftar. Silakan masuk, atau hubungi Admin bila kamu lupa kata sandi.'],
        });
      }
      throw err;
    }

    mulaiSesi(req, res, penggunaId);
    return res.redirect(303, '/');
  });

  // --- Keluar --------------------------------------------------------------

  router.post('/keluar', (req, res) => {
    if (req.cookies?.sid) hapusSesi.run(sidik(req.cookies.sid));
    res.append('Set-Cookie', buatCookie('sid', '', { maxAge: 0, secure: config.isProd }));
    res.redirect(303, '/masuk');
  });

  return router;
}
