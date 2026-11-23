import path from 'node:path';

/**
 * Membaca pengaturan dari variabel lingkungan (lihat .env.example).
 * `overrides` dipakai oleh uji otomatis.
 */
export function loadConfig(overrides = {}) {
  const env = process.env;
  return {
    port: Number(env.PORT || 3000),
    isProd: env.NODE_ENV === 'production',
    // Isi TRUST_PROXY=1 bila situs berada di belakang proxy hosting (Railway, Render, dll.)
    // supaya alamat IP pengunjung terbaca benar untuk pembatas percobaan masuk.
    trustProxy: env.TRUST_PROXY === '1',
    dbPath: env.DB_PATH || path.resolve('data', 'projectkampus.db'),
    appNama: env.APP_NAMA || 'Projek Kuliah',
    kampusNama: env.KAMPUS_NAMA || 'Universitas Widyatama',
    kodeKelasAwal: env.KODE_KELAS || '',
    sesiHari: 7,
    ...overrides,
  };
}
