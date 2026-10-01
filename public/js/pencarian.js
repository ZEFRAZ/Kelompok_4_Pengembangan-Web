// Pencarian, saringan kategori, dan pengurutan.

import { $, el, hargaSetelahDiskon, debounce } from './util.js';
import { keadaan, renderProduk } from './katalog.js';

const saringan = { kata: '', kategori: 'Semua', urut: 'relevan' };

// "Sepatu Lari" == "sepatu  lari" == "SEPATU-LARI"
function normalkan(teks) {
  return teks
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function ambilTeksCari(produk) {
  if (!produk._teksCari) {
    produk._teksCari = normalkan(produk.nama + ' ' + produk.merek + ' ' + produk.kategori + ' ' + produk.kota);
  }
  return produk._teksCari;
}

function cocok(produk, bagianKunci) {
  const teks = ambilTeksCari(produk);
  return bagianKunci.every((k) => teks.includes(k));
}

const PEMBANDING = {
  murah: (a, b) => hargaSetelahDiskon(a) - hargaSetelahDiskon(b),
  mahal: (a, b) => hargaSetelahDiskon(b) - hargaSetelahDiskon(a),
  laris: (a, b) => b.terjual - a.terjual,
  rating: (a, b) => b.rating - a.rating || b.terjual - a.terjual,
};

export function terapkanSaringan() {
  const kunci = normalkan(saringan.kata);
  const bagianKunci = kunci ? kunci.split(' ').filter(Boolean) : [];
  let hasil = keadaan.semuaProduk.filter((p) => {
    if (saringan.kategori !== 'Semua' && p.kategori !== saringan.kategori) return false;
    if (bagianKunci.length && !cocok(p, bagianKunci)) return false;
    return true;
  });
  if (PEMBANDING[saringan.urut]) hasil = hasil.slice().sort(PEMBANDING[saringan.urut]);
  renderProduk(hasil);

  if (window.Lacak && kunci) {
    const kirimLacak = () => window.Lacak.kirim('search', { kata: saringan.kata, jumlah: hasil.length });
    if ('requestIdleCallback' in window) requestIdleCallback(kirimLacak);
    else setTimeout(kirimLacak, 100);
  }
}

export function pasangPencarian() {
  const kolom = $('#kolom-cari');
  const terapkanSaringanDebounced = debounce(() => {
    terapkanSaringan();
  }, 200);

  kolom.addEventListener('input', () => {
    saringan.kata = kolom.value;
    terapkanSaringanDebounced();
  });

  $('#pilih-urut').addEventListener('change', (e) => {
    saringan.urut = e.target.value;
    terapkanSaringan();
  });

  const wadah = $('#keping-kategori');
  const kategori = ['Semua', ...new Set(keadaan.semuaProduk.map((p) => p.kategori))];
  for (const nama of kategori) {
    const keping = el('button', 'keping', nama);
    keping.type = 'button';
    keping.setAttribute('aria-pressed', String(nama === 'Semua'));
    keping.addEventListener('click', () => {
      saringan.kategori = nama;
      wadah.querySelectorAll('.keping').forEach((k) => k.setAttribute('aria-pressed', String(k === keping)));
      terapkanSaringan();
    });
    wadah.append(keping);
  }
}
