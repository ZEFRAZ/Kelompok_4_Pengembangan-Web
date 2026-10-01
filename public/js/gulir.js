// Perilaku saat halaman digulir: bayangan header, bar progres baca,
// tombol "Ke atas", efek kartu muncul, dan pencatatan impresi produk.

import { $ } from './util.js';

const sudahTercatat = new Set();

// --- IntersectionObserver untuk deteksi kartu masuk viewport ---
// Menggantikan querySelectorAll + getBoundingClientRect di setiap scroll event (Layout Thrashing).
// Observer berjalan di thread terpisah dari main thread, jauh lebih efisien.
const observerKartu = new IntersectionObserver((entries) => {
  const impresiBaru = [];
  for (const entry of entries) {
    const kartu = entry.target;
    if (entry.isIntersecting) {
      if (!kartu.classList.contains('terlihat')) {
        kartu.classList.add('terlihat');
        // minHeight cukup ditetapkan SEKALI saat kartu pertama kali terlihat,
        // bukan di setiap scroll event seperti sebelumnya.
        kartu.style.minHeight = Math.round(entry.boundingClientRect.height) + 'px';
      }
      if (!sudahTercatat.has(kartu.dataset.id)) {
        sudahTercatat.add(kartu.dataset.id);
        impresiBaru.push(kartu.dataset.id);
      }
    }
  }
  if (impresiBaru.length && window.Lacak) {
    window.Lacak.kirim('impression', { produk: impresiBaru });
  }
}, { rootMargin: '80px 0px' }); // margin 80px sesuai threshold sebelumnya

// Fungsi untuk mengobservasi kartu yang baru di-render
export function observasiKartu(kartu) {
  observerKartu.observe(kartu);
}

// --- Scroll handler ringan: hanya header, progress bar, dan tombol "Ke atas" ---
// Tidak lagi melakukan querySelectorAll/getBoundingClientRect pada 1.200 kartu.
function periksaGulirRingan() {
  const y = window.scrollY;
  $('#kepala').classList.toggle('melayang', y > 8);
  $('#ke-atas').hidden = y < 900;

  const tinggiDokumen = document.documentElement.scrollHeight - window.innerHeight;
  $('#bar-gulir').style.width = (tinggiDokumen > 0 ? (y / tinggiDokumen) * 100 : 0) + '%';
}

// --- Throttle scroll handler dengan rAF ---
// Memastikan periksaGulirRingan hanya berjalan 1× per frame (~60 fps),
// bukan di setiap scroll event (bisa 120+ per detik).
let rAFTerjadwal = false;
function padaScroll() {
  if (!rAFTerjadwal) {
    rAFTerjadwal = true;
    requestAnimationFrame(() => {
      periksaGulirRingan();
      rAFTerjadwal = false;
    });
  }
}

export function pasangGulir() {
  // Semua event listener menggunakan { passive: true } agar compositor bebas
  // menggulir tanpa menunggu JavaScript selesai.
  window.addEventListener('scroll', padaScroll, { passive: true });
  window.addEventListener('resize', padaScroll, { passive: true });

  // Cegah "pull to refresh" tak sengaja di Android ketika pengguna sedang di puncak halaman.
  let yAwal = 0;
  const utama = $('#utama');
  utama.addEventListener('touchstart', (e) => { yAwal = e.touches[0].clientY; }, { passive: true });
  utama.addEventListener('touchmove', (e) => {
    const menarikKeBawah = e.touches[0].clientY > yAwal;
    // Catatan: e.preventDefault() untuk cegah pull-to-refresh tidak bisa dipanggil
    // dengan passive: true. Kita gunakan CSS overscroll-behavior: none sebagai gantinya.
    padaScroll();
  }, { passive: true });

  // wheel event: passive: true agar scroll tidak terblokir oleh JavaScript
  utama.addEventListener('wheel', padaScroll, { passive: true });

  $('#ke-atas').addEventListener('click', () => window.scrollTo({ top: 0 }));
}
