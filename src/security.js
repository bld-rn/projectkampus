import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

/** Kata sandi disimpan sebagai hash scrypt berformat "scrypt$garam$hash". */
export async function hashSandi(sandi) {
  const garam = crypto.randomBytes(16);
  const hash = await scrypt(sandi, garam, 64);
  return `scrypt$${garam.toString('base64')}$${hash.toString('base64')}`;
}

export async function cocokSandi(sandi, tersimpan) {
  const [skema, garamB64, hashB64] = String(tersimpan).split('$');
  if (skema !== 'scrypt' || !garamB64 || !hashB64) return false;
  const hash = Buffer.from(hashB64, 'base64');
  const hitung = await scrypt(sandi, Buffer.from(garamB64, 'base64'), hash.length);
  return crypto.timingSafeEqual(hash, hitung);
}

export function buatToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/** Token sesi hanya disimpan dalam bentuk hash di database. */
export function sidik(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Perbandingan teks yang tahan serangan waktu. */
export function samaAman(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function bacaCookie(header = '') {
  const hasil = {};
  for (const potong of String(header).split(';')) {
    const i = potong.indexOf('=');
    if (i < 0) continue;
    const nama = potong.slice(0, i).trim();
    if (!nama || Object.hasOwn(hasil, nama)) continue;
    try {
      hasil[nama] = decodeURIComponent(potong.slice(i + 1).trim());
    } catch {
      // cookie rusak diabaikan
    }
  }
  return hasil;
}

export function buatCookie(nama, nilai, { maxAge, secure = false } = {}) {
  const bagian = [`${nama}=${encodeURIComponent(nilai)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAge !== undefined) bagian.push(`Max-Age=${maxAge}`);
  if (secure) bagian.push('Secure');
  return bagian.join('; ');
}

/** Pembatas percobaan (di memori): maksimal `maks` kegagalan per `jendelaMs`. */
export class PembatasPercobaan {
  constructor({ maks = 5, jendelaMs = 15 * 60 * 1000 } = {}) {
    this.maks = maks;
    this.jendelaMs = jendelaMs;
    this.data = new Map();
  }

  #segar(kunci) {
    const e = this.data.get(kunci);
    if (e && Date.now() - e.mulai > this.jendelaMs) {
      this.data.delete(kunci);
      return null;
    }
    return e ?? null;
  }

  terkunci(kunci) {
    const e = this.#segar(kunci);
    return e !== null && e.hitung >= this.maks;
  }

  gagal(kunci) {
    if (this.data.size > 10000) this.data.clear();
    const e = this.#segar(kunci);
    if (e) e.hitung += 1;
    else this.data.set(kunci, { hitung: 1, mulai: Date.now() });
  }

  bersihkan(kunci) {
    this.data.delete(kunci);
  }
}
