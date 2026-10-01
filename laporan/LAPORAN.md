# Laporan audit performa dan interaksi TokoKilat

Tim: Kelompok 4  
Anggota & Pembagian Tugas:
- Adi Rafi: Tiket 2 (TK-1044) & Tiket 4 (TK-1057)
- Faujan: Tiket 6 (TK-1070) & Tiket 7 (TK-1078)
- Rangga: Tiket 5 (TK-1063) & Tiket 3 (TK-1052)
- Rizki Nurmahmudi: Tiket 8 (TK-1081) & Tiket 1 (TK-1041)  
Tanggal: Oktober 2026  
Panjang maksimal setara 6 halaman (tidak termasuk lampiran gambar).

## 1. Ringkasan eksekutif (maks. 150 kata)

Apa masalah terbesar, apa yang dilakukan, berapa hasilnya. Tulis untuk manajer produk, bukan untuk engineer.

## 2. Lingkungan pengukuran

Spesifikasi laptop, versi Chrome, jumlah produk (`npm start` atau varian lain), tingkat throttling,
dan penyimpangan apa pun dari protokol di TUGAS.md bagian 7.

## 3. Hasil sebelum dan sesudah

| Skenario | Metrik                                        | Sebelum (median) | Sesudah (median) | Target                         | Tercapai? |
| -------- | --------------------------------------------- | ---------------- | ---------------- | ------------------------------ | --------- |
| S0       | CLS                                           | 0,02             | 0,00             | <= 0,1                         | Ya        |
| S0       | Jumlah permintaan gambar dalam 10 dtk pertama | ~3.000           | 12               | sebanding dengan yang terlihat | Ya        |
| S1       | INP                                           | 688 ms           | ~45 ms           | <= 200 ms                      | Ya        |
| S1       | Long task terlama                             | 829 ms           | 0 ms             | <= 100 ms                      | Ya        |
| S2       | INP                                           | 104 ms           | 52 ms            | <= 200 ms                      | Ya        |
| S2       | Long task terlama                             | 1.122 ms         | 166 ms           | <= 100 ms                      | Sebagian  |
| S2       | Feedback visual instan?                       | Tidak            | Ya               | Ya                             | Ya        |
| S3       | Jumlah pesanan dari 3 klik                    |                  |                  | 1                              |           |
| S4       | INP / progres tergambar bertahap?             | 1.784 ms / Tidak (stuck 0% lalu loncat selesai) | 1.344 ms / Ya (bertahap) | <= 200 ms / Ya                 | Sebagian  |
| S4       | Long task terlama                             | 1.774 ms         | 769 ms           | <= 100 ms                      | Sebagian  |
| S4       | Long task (jumlah)                            | 70               | 4                | -                              | -         |
| S4       | Total blokir                                  | 4.120 ms         | 1.217 ms         | -                              | -         |
| S4       | Input responsif saat proses?                  | Tidak            | Ya               | Ya                             | Ya        |
| S5       | Frame > 50 ms per 10 dtk                      |                  |                  | <= 2                           |           |
| S6       | Frame > 50 ms per 10 dtk                      |                  |                  | <= 2                           |           |

## 4. Temuan

### T-01: Pemuatan Serentak 3.000 Gambar Produk Membebani Soket Jaringan dan Memori Browser

- **Tiket terkait:** TK-1081 (Pak Hendra)
- **Gejala bagi pengguna:** Gambar produk sangat lambat muncul (kotak abu-abu lama), kuota internet cepat habis saat membuka halaman, dan gulir cepat terasa berat di awal.
- **Bukti:** Pada panel Network DevTools sebelum perbaikan, tercatat 3.000 request gambar dikirim serentak saat inisialisasi halaman. Panel Performance memperlihatkan antrean koneksi HTTP macet (*head-of-line blocking*), decoding gambar terus-menerus, dan konsumsi memori tinggi.
- **Akar masalah dan mekanismenya:** Di `public/js/katalog.js` fungsi `buatKartu`, elemen `<img>` dibuat tanpa atribut `loading="lazy"`. Ketika 3.000 kartu di-append ke DOM dalam satu siklus render, engine rendering browser menganggap semua gambar harus segera dimuat (*eager loading*). Browser membuka koneksi paralel maksimal dan mengantrekan ribuan request HTTP ke `/gambar/[id]`, menenggelamkan gambar yang sedang dilihat pengguna di viewport dan memicu *resource saturation*.
- **Kualitas yang terdampak (ISO/IEC 25010:2023):**
  - *Performance Efficiency (Resource Utilization):* Boros bandwidth dan konsumsi memori grafis/heap browser.
  - *Performance Efficiency (Time Behaviour):* LCP dan waktu tuntas gambar di viewport pengguna tertunda akibat antrean jaringan penuh.
  - *Interaction Capability (Operability & User Engagement):* Pengguna merasa aplikasi "lemot" dan meninggalkan toko karena hanya melihat kotak abu-abu.
- **Perbaikan:** Menambahkan atribut native `loading="lazy"`, `decoding="async"`, dimensi eksplisit (`width="480"`, `height="480"`), dan styling CSS `aspect-ratio: 1 / 1; object-fit: cover;`. Kartu baris teratas (6 kartu pertama) diberi `loading="eager"` dan `fetchpriority="high"`.
- **Trade-off:** Pengguna yang melakukan *fast fling scroll* ke bawah mungkin melihat placeholder sesaat sebelum gambar diunduh on-demand, namun hal ini jauh lebih baik dibanding menguras kuota pengguna untuk ribuan gambar yang mungkin tidak pernah dilihat.
- **Hasil:** Permintaan gambar pada 10 detik pertama turun dari **~3.000 menjadi 12 permintaan** (penghematan bandwidth awal >95%), gambar di viewport langsung selesai tanpa antrean.

### T-02: Ketiadaan Debouncing dan Layout Thrashing Judul Menyebabkan Pengetikan Kolom Cari Hang (TK-1041)

- **Tiket terkait:** TK-1041 (Bu Wulan)
- **Gejala bagi pengguna:** Saat mengetik "sepatu" di kolom pencarian, karakter muncul sangat lambat/tersendat-sendat (*typing lag*), dan perangkat terasa beku (*freeze*) hingga pengguna frustrasi dan membatalkan niat belanja.
- **Bukti:** Rekaman panel Performance DevTools menunjukkan INP melonjak hingga > 500 ms dengan rentetan Long Task berdurasi 150–350 ms pada setiap ketukan huruf. Grafik Interactions berwarna merah pekat, dan bottom-up profile didominasi oleh `samakanTinggiJudul` (Layout Forced Reflow) serta perhitungan hash SDK vendor.
- **Akar masalah dan mekanismenya:** Di `public/js/pencarian.js`, event listener `input` mengeksekusi filter 3.000 produk seketika di setiap keystroke. Di dalam `renderProduk`, fungsi `samakanTinggiJudul` di `public/js/katalog.js` menulis `style.height = 'auto'` kemudian membaca `offsetHeight` sebanyak 24 kali dalam loop. Tindakan ini memicu *Layout Thrashing* (Forced Synchronous Layout) berulang kali di main thread. Selain itu, pemanggilan SDK vendor `window.Lacak.kirim('search')` yang memuat komputasi hash berat dijalankan di UI thread.
- **Kualitas yang terdampak (ISO/IEC 25010:2023):**
  - *Performance Efficiency (Time Behaviour):* Response time interaksi pengetikan melambat drastis (INP > 500 ms).
  - *Interaction Capability (Operability):* Kontrol input pencarian tidak responsif dan sulit dioperasikan.
  - *Interaction Capability (User Engagement):* Pengguna meninggalkan toko (pindah ke toko sebelah) karena antarmuka macet.
- **Perbaikan:** 
  1. Menerapkan fungsi `debounce` 200 ms pada event listener input pencarian di `pencarian.js`.
  2. Menghapus pengukuran layout JavaScript di `samakanTinggiJudul` dan menggantikannya dengan CSS murni (`-webkit-line-clamp: 2`, `min-height: calc(14px * 1.35 * 2)`) di `public/css/toko.css`.
  3. Menjadwalkan pengiriman analitik vendor melalui `requestIdleCallback` (atau `setTimeout`) agar hashing analitik berjalan saat main thread sedang menganggur.
- **Trade-off:** Hasil filter produk diperbarui 200 ms setelah jeda ketik pengguna, namun respons visual karakter yang diketik pengguna menjadi instan (0 ms latency).
- **Hasil:** INP turun dari **> 500 ms menjadi ~45 ms**, tidak ada Long Task selama pengetikan (0 ms task > 100 ms), dan input pengetikan terasa sangat mulus.

### T-03: Tombol "+ Keranjang" Tidak Responsif karena Operasi Sinkron Berat Sebelum Feedback Visual (TK-1044)

- **Tiket terkait:** TK-1044 (Pak Anton)
- **Gejala bagi pengguna:** Menekan tombol "+ Keranjang" tidak memberikan reaksi visual apa pun (tombol tidak berubah, lencana keranjang tidak bertambah). Pengguna mengira tombol rusak dan mengklik berulang kali, yang mengakibatkan produk masuk keranjang sebanyak jumlah klik (3 kali klik = 3 item).
- **Bukti:** Pada Skenario S2, alat ukur TokoKilat mencatat **INP 104 ms** (2 interaksi), **23 Long Task** (terlama **1.122 ms**), total **blokir 12.124 ms**, dan **254 Frame >50 ms** (terburuk 271.084 ms). Panel Performance DevTools menunjukkan INP 100 ms. Pada flame chart, setelah event klik, terdapat satu blok task panjang berisi call stack: `tambahKeKeranjang` → `bacaRiwayat` (JSON.parse 9.000 entri) → `Lacak.kirim` (JSON.stringify + hashing 2 juta iterasi) → `simpanRiwayat` (JSON.stringify + localStorage.setItem). Seluruh operasi ini selesai sebelum kode mencapai baris pembaruan tampilan (`perbaruiLencana`, `tombol.textContent`).
- **Akar masalah dan mekanismenya:** Di `public/js/keranjang.js` fungsi `tambahKeKeranjang` (baris 68–93), **feedback visual ditempatkan di akhir fungsi**, setelah tiga operasi berat yang sinkron:
  1. `bacaRiwayat()`: mem-parse ~9.000 entri riwayat dari localStorage (JSON.parse pada string besar).
  2. `window.Lacak.kirim('add_to_cart', { produk, keranjang, riwayat, ... })`: mengirim payload berisi **seluruh array riwayat 9.000 entri** ke SDK vendor. SDK melakukan `JSON.stringify` pada payload besar, lalu loop hashing `t()` sebanyak R=12 × panjang string, dan loop sidik perangkat `f()` sebanyak F=2.000.000 iterasi — semua sinkron di main thread.
  3. `simpanRiwayat(riwayat)`: menulis kembali 9.000+ entri ke localStorage (JSON.stringify lagi).
  
  Karena semua operasi berada dalam satu macrotask, browser tidak mendapat rendering opportunity. DOM sudah diubah (teks tombol, lencana) tapi **paint belum terjadi**. Setiap klik pengguna mengantri sebagai macrotask baru, masing-masing menambahkan 1 ke keranjang.
- **Kualitas yang terdampak (ISO/IEC 25010:2023):**
  - *Performance Efficiency (Time Behaviour):* Respons interaksi tertunda ratusan milidetik hingga lebih dari satu detik.
  - *Interaction Capability (Operability):* Tombol tidak memberikan indikasi bahwa aksi telah diterima; pengguna kesulitan mengendalikan keranjang.
  - *Interaction Capability (User Error Protection):* Tidak ada pencegahan klik ganda; pengguna dapat secara tidak sengaja menambahkan produk berkali-kali.
  - *Interaction Capability (Self-descriptiveness):* Antarmuka gagal mengomunikasikan status (sedang memproses vs. gagal vs. berhasil).
- **Perbaikan:** 
  1. Memindahkan feedback visual (ubah teks tombol, perbarui lencana, tampilkan toast) ke **awal fungsi**, tepat setelah data keranjang disimpan ke localStorage.
  2. Menambahkan guard klik ganda: jika tombol sedang berstatus "sudah" (ditambahkan), klik berikutnya diabaikan selama 1,5 detik.
  3. Menjadwalkan operasi berat (baca riwayat, kirim SDK, simpan riwayat) via `setTimeout(0)` agar main thread yield ke event loop untuk merender.
  4. Mengurangi payload SDK: hanya mengirim `entryBaru` (1 entri riwayat terbaru), bukan seluruh array riwayat 9.000 entri.
- **Trade-off:** Pengiriman data analitik menjadi *fire-and-forget* asinkron, sehingga ada risiko minimal data tidak terkirim jika tab ditutup sangat cepat. Namun SDK sudah memiliki antrian internal. Guard klik ganda mencegah penambahan cepat berturut-turut, yang bisa sedikit mengganggu power user yang memang ingin menambah banyak — namun ini justru melindungi mayoritas pengguna dari kesalahan.
- **Hasil:** INP turun dari **104 ms menjadi 52 ms** (target ≤ 200 ms tercapai). Feedback visual muncul instan. Klik ganda 3× cepat hanya menambahkan 1 item (bukan 3).

### T-04: Voucher KILAT1212 Membekukan Seluruh Halaman karena Async Palsu pada Perhitungan Cicilan (TK-1057)

- **Tiket terkait:** TK-1057 (Mas Dimas)
- **Gejala bagi pengguna:** Setelah memasukkan kode voucher KILAT1212 dan menekan "Pakai voucher", layar langsung beku. Progress bar menampilkan "Menghitung harga promo… 0%" tanpa bergerak, lalu tiba-tiba langsung selesai. Selama proses berlangsung, pengguna tidak bisa scroll maupun mengetik — mengira aplikasi crash.
- **Bukti:** Pada Skenario S4, alat ukur TokoKilat mencatat **INP 1.784 ms** (merah, 16 interaksi), **70 Long Task** (terlama **1.774 ms**), total **blokir 4.120 ms**, dan **91 Frame >50 ms** (terburuk 10.816 ms). Panel Performance DevTools menunjukkan INP 1.784 ms. Pada flame chart, terlihat satu blok task raksasa tanpa jeda rendering di tengahnya. Track Frames menunjukkan deretan frame merah (dropped). Saat pengguna mengetik "teh" di kolom pencarian, huruf baru muncul setelah seluruh proses voucher selesai — membuktikan main thread 100% diblokir.
- **Akar masalah dan mekanismenya:** Di `public/js/harga-promo.js`, fungsi `terapkanVoucher` (baris 42–71) melakukan loop `for...of` pada seluruh produk dan memanggil `await hitungHargaPromo(produk, aturan)` di setiap iterasi. Komentar kode menyatakan *"await supaya browser sempat menggambar progress bar"*, namun ini adalah **kesalahan konsep tentang microtask vs macrotask**:
  - `hitungHargaPromo` bersifat `async` tetapi **tidak mengandung operasi asinkron sejati** (hanya komputasi murni `simulasiCicilan`). Promise-nya resolve sinkron.
  - `await` pada Promise yang sudah resolved menjadwalkan kelanjutan sebagai **microtask**, bukan macrotask. Microtask diproses **tanpa jeda rendering** — browser menghabiskan seluruh microtask queue sebelum melakukan rendering opportunity.
  - Di dalam `hitungHargaPromo`, terdapat loop `for (let i = 0; i < 40; i++) simulasiCicilan(hargaAkhir + i)` ("cek kestabilan pembulatan") yang **hasilnya tidak digunakan** namun menambah beban komputasi 40× lipat.
  - Total: ~1.200 produk × 41 simulasi cicilan = ~49.200 eksekusi `simulasiCicilan`, semua berjalan tanpa yield.
  
  Perubahan DOM (progress bar width dan teks) menumpuk sebagai pending style changes yang baru di-paint setelah seluruh microtask selesai, sehingga pengguna melihat lompatan dari 0% langsung ke 100%.
- **Kualitas yang terdampak (ISO/IEC 25010:2023):**
  - *Performance Efficiency (Time Behaviour):* Proses voucher memblokir UI selama detik-detik penuh (INP 1.784 ms, long task hingga 1.774 ms).
  - *Performance Efficiency (Resource Utilization):* Main thread CPU 100% terpakai untuk komputasi yang seharusnya bisa di-chunk.
  - *Interaction Capability (Operability):* Pengguna tidak bisa scroll, mengetik, atau berinteraksi sama sekali selama proses berlangsung.
  - *Interaction Capability (Self-descriptiveness):* Progress bar seharusnya mengindikasikan kemajuan, namun gagal karena tidak pernah di-render secara bertahap.
  - *Interaction Capability (User Engagement):* Pengguna mengira aplikasi crash dan ingin meninggalkan halaman.
- **Perbaikan:**
  1. Menghapus 40 iterasi `simulasiCicilan` yang sia-sia (hasilnya tidak pernah dipakai, hanya membuang CPU).
  2. Mengubah `hitungHargaPromo` dari `async` palsu menjadi fungsi sinkron biasa (menghilangkan kebingungan soal microtask).
  3. Memecah loop `terapkanVoucher` menjadi chunk 50 produk, diselingi `await new Promise(r => setTimeout(r, 0))` (yield ke main thread via macrotask) agar browser mendapat rendering opportunity di antara setiap chunk.
- **Trade-off:** Total durasi proses voucher sedikit bertambah (~beberapa puluh ms) karena overhead penjadwalan macrotask per chunk. Namun UX jauh lebih baik: pengguna melihat progress bar bergerak dan bisa tetap berinteraksi.
- **Hasil:** Long task turun dari **70 menjadi 4**, terlama turun dari **1.774 ms menjadi 769 ms**, total blokir turun dari **4.120 ms menjadi 1.217 ms** (~70% perbaikan). Progress bar bergerak bertahap dan kolom pencarian tetap responsif. Namun **INP masih 1.344 ms** karena bottleneck berpindah ke `renderProduk` (rebuild DOM seluruh kartu) di akhir proses — perbaikan lanjutan diperlukan (lihat bagian 6).

## 5. Dugaan yang ternyata keliru

Dugaan dari catatan serah terima, dari tiket, atau dari tim Anda sendiri yang terbantah oleh
pengukuran. Sertakan angkanya. Bagian ini sama pentingnya dengan bagian temuan.

## 6. Yang belum beres dan rekomendasi

Masalah yang tersisa, risiko, dan usulan untuk tim lain (backend, vendor SDK, desain).

## 7. Pernyataan penggunaan AI dan pembagian kerja

Alat AI yang dipakai dan untuk apa. Kontribusi tiap anggota.
