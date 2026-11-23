// Daftar peran dan izin. Perubahan hak akses cukup dilakukan di berkas ini.

export const PERAN = {
  admin: 'Admin',
  ketua: 'Ketua Kelas',
  wakil: 'Wakil Ketua Kelas',
  sekretaris: 'Sekretaris',
  bendahara: 'Bendahara',
  pj: 'Penanggung Jawab Mata Kuliah',
  anggota: 'Anggota',
};

// Izin yang sudah diputuskan:
//   - struktur.ubah : Admin + Ketua + Wakil Ketua
//   - pengguna.kelola : hanya Admin
// Izin berikut masih USULAN dan akan dikonfirmasi di langkah masing-masing:
//   - jadwal.ubah, tugas.tambah
const IZIN = {
  'pengguna.kelola': ['admin'],
  'struktur.ubah': ['admin', 'ketua', 'wakil'],
  'jadwal.ubah': ['admin', 'ketua', 'wakil'],
  'tugas.tambah': ['admin', 'ketua', 'wakil', 'sekretaris', 'pj'],
};

export function bolehkan(peran, izin) {
  return (IZIN[izin] ?? []).includes(peran);
}

export function namaPeran(peran) {
  return Object.hasOwn(PERAN, peran) ? PERAN[peran] : 'Anggota';
}
