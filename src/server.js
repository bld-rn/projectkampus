import { loadConfig } from './config.js';
import { bukaDatabase, jumlahPengguna, pastikanKodeKelas } from './db.js';
import { buatApp } from './app.js';

const config = loadConfig();
const db = bukaDatabase(config.dbPath);
const kodeKelas = pastikanKodeKelas(db, config.kodeKelasAwal);
const app = buatApp({ config, db });

const server = app.listen(config.port, () => {
  console.log(`${config.appNama} berjalan di http://localhost:${config.port}`);
  // Kode kelas hanya ditampilkan selama belum ada akun, supaya pemilik bisa mendaftar sebagai Admin.
  if (jumlahPengguna(db) === 0) {
    console.log('Belum ada akun. Buka /daftar; akun pertama otomatis menjadi Admin.');
    console.log(`Kode kelas untuk pendaftaran: ${kodeKelas}`);
  }
});

function matikan() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', matikan);
process.on('SIGTERM', matikan);
