import { Router } from 'express';
import { buatKodeKelas, ambilKodeKelas, setKodeKelas } from '../db.js';
import { wajibIzin } from '../middleware.js';
import { PERAN, bolehkan, namaPeran } from '../roles.js';
import { atr, bidangCsrf, html, kirim, kirimGalat } from '../views.js';

export function buatAdminRouter({ db }) {
  const router = Router();

  const tolak = (req, res) =>
    kirimGalat(
      req,
      res,
      403,
      'Akses ditolak',
      'Halaman ini hanya untuk Admin. Bila kamu seharusnya punya akses, minta Admin mengubah perananmu.',
    );
  const izin = wajibIzin(bolehkan, 'pengguna.kelola', tolak);

  const semuaPengguna = db.prepare(
    'SELECT id, nim, nama, peran FROM pengguna ORDER BY nama COLLATE NOCASE',
  );
  const cariPengguna = db.prepare('SELECT id, nama, peran FROM pengguna WHERE id = ?');
  const jumlahAdmin = db.prepare("SELECT COUNT(*) AS n FROM pengguna WHERE peran = 'admin'");
  const ubahPeran = db.prepare('UPDATE pengguna SET peran = ? WHERE id = ?');

  function tampil(req, res, { pesan = null, status = 200 } = {}) {
    const daftar = semuaPengguna.all();
    kirim(req, res, {
      judul: 'Pengguna',
      aktif: 'admin',
      status,
      isi: html`<h1>Pengguna</h1>
        <p class="pengantar">
          Atur peran tiap anggota kelas dan kelola kode kelas untuk pendaftaran.
        </p>
        ${pesan
          ? html`<div class="${pesan.jenis === 'galat' ? 'pesan' : 'pesan pesan-info'}" role="${pesan.jenis === 'galat' ? 'alert' : 'status'}">${pesan.teks}</div>`
          : ''}

        <h2>Kode kelas</h2>
        <p>Bagikan kode ini hanya ke teman sekelas. Tanpa kode, orang lain tidak bisa mendaftar.</p>
        <div class="kode-kelas">
          <span class="kode">${ambilKodeKelas(db)}</span>
          <form method="post" action="/admin/kode-kelas">
            ${bidangCsrf(res.locals.csrf)}
            <button class="tombol tombol-garis" type="submit">Buat kode baru</button>
          </form>
        </div>

        <h2>Anggota kelas (${daftar.length})</h2>
        <ul class="anggota">
          ${daftar.map(
            (p) => html`<li class="anggota-baris">
              <div>
                <span class="anggota-nama">${p.nama}</span>
                <span class="anggota-nim">NIM ${p.nim}</span>
              </div>
              <form class="sebaris" method="post" action="/admin/pengguna/${p.id}/peran">
                ${bidangCsrf(res.locals.csrf)}
                <select name="peran" aria-label="Peran untuk ${p.nama}">
                  ${Object.entries(PERAN).map(
                    ([kunci, nama]) => html`<option value="${kunci}"${atr({ selected: kunci === p.peran })}>${nama}</option>`,
                  )}
                </select>
                <button class="tombol tombol-garis" type="submit">Simpan</button>
              </form>
            </li>`,
          )}
        </ul>`,
    });
  }

  router.get('/admin/pengguna', izin, (req, res) => tampil(req, res));

  router.post('/admin/pengguna/:id/peran', izin, (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const peranBaru = String(req.body?.peran ?? '');
    const target = Number.isSafeInteger(id) ? cariPengguna.get(id) : undefined;

    if (!target) {
      return tampil(req, res, {
        status: 404,
        pesan: { jenis: 'galat', teks: 'Pengguna tidak ditemukan. Muat ulang halaman lalu coba lagi.' },
      });
    }
    if (!Object.hasOwn(PERAN, peranBaru)) {
      return tampil(req, res, {
        status: 400,
        pesan: { jenis: 'galat', teks: 'Peran yang dipilih tidak dikenal.' },
      });
    }
    if (target.peran === 'admin' && peranBaru !== 'admin' && jumlahAdmin.get().n <= 1) {
      return tampil(req, res, {
        status: 409,
        pesan: {
          jenis: 'galat',
          teks: 'Peran ini tidak diubah karena dia satu-satunya Admin. Jadikan pengguna lain Admin dulu.',
        },
      });
    }

    ubahPeran.run(peranBaru, target.id);
    return tampil(req, res, {
      pesan: { jenis: 'info', teks: `Peran ${target.nama} sekarang ${namaPeran(peranBaru)}.` },
    });
  });

  router.post('/admin/kode-kelas', izin, (req, res) => {
    setKodeKelas(db, buatKodeKelas());
    tampil(req, res, {
      pesan: {
        jenis: 'info',
        teks: 'Kode kelas sudah diganti. Kode lama tidak bisa dipakai lagi untuk mendaftar. Bagikan kode baru ke teman sekelas.',
      },
    });
  });

  return router;
}
