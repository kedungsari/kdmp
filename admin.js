/* =====================================================================
   admin.js — pengaturan & penjaga login bersama untuk semua halaman admin
   KDMP Kalurahan Kedungsari

   Kata sandi (admin utama atau agen) hanya diisi SEKALI, di dashboard.html. Tokennya disimpan di
   sessionStorage dan dipakai semua halaman.

   SESI OTOMATIS BERAKHIR (harus masuk lagi) bila:
   - tidak ada aktivitas (klik/ketik/geser) selama IDLE_MS (15 menit), atau
   - halaman ditutup lalu dibuka lagi setelah lebih dari GRACE_MS (2 menit).
     Ini menutup celah di HP/browser yang memulihkan tab lama: sesi lama
     tidak ikut terbuka. Tombol "Keluar" tetap langsung mengakhiri sesi.

   CARA MEMBUAT HALAMAN ADMIN BARU
   1. Di <head>/<body> halaman baru, muat file ini:
        <script src="admin.js"></script>
   2. Di script halaman:
        if (Admin.guard()) {            // false = sedang dialihkan ke dashboard
          Admin.get({action:'laporan'}).then(d => { ... });
          Admin.post({action:'setMedia', ...});
        }
   3. Tambahkan satu baris di daftar LINKS pada dashboard.html.
   Token otomatis ditambahkan ke setiap permintaan. Bila server menolak
   token, pengguna dialihkan kembali ke dashboard untuk login ulang.
   Catatan: gerbang ini hanya kenyamanan; keamanan sebenarnya ada di Apps Script
   yang memeriksa token pada setiap permintaan data.
   ===================================================================== */
(function () {
  'use strict';
  var API_URL = 'https://script.google.com/macros/s/AKfycbwDg1JKfCe3pd0-mwovmj5ozT3hpyDQCYCGpkJ2DkMq3yMJWpLDgtj-6hAO0966RUgU/exec';
  var KEY = 'kdmp_admin_token';
  var K_ACT = 'kdmp_admin_act';     // waktu aktivitas terakhir pengguna
  var K_BEAT = 'kdmp_admin_beat';   // waktu terakhir halaman admin masih terbuka
  var K_ROLE = 'kdmp_admin_role';   // peran hasil pemeriksaan server: admin utama / agen
  var K_EXP = 'kdmp_admin_exp';     // penanda: sesi baru saja berakhir (untuk pesan di dashboard)
  var IDLE_MS = 15 * 60 * 1000;     // tanpa aktivitas selama ini = keluar otomatis
  var GRACE_MS = 2 * 60 * 1000;     // halaman tertutup lebih lama dari ini = harus masuk lagi

  function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sput(k, v) { try { sessionStorage.setItem(k, String(v)); } catch (e) {} }
  function sdel(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  function num(k) { return Number(sget(k)) || 0; }

  function clear() { sdel(KEY); sdel(K_ACT); sdel(K_BEAT); sdel(K_ROLE); }
  function role() { try { return JSON.parse(sget(K_ROLE) || '{}') || {}; } catch (e) { return {}; } }
  function setRole(o) { sput(K_ROLE, JSON.stringify(o || {})); }
  function rawToken() { return sget(KEY) || ''; }
  function expire() {            // sesi habis: hapus token lalu kembali ke halaman masuk
    clear(); sput(K_EXP, '1');
    toDashboard(true);
  }
  function token() {
    var t = rawToken();
    if (t && Date.now() - num(K_ACT) > IDLE_MS) { expire(); return ''; }
    return t;
  }
  function setToken(t) {
    sput(KEY, t);
    var n = Date.now(); sput(K_ACT, n); sput(K_BEAT, n);
    startTracking();
  }
  function consumeExpired() { var v = sget(K_EXP) === '1'; sdel(K_EXP); return v; }

  /* ---- Pelacak aktivitas ---- */
  var tracking = false, lastTouch = 0;
  function touch() {
    var n = Date.now();
    if (n - lastTouch < 3000 || !rawToken()) return;
    lastTouch = n; sput(K_ACT, n); sput(K_BEAT, n);
  }
  function tick() {
    if (!rawToken()) return;
    var n = Date.now();
    if (n - num(K_ACT) > IDLE_MS) { expire(); return; }
    sput(K_BEAT, n);
  }
  function startTracking() {
    if (tracking) return;
    tracking = true;
    ['pointerdown', 'keydown', 'touchstart', 'mousemove'].forEach(function (ev) {
      document.addEventListener(ev, touch, { passive: true });
    });
    window.addEventListener('scroll', touch, { passive: true, capture: true });
    setInterval(tick, 15000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
    window.addEventListener('pagehide', function () { if (rawToken()) sput(K_BEAT, Date.now()); });
  }
  // Saat halaman dimuat: sesi lama yang sudah lewat batas tidak dipakai lagi
  (function init() {
    if (!rawToken()) return;
    var n = Date.now();
    if (n - num(K_ACT) > IDLE_MS || n - num(K_BEAT) > GRACE_MS) { clear(); sput(K_EXP, '1'); return; }
    sput(K_ACT, n); sput(K_BEAT, n);
    startTracking();
  })();

  function currentFile() {
    var f = (location.pathname.split('/').pop() || '');
    return /^[A-Za-z0-9_-]+\.html$/.test(f) ? f : '';
  }
  function toDashboard(withNext) {
    var f = withNext ? currentFile() : '';
    location.replace('dashboard.html' + (f && f !== 'dashboard.html' ? '?next=' + encodeURIComponent(f) : ''));
  }
  function guard() {
    if (token()) return true;
    toDashboard(true);
    return false;
  }
  function logout() { clear(); location.replace('dashboard.html'); }
  function simpanPeran(d) { setRole({ peran: d.peran, kode: d.kode, nama: d.nama, bolehHapus: d.bolehHapus, izin: d.izin || [] }); }
  // Peran DIPERIKSA ULANG ke server (bukan hanya percaya data di browser), jadi sesi yang diakali tetap terpental.
  // guardIzin('foto'|'data'|'pengaturan'|'pesanan'): owner selalu boleh; admin pembantu bila punya izin itu; agen hanya 'pesanan'.
  // guardOwner(): khusus admin utama.
  function guardIzin(izin) {
    if (!guard()) return false;
    var r = role();
    if (r.peran === 'agen' && izin !== 'pesanan') { location.replace('dashboard.html'); return false; }
    if (r.peran === 'admin' && izin && (r.izin || []).indexOf(izin) === -1) { location.replace('dashboard.html'); return false; }
    get({ action: 'cek' }, { stay: true }).then(function (d) {
      simpanPeran(d);
      var ok = d.peran === 'owner' || (d.peran === 'agen' && izin === 'pesanan') || (izin && (d.izin || []).indexOf(izin) !== -1);
      if (!ok) location.replace('dashboard.html');
    }).catch(function (e) { if (e && e.auth) toDashboard(true); });
    return true;
  }
  function guardOwner() {
    if (!guard()) return false;
    if (role().peran && role().peran !== 'owner') { location.replace('dashboard.html'); return false; }
    get({ action: 'cek' }, { stay: true }).then(function (d) {
      simpanPeran(d);
      if (d.peran !== 'owner') location.replace('dashboard.html');
    }).catch(function (e) { if (e && e.auth) toDashboard(true); });
    return true;
  }

  function isAuthFail(d) {
    return d && d.ok === false && (d.code === 'AUTH' || d.error === 'Kata sandi salah.');
  }
  function handle(d, opt) {
    if (isAuthFail(d)) {
      clear();
      if (!(opt && opt.stay)) toDashboard(true);
      var e = new Error(d.error || 'Kata sandi salah.'); e.auth = true; throw e;
    }
    if (d && d.ok === false && d.code === 'FORBID') {
      var f = new Error(d.error || 'Anda tidak punya akses ke fitur ini.'); f.forbid = true; throw f;
    }
    if (!d || (d.ok === undefined && !d.error)) {
      throw new Error('Respons server tidak dikenali. Pastikan Code.gs sudah di-deploy ulang (Manage deployments → New version).');
    }
    if (d.ok === false) throw new Error(d.error || 'Permintaan gagal.');
    return d;
  }
  function parse(r) {
    if (!r.ok) throw new Error('Server error (' + r.status + ')');
    return r.text().then(function (t) {
      try { return JSON.parse(t); } catch (e) { throw new Error('Respons server bukan JSON. Periksa URL Web App dan izin akses ("Anyone").'); }
    });
  }

  function get(params, opt) {
    var p = new URLSearchParams(params || {});
    p.set('token', token());
    return fetch(API_URL + '?' + p.toString()).then(parse).then(function (d) { return handle(d, opt); });
  }
  function post(body, opt) {
    var b = Object.assign({}, body || {}, { token: token() });
    return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(b) })
      .then(parse).then(function (d) { return handle(d, opt); });
  }

  window.Admin = { API_URL: API_URL, token: token, setToken: setToken, clear: clear, guard: guard, guardOwner: guardOwner, guardIzin: guardIzin, simpanPeran: simpanPeran, logout: logout, get: get, post: post, consumeExpired: consumeExpired, role: role, setRole: setRole };
})();
