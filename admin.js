/* =====================================================================
   admin.js — pengaturan & penjaga login bersama untuk semua halaman admin
   KDMP Kalurahan Kedungsari

   Kata sandi hanya diisi SEKALI, di dashboard.html. Tokennya disimpan di
   sessionStorage (hilang saat tab/browser ditutup) dan dipakai semua halaman.

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
  var API_URL = 'https://script.google.com/macros/s/AKfycby8mQZ4nSbXJs-fRvZebgIjQT_LH74CCGQduI1ESOPrT7oKJlZ2Pz3fBJ-v1HIpNWyj/exec';
  var KEY = 'kdmp_admin_token';

  function token() { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { sessionStorage.setItem(KEY, t); } catch (e) {} }
  function clear() { try { sessionStorage.removeItem(KEY); } catch (e) {} }

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

  function isAuthFail(d) {
    return d && d.ok === false && (d.code === 'AUTH' || d.error === 'Kata sandi salah.');
  }
  function handle(d, opt) {
    if (isAuthFail(d)) {
      clear();
      if (!(opt && opt.stay)) toDashboard(true);
      var e = new Error(d.error || 'Kata sandi salah.'); e.auth = true; throw e;
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

  window.Admin = { API_URL: API_URL, token: token, setToken: setToken, clear: clear, guard: guard, logout: logout, get: get, post: post };
})();
