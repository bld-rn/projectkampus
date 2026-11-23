import { bacaCookie, buatCookie, buatToken, sidik, samaAman } from './security.js';

const METODE_UBAH = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const POLA_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Header keamanan untuk semua respons. Tidak ada skrip inline, jadi CSP bisa ketat. */
export function headerKeamanan(config) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');

  return (req, res, next) => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (config.isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  };
}

/** Membaca cookie sesi dan menaruh pengguna yang sedang masuk di `req.pengguna`. */
export function middlewareSesi(db) {
  const cari = db.prepare(
    `SELECT p.id, p.nim, p.nama, p.peran
       FROM sesi s JOIN pengguna p ON p.id = s.pengguna_id
      WHERE s.token_hash = ? AND s.kedaluwarsa > ?`,
  );
  const bersihkan = db.prepare('DELETE FROM sesi WHERE kedaluwarsa <= ?');
  let terakhirBersih = 0;

  return (req, res, next) => {
    // Halaman dinamis memuat data pribadi: jangan disimpan di cache.
    res.setHeader('Cache-Control', 'no-store');
    const sekarang = Date.now();
    if (sekarang - terakhirBersih > 60 * 60 * 1000) {
      bersihkan.run(sekarang);
      terakhirBersih = sekarang;
    }
    req.cookies = bacaCookie(req.headers.cookie);
    req.pengguna = null;
    if (req.cookies.sid) {
      req.pengguna = cari.get(sidik(req.cookies.sid), sekarang) ?? null;
    }
    next();
  };
}

/**
 * Perlindungan CSRF (double-submit cookie): setiap formulir membawa kolom
 * tersembunyi `_csrf` yang harus sama dengan cookie `csrf` pada permintaan POST.
 */
export function middlewareCsrf(config, tolak) {
  return (req, res, next) => {
    let token = req.cookies?.csrf;
    if (!token || !POLA_TOKEN.test(token)) {
      token = buatToken();
      res.append('Set-Cookie', buatCookie('csrf', token, { secure: config.isProd }));
    }
    res.locals.csrf = token;

    if (METODE_UBAH.has(req.method)) {
      const kiriman = req.body?._csrf;
      if (typeof kiriman !== 'string' || !samaAman(kiriman, token)) {
        return tolak(req, res);
      }
    }
    return next();
  };
}

/** Mengarahkan pengunjung yang belum masuk ke halaman masuk. */
export function wajibMasuk(req, res, next) {
  if (req.pengguna) return next();
  return res.redirect(303, '/masuk');
}

/** Hanya pengguna dengan izin tertentu yang boleh lewat. */
export function wajibIzin(bolehkan, izin, tolak) {
  return (req, res, next) => {
    if (!req.pengguna) return res.redirect(303, '/masuk');
    if (!bolehkan(req.pengguna.peran, izin)) return tolak(req, res);
    return next();
  };
}
