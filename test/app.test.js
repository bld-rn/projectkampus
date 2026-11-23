import test from 'node:test';
import assert from 'node:assert/strict';
import { buatApp } from '../src/app.js';
import { bukaDatabase, pastikanKodeKelas } from '../src/db.js';
import { loadConfig } from '../src/config.js';

// ---------------------------------------------------------------------------
// Perlengkapan uji: server sungguhan di port acak + "browser" kecil dengan cookie
// ---------------------------------------------------------------------------

async function mulaiServer() {
  const config = loadConfig({ dbPath: ':memory:', isProd: false, trustProxy: false });
  const db = bukaDatabase(':memory:');
  const kode = pastikanKodeKelas(db, 'UJI12345');
  const app = buatApp({ config, db });
  const server = await new Promise((selesai) => {
    const s = app.listen(0, '127.0.0.1', () => selesai(s));
  });
  return {
    db,
    kode,
    base: `http://127.0.0.1:${server.address().port}`,
    tutup: () => new Promise((selesai) => server.close(selesai)),
  };
}

class Peramban {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
    this.setCookieTerakhir = [];
  }

  async minta(jalur, { method = 'GET', form } = {}) {
    const headers = {};
    if (this.cookies.size) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    let body;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    }
    const res = await fetch(this.base + jalur, { method, headers, body, redirect: 'manual' });
    this.setCookieTerakhir = res.headers.getSetCookie();
    for (const sc of this.setCookieTerakhir) {
      const [pasangan] = sc.split(';');
      const i = pasangan.indexOf('=');
      const nama = pasangan.slice(0, i);
      const nilai = pasangan.slice(i + 1);
      if (/Max-Age=0/i.test(sc)) this.cookies.delete(nama);
      else this.cookies.set(nama, nilai);
    }
    return res;
  }

  /** Buka halaman, ambil token CSRF dari formulir di dalamnya. */
  async token(jalur) {
    const teks = await (await this.minta(jalur)).text();
    return /name="_csrf" value="([^"]+)"/.exec(teks)?.[1];
  }

  /** Kirim formulir POST lengkap dengan token CSRF dari halaman `asal`. */
  async kirim(asal, tujuan, isi) {
    const _csrf = await this.token(asal);
    return this.minta(tujuan, { method: 'POST', form: { _csrf, ...isi } });
  }

  async daftar(isi) {
    return this.kirim('/daftar', '/daftar', {
      nim: '26000001',
      nama: 'Rani Uji',
      sandi: 'kata-sandi-uji-1',
      sandi2: 'kata-sandi-uji-1',
      kode: 'UJI12345',
      ...isi,
    });
  }
}

async function denganServer(fn) {
  const s = await mulaiServer();
  try {
    await fn(s);
  } finally {
    await s.tutup();
    s.db.close();
  }
}

// ---------------------------------------------------------------------------
// Akses dan keamanan dasar
// ---------------------------------------------------------------------------

test('pengunjung yang belum masuk diarahkan ke halaman masuk', async () => {
  await denganServer(async ({ base }) => {
    const res = await new Peramban(base).minta('/');
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/masuk');
  });
});

test('header keamanan terpasang dan tidak membocorkan Express', async () => {
  await denganServer(async ({ base }) => {
    const res = await new Peramban(base).minta('/masuk');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });
});

test('halaman tidak memuat skrip atau gaya inline (agar CSP ketat tidak rusak)', async () => {
  await denganServer(async ({ base }) => {
    const b = new Peramban(base);
    await b.daftar();
    for (const jalur of ['/masuk', '/', '/tugas', '/admin/pengguna']) {
      const teks = await (await b.minta(jalur)).text();
      assert.doesNotMatch(teks, /<script/i, jalur);
      assert.doesNotMatch(teks, /\sstyle="/i, jalur);
      assert.doesNotMatch(teks, /\son[a-z]+="/i, jalur);
    }
  });
});

test('berkas statis (CSS dan font) tersaji, berkas proyek tidak', async () => {
  await denganServer(async ({ base }) => {
    const css = await fetch(`${base}/css/app.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);
    const font = await fetch(`${base}/fonts/barlow-condensed-latin-600-normal.woff2`);
    assert.equal(font.status, 200);
    for (const jalur of ['/package.json', '/src/db.js', '/%2e%2e/package.json', '/.env']) {
      const res = await fetch(base + jalur);
      assert.notEqual(res.status, 200, jalur);
    }
  });
});

test('halaman yang tidak ada menampilkan penjelasan, bukan jejak galat', async () => {
  await denganServer(async ({ base }) => {
    const res = await new Peramban(base).minta('/tidak-ada');
    assert.equal(res.status, 404);
    const teks = await res.text();
    assert.match(teks, /Halaman tidak ditemukan/);
    assert.doesNotMatch(teks, /at .*\.js:\d+/);
  });
});

// ---------------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------------

test('POST tanpa token CSRF ditolak', async () => {
  await denganServer(async ({ base, db }) => {
    const b = new Peramban(base);
    await b.minta('/daftar'); // mendapat cookie csrf
    const res = await b.minta('/daftar', {
      method: 'POST',
      form: { nim: '26000001', nama: 'Rani', sandi: 'kata-sandi-uji-1', sandi2: 'kata-sandi-uji-1', kode: 'UJI12345' },
    });
    assert.equal(res.status, 403);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pengguna').get().n, 0);
  });
});

test('POST dengan token CSRF yang salah ditolak', async () => {
  await denganServer(async ({ base }) => {
    const b = new Peramban(base);
    await b.minta('/daftar');
    const res = await b.minta('/daftar', { method: 'POST', form: { _csrf: 'token-palsu', nim: '26000001' } });
    assert.equal(res.status, 403);
  });
});

// ---------------------------------------------------------------------------
// Pendaftaran
// ---------------------------------------------------------------------------

test('kode kelas salah menolak pendaftaran dan tidak membuat akun', async () => {
  await denganServer(async ({ base, db }) => {
    const res = await new Peramban(base).daftar({ kode: 'SALAH999' });
    assert.equal(res.status, 403);
    assert.match(await res.text(), /Kode kelas tidak cocok/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pengguna').get().n, 0);
  });
});

test('kode kelas salah tidak menyembunyikan kesalahan input lain', async () => {
  await denganServer(async ({ base, db }) => {
    const res = await new Peramban(base).daftar({ kode: 'SALAH999', nim: 'a b', sandi: 'pendek', sandi2: 'pendek' });
    assert.equal(res.status, 403);
    const teks = await res.text();
    assert.match(teks, /Perbaiki 3 hal berikut/);
    assert.match(teks, /NIM harus berupa 8 angka/);
    assert.match(teks, /Kata sandi minimal 8 karakter/);
    assert.match(teks, /Kode kelas tidak cocok/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pengguna').get().n, 0);
  });
});

test('NIM yang sudah terdaftar tidak terungkap bila kode kelas salah', async () => {
  await denganServer(async ({ base }) => {
    await new Peramban(base).daftar();
    const res = await new Peramban(base).daftar({ kode: 'SALAH999', nim: '26000001', nama: 'Penyusup' });
    assert.equal(res.status, 403);
    assert.doesNotMatch(await res.text(), /sudah terdaftar/);
  });
});

test('kode kelas tidak peka huruf besar/kecil', async () => {
  await denganServer(async ({ base }) => {
    const res = await new Peramban(base).daftar({ kode: 'uji12345' });
    assert.equal(res.status, 303);
  });
});

test('NIM harus tepat 8 angka: format lain ditolak, 26000000 dan 26000001 diterima', async () => {
  await denganServer(async ({ base, db }) => {
    const ditolak = ['2600000', '260000001', '2600000A', 'A2600000', '2600 0000', '26-00000', ''];
    for (const nim of ditolak) {
      const res = await new Peramban(base).daftar({ nim });
      assert.equal(res.status, 400, `NIM "${nim}" seharusnya ditolak`);
      assert.match(await res.text(), /NIM harus berupa 8 angka, contoh 26000000/);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pengguna').get().n, 0);

    for (const nim of ['26000000', '26000001']) {
      const res = await new Peramban(base).daftar({ nim, nama: `Mahasiswa ${nim}` });
      assert.equal(res.status, 303, `NIM ${nim} seharusnya diterima`);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pengguna').get().n, 2);
  });
});

test('formulir NIM memakai papan angka di ponsel dan batas 8 karakter', async () => {
  await denganServer(async ({ base }) => {
    for (const jalur of ['/masuk', '/daftar']) {
      const teks = await (await new Peramban(base).minta(jalur)).text();
      const kolomNim = /<input id="nim"[^>]*>/.exec(teks)?.[0] ?? '';
      assert.match(kolomNim, /inputmode="numeric"/, jalur);
      assert.match(kolomNim, /maxlength="8"/, jalur);
    }
  });
});

test('akun pertama menjadi Admin, akun berikutnya Anggota', async () => {
  await denganServer(async ({ base, db }) => {
    const satu = new Peramban(base);
    const res = await satu.daftar();
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/');

    const dua = new Peramban(base);
    await dua.daftar({ nim: '26000002', nama: 'Dewi Uji' });

    const peran = db.prepare('SELECT nim, peran FROM pengguna ORDER BY id').all();
    assert.deepEqual(
      peran.map((p) => [p.nim, p.peran]),
      [['26000001', 'admin'], ['26000002', 'anggota']],
    );
  });
});

test('semua kesalahan input ditampilkan sekaligus, bukan satu per satu', async () => {
  await denganServer(async ({ base, db }) => {
    const res = await new Peramban(base).daftar({ nim: 'a b', nama: 'X', sandi: 'pendek', sandi2: 'beda' });
    assert.equal(res.status, 400);
    const teks = await res.text();
    assert.match(teks, /NIM harus berupa 8 angka/);
    assert.match(teks, /Nama lengkap harus 2 sampai 80 karakter/);
    assert.match(teks, /Kata sandi minimal 8 karakter/);
    assert.match(teks, /tidak sama/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pengguna').get().n, 0);
  });
});

test('NIM yang sama tidak bisa didaftarkan dua kali', async () => {
  await denganServer(async ({ base, db }) => {
    await new Peramban(base).daftar();
    const res = await new Peramban(base).daftar({ nim: '26000001', nama: 'Orang Lain' });
    assert.equal(res.status, 409);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pengguna').get().n, 1);
  });
});

test('kata sandi disimpan sebagai hash scrypt, tidak pernah sebagai teks asli', async () => {
  await denganServer(async ({ base, db }) => {
    await new Peramban(base).daftar();
    const { sandi_hash: hash } = db.prepare('SELECT sandi_hash FROM pengguna').get();
    assert.match(hash, /^scrypt\$/);
    assert.ok(!hash.includes('kata-sandi-uji-1'));
  });
});

test('nama berisi HTML tampil sebagai teks biasa (anti XSS)', async () => {
  await denganServer(async ({ base }) => {
    const b = new Peramban(base);
    await b.daftar({ nama: '<img src=x onerror=alert(1)>' });
    for (const jalur of ['/', '/admin/pengguna']) {
      const teks = await (await b.minta(jalur)).text();
      assert.ok(!teks.includes('<img src=x'), jalur);
      assert.ok(teks.includes('&lt;img src=x'), jalur);
    }
  });
});

// ---------------------------------------------------------------------------
// Masuk dan keluar
// ---------------------------------------------------------------------------

test('cookie sesi HttpOnly + SameSite, dan beranda terbuka setelah masuk', async () => {
  await denganServer(async ({ base }) => {
    const b = new Peramban(base);
    await b.daftar();
    const sid = b.setCookieTerakhir.find((c) => c.startsWith('sid='));
    assert.match(sid, /HttpOnly/);
    assert.match(sid, /SameSite=Lax/);
    const res = await b.minta('/');
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Halo, Rani\./);
  });
});

test('masuk dengan kata sandi benar berhasil', async () => {
  await denganServer(async ({ base }) => {
    await new Peramban(base).daftar();
    const b = new Peramban(base);
    const res = await b.kirim('/masuk', '/masuk', { nim: '26000001', sandi: 'kata-sandi-uji-1' });
    assert.equal(res.status, 303);
    assert.equal((await b.minta('/')).status, 200);
  });
});

test('pesan gagal masuk sama untuk NIM yang tidak ada dan kata sandi yang salah', async () => {
  await denganServer(async ({ base }) => {
    await new Peramban(base).daftar();
    const salahSandi = await new Peramban(base).kirim('/masuk', '/masuk', { nim: '26000001', sandi: 'salah-salah-salah' });
    const salahNim = await new Peramban(base).kirim('/masuk', '/masuk', { nim: '26999999', sandi: 'salah-salah-salah' });
    assert.equal(salahSandi.status, 401);
    assert.equal(salahNim.status, 401);
    const a = (await salahSandi.text()).match(/NIM atau kata sandi tidak cocok[^<]*/)?.[0];
    const z = (await salahNim.text()).match(/NIM atau kata sandi tidak cocok[^<]*/)?.[0];
    assert.ok(a);
    assert.equal(a, z);
  });
});

test('lima kegagalan beruntun mengunci percobaan berikutnya', async () => {
  await denganServer(async ({ base }) => {
    await new Peramban(base).daftar();
    const b = new Peramban(base);
    for (let i = 0; i < 5; i += 1) {
      const res = await b.kirim('/masuk', '/masuk', { nim: '26000001', sandi: 'salah-salah-salah' });
      assert.equal(res.status, 401, `percobaan ${i + 1}`);
    }
    // Kata sandi yang benar pun ditolak selama terkunci.
    const terkunci = await b.kirim('/masuk', '/masuk', { nim: '26000001', sandi: 'kata-sandi-uji-1' });
    assert.equal(terkunci.status, 429);
    assert.match(await terkunci.text(), /Terlalu banyak percobaan/);
  });
});

test('keluar menghapus sesi di server, bukan hanya cookie di browser', async () => {
  await denganServer(async ({ base, db }) => {
    const b = new Peramban(base);
    await b.daftar();
    const sidLama = b.cookies.get('sid');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sesi').get().n, 1);

    const res = await b.kirim('/', '/keluar', {});
    assert.equal(res.status, 303);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sesi').get().n, 0);

    // Cookie lama yang dicuri/diputar ulang tidak lagi berlaku.
    const penyerang = new Peramban(base);
    penyerang.cookies.set('sid', sidLama);
    assert.equal((await penyerang.minta('/')).status, 303);
  });
});

test('token sesi tidak disimpan polos di database', async () => {
  await denganServer(async ({ base, db }) => {
    const b = new Peramban(base);
    await b.daftar();
    const { token_hash: hash } = db.prepare('SELECT token_hash FROM sesi').get();
    assert.notEqual(hash, b.cookies.get('sid'));
    assert.match(hash, /^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Peran dan halaman Admin
// ---------------------------------------------------------------------------

test('Anggota biasa tidak bisa membuka atau memakai halaman Admin', async () => {
  await denganServer(async ({ base, db }) => {
    await new Peramban(base).daftar();
    const anggota = new Peramban(base);
    await anggota.daftar({ nim: '26000002', nama: 'Dewi Uji' });

    assert.equal((await anggota.minta('/admin/pengguna')).status, 403);

    const idAdmin = db.prepare("SELECT id FROM pengguna WHERE nim = '26000001'").get().id;
    const idAnggota = db.prepare("SELECT id FROM pengguna WHERE nim = '26000002'").get().id;
    const res = await anggota.kirim('/', `/admin/pengguna/${idAnggota}/peran`, { peran: 'admin' });
    assert.equal(res.status, 403);
    assert.equal(db.prepare('SELECT peran FROM pengguna WHERE id = ?').get(idAnggota).peran, 'anggota');
    assert.equal(db.prepare('SELECT peran FROM pengguna WHERE id = ?').get(idAdmin).peran, 'admin');
  });
});

test('Admin bisa mengubah peran, dan tidak bisa menurunkan Admin terakhir', async () => {
  await denganServer(async ({ base, db }) => {
    const admin = new Peramban(base);
    await admin.daftar();
    await new Peramban(base).daftar({ nim: '26000002', nama: 'Dewi Uji' });

    const id = (nim) => db.prepare('SELECT id FROM pengguna WHERE nim = ?').get(nim).id;

    const ok = await admin.kirim('/admin/pengguna', `/admin/pengguna/${id('26000002')}/peran`, { peran: 'ketua' });
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /Dewi Uji sekarang Ketua Kelas/);
    assert.equal(db.prepare("SELECT peran FROM pengguna WHERE nim = '26000002'").get().peran, 'ketua');

    const tolak = await admin.kirim('/admin/pengguna', `/admin/pengguna/${id('26000001')}/peran`, { peran: 'anggota' });
    assert.equal(tolak.status, 409);
    assert.equal(db.prepare("SELECT peran FROM pengguna WHERE nim = '26000001'").get().peran, 'admin');

    const asing = await admin.kirim('/admin/pengguna', `/admin/pengguna/${id('26000002')}/peran`, { peran: 'presiden' });
    assert.equal(asing.status, 400);
  });
});

test('peran baru langsung berlaku tanpa perlu masuk ulang', async () => {
  await denganServer(async ({ base, db }) => {
    const admin = new Peramban(base);
    await admin.daftar();
    const dewi = new Peramban(base);
    await dewi.daftar({ nim: '26000002', nama: 'Dewi Uji' });
    assert.equal((await dewi.minta('/admin/pengguna')).status, 403);

    const idDewi = db.prepare("SELECT id FROM pengguna WHERE nim = '26000002'").get().id;
    await admin.kirim('/admin/pengguna', `/admin/pengguna/${idDewi}/peran`, { peran: 'admin' });
    assert.equal((await dewi.minta('/admin/pengguna')).status, 200);
  });
});

test('Admin bisa mengganti kode kelas; kode lama tidak berlaku lagi', async () => {
  await denganServer(async ({ base, db }) => {
    const admin = new Peramban(base);
    await admin.daftar();
    const res = await admin.kirim('/admin/pengguna', '/admin/kode-kelas', {});
    assert.equal(res.status, 200);
    const baru = db.prepare("SELECT nilai FROM pengaturan WHERE kunci = 'kode_kelas'").get().nilai;
    assert.notEqual(baru, 'UJI12345');
    assert.match(baru, /^[A-Z2-9]{8}$/);

    const lama = await new Peramban(base).daftar({ nim: '26000003', nama: 'Tamu', kode: 'UJI12345' });
    assert.equal(lama.status, 403);
    const benar = await new Peramban(base).daftar({ nim: '26000003', nama: 'Tamu', kode: baru });
    assert.equal(benar.status, 303);
  });
});

test('menu Pengguna hanya tampil untuk Admin', async () => {
  await denganServer(async ({ base }) => {
    const admin = new Peramban(base);
    await admin.daftar();
    const anggota = new Peramban(base);
    await anggota.daftar({ nim: '26000002', nama: 'Dewi Uji' });
    assert.match(await (await admin.minta('/')).text(), /href="\/admin\/pengguna"/);
    assert.doesNotMatch(await (await anggota.minta('/')).text(), /href="\/admin\/pengguna"/);
  });
});
