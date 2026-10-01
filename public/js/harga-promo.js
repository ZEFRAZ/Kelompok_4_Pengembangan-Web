// Voucher: menghitung harga promo untuk setiap produk.
// Aturan promo bertingkat + simulasi cicilan ditentukan tim bisnis.

import { $, hargaSetelahDiskon, tampilkanToast } from './util.js';
import { keadaan, perbaruiHargaVoucherDiKartu } from './katalog.js';

const VOUCHER = {
  KILAT1212: { persen: 12, maksPotongan: 120000, minBelanja: 50000 },
  HEMAT50: { persen: 5, maksPotongan: 50000, minBelanja: 0 },
};

// Cicilan 0% sampai 24 bulan: cari tenor dengan angsuran paling ringan yang
// masih memenuhi batas minimal angsuran per bulan dari mitra pembiayaan.
function simulasiCicilan(harga) {
  let terbaik = { tenor: 1, angsuran: harga };
  for (let tenor = 1; tenor <= 24; tenor++) {
    let sisa = harga;
    let angsuran = Math.ceil(harga / tenor / 100) * 100;
    for (let bulan = 1; bulan <= tenor; bulan++) {
      const biayaAdmin = Math.round(sisa * 0.0005 * Math.log2(bulan + 1));
      sisa = sisa - angsuran + biayaAdmin;
      if (sisa < 0) sisa = 0;
    }
    angsuran += Math.ceil(sisa / tenor);
    if (angsuran >= 25000 && angsuran < terbaik.angsuran) terbaik = { tenor, angsuran };
  }
  return terbaik;
}

// Menghitung harga promo untuk satu produk (sinkron murni, tidak perlu async palsu).
function hitungHargaPromo(produk, aturan) {
  const dasar = hargaSetelahDiskon(produk);
  if (dasar < aturan.minBelanja) return null;
  let potongan = Math.min(Math.round((dasar * aturan.persen) / 100), aturan.maksPotongan);
  if (produk.flashSale) potongan = Math.round(potongan / 2); // flash sale hanya dapat setengah
  let hargaAkhir = Math.max(dasar - potongan, 100);
  // Loop 40x "cek kestabilan pembulatan" dihapus — hasilnya tidak pernah digunakan,
  // hanya membuang ~40x CPU per produk tanpa manfaat.
  const cicilan = simulasiCicilan(hargaAkhir);
  return { hargaAkhir, cicilan };
}

// Fungsi bantu: yield ke main thread agar browser bisa merender dan memproses input.
// setTimeout(0) menjadwalkan kelanjutan sebagai macrotask, bukan microtask.
function yieldKeMainThread() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function terapkanVoucher(kode) {
  const aturan = VOUCHER[kode];
  if (!aturan) {
    tampilkanToast('Kode voucher "' + kode + '" tidak dikenal. Coba KILAT1212.');
    return;
  }

  const progres = $('#progres');
  const isi = $('#progres-isi');
  const teks = $('#progres-teks');
  progres.hidden = false;
  isi.style.width = '0%';

  const total = keadaan.semuaProduk.length;
  let selesai = 0;
  keadaan.hargaVoucher.clear();

  const UKURAN_CHUNK = 50; // proses 50 produk per chunk, lalu yield

  for (let i = 0; i < total; i++) {
    const produk = keadaan.semuaProduk[i];
    const hasil = hitungHargaPromo(produk, aturan);
    if (hasil) keadaan.hargaVoucher.set(produk.id, hasil.hargaAkhir);
    selesai++;

    // Setiap UKURAN_CHUNK produk, yield ke main thread agar browser bisa:
    // 1. Merender ulang progress bar (paint)
    // 2. Memproses event input pengguna (scroll, ketik)
    if (selesai % UKURAN_CHUNK === 0 || selesai === total) {
      const persen = Math.round((selesai / total) * 100);
      isi.style.width = persen + '%';
      teks.textContent = 'Menghitung harga promo… ' + persen + '% (' + selesai + ' dari ' + total + ' produk)';
      if (selesai < total) await yieldKeMainThread();
    }
  }

  perbaruiHargaVoucherDiKartu();
  progres.hidden = true;
  tampilkanToast('Voucher ' + kode + ' dipakai di ' + keadaan.hargaVoucher.size.toLocaleString('id-ID') + ' produk.');
  if (window.Lacak) window.Lacak.kirim('apply_voucher', { kode, jumlah: keadaan.hargaVoucher.size });
}

export function pasangVoucher() {
  const kolom = $('#kolom-voucher');
  $('#tombol-voucher').addEventListener('click', () => terapkanVoucher(kolom.value.trim().toUpperCase()));
  kolom.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') terapkanVoucher(kolom.value.trim().toUpperCase());
  });
}
