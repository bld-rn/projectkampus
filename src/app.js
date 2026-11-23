import express from 'express';
import { fileURLToPath } from 'node:url';
import { headerKeamanan, middlewareCsrf, middlewareSesi } from './middleware.js';
import { kirimGalat } from './views.js';
import { buatAuthRouter } from './routes/auth.js';
import { buatPagesRouter } from './routes/pages.js';
import { buatAdminRouter } from './routes/admin.js';

const FOLDER_PUBLIK = fileURLToPath(new URL('../public', import.meta.url));

export function buatApp({ config, db }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.locals.config = config;

  app.use(headerKeamanan(config));
  app.use(express.static(FOLDER_PUBLIK, { dotfiles: 'ignore', maxAge: config.isProd ? '1d' : 0 }));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(middlewareSesi(db));
  app.use(
    middlewareCsrf(config, (req, res) =>
      kirimGalat(
        req,
        res,
        403,
        'Formulir sudah kedaluwarsa',
        'Halaman ini mungkin terbuka terlalu lama, atau browsermu memblokir cookie. Muat ulang halaman, lalu kirim formulirnya lagi.',
      ),
    ),
  );

  app.use(buatAuthRouter({ db, config }));
  app.use(buatPagesRouter());
  app.use(buatAdminRouter({ db }));

  app.use((req, res) =>
    kirimGalat(req, res, 404, 'Halaman tidak ditemukan', 'Alamat ini tidak ada. Periksa ejaannya, atau kembali ke beranda.'),
  );

  // Penangan galat harus punya empat parameter agar dikenali Express.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) {
      // Hanya pesan galat yang dicatat, tidak pernah isi formulir.
      console.error('Galat tak terduga:', err?.stack ?? err);
      return kirimGalat(
        req,
        res,
        500,
        'Terjadi masalah di server',
        'Permintaanmu belum bisa diproses. Coba lagi sebentar lagi. Bila terus terjadi, beri tahu Admin.',
      );
    }
    return kirimGalat(
      req,
      res,
      status,
      'Permintaan tidak valid',
      'Data yang dikirim terlalu besar atau formatnya tidak dikenali. Muat ulang halaman, lalu coba lagi.',
    );
  });

  return app;
}
