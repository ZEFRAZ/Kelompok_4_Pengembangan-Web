// Elemen kampanye: hitung mundur, teks berjalan, dan banner promo.

import { $, el, tampilkanToast } from './util.js';

// Flash sale berakhir tengah malam nanti (waktu perangkat).
function akhirFlashSale() {
  const t = new Date();
  t.setHours(24, 0, 0, 0);
  return t.getTime();
}

const duaDigit = (n) => String(n).padStart(2, '0');

function pasangHitungMundur() {
  const akhir = akhirFlashSale();
  const awal = Date.now();
  const garis = $('#hm-garis');
  const jam = $('#hm-jam'), menit = $('#hm-menit'), detik = $('#hm-detik'), senti = $('#hm-senti');
  const totalDurasi = akhir - awal + 1;

  // requestAnimationFrame (~60 fps) sudah cukup mulus untuk mata manusia.
  // Menggantikan setInterval(10ms) yang memicu ~100 callback/detik + forced reflow.
  function perbarui() {
    const sisa = Math.max(akhir - Date.now(), 0);
    jam.textContent = duaDigit(Math.floor(sisa / 3600000));
    menit.textContent = duaDigit(Math.floor((sisa % 3600000) / 60000));
    detik.textContent = duaDigit(Math.floor((sisa % 60000) / 1000));
    senti.textContent = duaDigit(Math.floor((sisa % 1000) / 10));

    // Gunakan persentase agar tidak perlu membaca offsetWidth (forced reflow)
    garis.style.width = ((sisa / totalDurasi) * 100) + '%';

    if (sisa > 0) requestAnimationFrame(perbarui);
  }
  requestAnimationFrame(perbarui);
}

function pasangTeksBerjalan() {
  const teks = $('#berjalan-teks');
  // Cache dimensi sekali saja, bukan baca setiap 10ms (forced reflow)
  let lebarInduk = teks.parentElement.offsetWidth;
  let lebarTeks = teks.offsetWidth;
  let x = lebarInduk;

  // Perbarui cache saat resize
  window.addEventListener('resize', () => {
    lebarInduk = teks.parentElement.offsetWidth;
    lebarTeks = teks.offsetWidth;
  });

  // Gunakan CSS transform (compositor-friendly) via requestAnimationFrame
  let waktuSebelumnya = 0;
  function geser(timestamp) {
    // Geser ~1px per ~10ms = ~6px per frame @60fps
    const delta = waktuSebelumnya ? (timestamp - waktuSebelumnya) : 16;
    waktuSebelumnya = timestamp;
    x -= delta * 0.1; // kecepatan: 0.1 px/ms = ~6 px/frame
    if (x < -lebarTeks) x = lebarInduk;
    teks.style.transform = 'translateX(' + Math.round(x) + 'px)';
    requestAnimationFrame(geser);
  }
  requestAnimationFrame(geser);
}

async function pasangBannerPromo() {
  const respons = await fetch('/api/promo');
  const promo = await respons.json();

  const banner = el('section', 'promo-banner');
  const teks = el('div');
  teks.append(el('h2', '', promo.judul), el('p', '', promo.isi));
  const tombol = el('button', '', promo.tombol);
  tombol.type = 'button';
  tombol.addEventListener('click', () => {
    tampilkanToast('Syarat promo: berlaku 12 Desember, satu voucher per akun, tidak bisa digabung.');
    if (window.Lacak) window.Lacak.kirim('promo_click', { judul: promo.judul });
  });
  banner.append(teks, tombol);

  $('#utama').prepend(banner);
}

export function pasangPromo() {
  pasangHitungMundur();
  pasangTeksBerjalan();
  pasangBannerPromo();
}
