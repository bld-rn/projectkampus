import { Router } from 'express';
import { wajibMasuk } from '../middleware.js';
import { MODUL, html, kirim } from '../views.js';

export function buatPagesRouter() {
  const router = Router();

  router.get('/', wajibMasuk, (req, res) => {
    const namaDepan = req.pengguna.nama.split(' ')[0];
    kirim(req, res, {
      judul: 'Beranda',
      aktif: 'beranda',
      isi: html`<h1>Halo, ${namaDepan}.</h1>
        <p class="pengantar">
          Ini ruang bersama kelas untuk tugas, jadwal, materi, latihan, dan struktur kelas.
          Bagian-bagian di bawah dibuka satu per satu seiring pembangunan.
        </p>
        <ul class="daftar">
          ${MODUL.map(
            (m) => html`<li>
              <a class="baris" href="${m.href}">
                <span class="baris-nama">${m.nama}</span>
                <span class="baris-ket">${m.ket}</span>
                <span class="status">Menyusul</span>
              </a>
            </li>`,
          )}
        </ul>`,
    });
  });

  // Penampung sementara: tiap modul dibangun pada langkah berikutnya.
  for (const modul of MODUL) {
    router.get(modul.href, wajibMasuk, (req, res) => {
      kirim(req, res, {
        judul: modul.nama,
        aktif: modul.kunci,
        isi: html`<h1>${modul.nama}</h1>
          <p class="pengantar">${modul.ket}</p>
          <p>Bagian ini belum dibangun. Isinya akan hadir pada langkah berikutnya.</p>
          <p><a href="/">Kembali ke beranda</a></p>`,
      });
    });
  }

  return router;
}
