# Projek Kuliah

*For that one reader*

Website kelas untuk mencatat tugas, melihat jadwal, belajar materi, berlatih soal, dan melihat struktur kelas.

**Status:** langkah 1 selesai (kerangka, login, dan peran pengguna). Tugas, Jadwal, Materi, Latihan, dan Struktur kelas masih berupa halaman penampung bertanda "Menyusul" dan dibangun satu per satu.

## Menjalankan di komputer sendiri

Butuh [Node.js](https://nodejs.org) versi 22.13 atau lebih baru.

```bash
npm install
cp .env.example .env     # lalu isi bila perlu
npm start
```

Buka `http://localhost:3000`. Selama belum ada akun, terminal menampilkan **kode kelas**. Pakai kode itu untuk mendaftar di `/daftar`: **akun pertama otomatis menjadi Admin**.

Pengaturan ada di `.env` (contoh di `.env.example`):

| Nama | Fungsi |
| --- | --- |
| `APP_NAMA` | Nama yang tampil di kotak judul |
| `KAMPUS_NAMA` | Nama kampus yang tampil di kotak judul |
| `KODE_KELAS` | Kode pendaftaran awal. Kosongkan agar dibuat acak |
| `DB_PATH` | Lokasi berkas database SQLite |
| `PORT` | Port server |
| `TRUST_PROXY` | Isi `1` bila situs berada di belakang proxy hosting |

## Peran dan hak akses

Daftar peran dan izin ada di satu berkas: `src/roles.js`.

| Izin | Siapa |
| --- | --- |
| Mengelola pengguna dan kode kelas | Admin |
| Mengubah struktur kelas (**sudah diputuskan**) | Admin, Ketua, Wakil Ketua |
| Mengubah jadwal (**usulan**) | Admin, Ketua, Wakil Ketua |
| Menambah tugas (**usulan**) | Admin, Ketua, Wakil Ketua, Sekretaris, Penanggung Jawab |

Peran lain: Bendahara dan Anggota. Peran diatur Admin di halaman **Pengguna**.

## Keamanan

- Kata sandi disimpan sebagai hash scrypt, tidak pernah sebagai teks asli.
- Sesi disimpan di server (token di database hanya dalam bentuk hash), berlaku 7 hari, dan benar-benar dihapus saat keluar.
- Cookie `HttpOnly` dan `SameSite=Lax` (ditambah `Secure` di produksi).
- Perlindungan CSRF di semua formulir.
- Percobaan masuk dibatasi: 5 kegagalan per NIM dan alamat, lalu terkunci sekitar 15 menit.
- Pendaftaran hanya dengan kode kelas.
- Semua teks yang tampil di-escape otomatis, tanpa skrip inline, dengan Content-Security-Policy ketat.
- Tidak ada kata sandi atau rahasia di dalam berkas repo. `.env` dan `data/` tidak ikut tersimpan di Git.

## Struktur folder

```
src/
  server.js      titik masuk
  app.js         susunan aplikasi
  config.js      pembacaan pengaturan
  db.js          database SQLite dan migrasi
  security.js    hash sandi, token, cookie, pembatas percobaan
  middleware.js  header keamanan, sesi, CSRF
  roles.js       peran dan izin
  views.js       kerangka halaman dan komponen tampilan
  routes/        masuk/daftar, halaman, admin
public/          CSS dan font
test/            uji otomatis
```

## Uji otomatis

```bash
npm test
```

## Yang belum diputuskan

- **Format NIM:** sementara huruf/angka 5 sampai 20 karakter. Sesuaikan di `src/routes/auth.js` bila format NIM kampus berbeda.
- **Hosting:** database SQLite butuh penyimpanan yang tetap (persistent volume). Tanpa itu, data hilang tiap situs dipasang ulang.

## Lisensi font

Barlow Condensed dan Atkinson Hyperlegible dipakai di bawah SIL Open Font License 1.1. Teks lisensinya ada di `public/fonts/`.
