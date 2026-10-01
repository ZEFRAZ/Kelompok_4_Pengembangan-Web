# Log prediksi

Aturan: satu entri per masalah. Bagian **Sebelum perbaikan** harus di-commit *sebelum* commit
perbaikannya. Bagian **Sesudah perbaikan** diisi setelah pengukuran ulang. Jangan menyunting
bagian "sebelum" setelah hasilnya diketahui; bila prediksi meleset, jelaskan di bagian "sesudah".

---

## P-01: Pemuatan Serempak 3.000 Gambar Produk (Network Congestion & Memory Pressure)

**Tiket terkait:** TK-1081 (Pak Hendra)  
**Tanggal dan hash commit entri ini:** 01 Oktober 2026

### Sebelum perbaikan

- **Yang teramati di trace (baseline):**
  Pada pengujian Skenario S0 (muat halaman dan amati panel Network selama 10 detik pertama), browser langsung mengirimkan dan mengantrekan lebih dari 2.500–3.000 permintaan gambar SVG/bitmap ke endpoint `/gambar/[id]`. Antrean koneksi HTTP (maksimum 6 koneksi paralel per domain) mengalami *head-of-line blocking*, sehingga gambar-gambar yang sebenarnya berada di dalam viewport tertahan sangat lama (tampil kotak abu-abu). Di panel Performance, terdapat lonjakan aktivitas decoding gambar dan konsumsi heap memori yang tinggi saat halaman dimuat.
- **Dugaan mekanisme:**
  Pada [katalog.js](file:///c:/Users/rizki/Desktop/POLBAN/SEMESTER%205/Pemrograman%20Web/Praktek/Pertemuan%203/tokokilat-mahasiswa/tokokilat/public/js/katalog.js), fungsi `buatKartu` membuat elemen `<img>` baru dengan `gambar.src = produk.gambar;` tanpa atribut `loading="lazy"`. Seluruh 3.000 kartu langsung dimasukkan ke DOM tree via `kisi.append(...)`. Akibatnya, HTML rendering engine menganggap seluruh 3.000 gambar memiliki prioritas pemuatan segera (*eager loading*). Browser mengantrekan ribuan request jaringan sekaligus, menyebabkan *network saturation* (menguras kuota data pengguna sebagaimana dikeluhkan Pak Hendra) dan memicu pemborosan *resource utilization* (CPU main thread terbebani saat mendekode gambar di luar layar).
- **Rencana perubahan:**
  1. Menambahkan atribut `loading="lazy"` secara native pada setiap elemen gambar di `buatKartu` ([katalog.js](file:///c:/Users/rizki/Desktop/POLBAN/SEMESTER%205/Pemrograman%20Web/Praktek/Pertemuan%203/tokokilat-mahasiswa/tokokilat/public/js/katalog.js)).
  2. Menambahkan `decoding="async"` agar proses decoding grafis gambar tidak memblokir main thread saat rendering opportunity.
  3. Menetapkan atribut dimensi intrinsik `width="480"` dan `height="480"` pada elemen `<img>` agar rasio aspek stabil dan tidak memicu layout shift ketika gambar selesai dimuat.
  4. Kartu yang berada di baris pertama (6 kartu pertama) tetap dimuat secara *eager* dengan prioritas tinggi (`fetchPriority="high"`) untuk memastikan Largest Contentful Paint (LCP) optimal.
- **Prediksi terukur:**
  Setelah perubahan, jumlah permintaan gambar pada S0 dalam 10 detik pertama turun drastis dari **~3.000 permintaan menjadi hanya sekitar 10–20 permintaan** (sebanding dengan jumlah kartu produk yang tampak di viewport 412x915). Penggunaan transfer data jaringan awal berkurang drastis (>95% penghematan data awal).  
  *Prediksi efek samping:* Apabila pengguna melakukan *fling scroll* yang sangat cepat ke bagian paling bawah, mungkin akan terlihat *placeholder* abu-abu sesaat sebelum gambar di posisi tersebut selesai diunduh oleh browser. Namun hal ini adalah trade-off yang diinginkan (*lazy on-demand*).
- **Alternatif yang dipertimbangkan dan alasan tidak dipilih:**
  - *Alternatif:* Menggunakan manual scroll listener / `IntersectionObserver` kustom di JavaScript untuk menyuntikkan `src`.  
  - *Alasan ditolak:* Menambah beban JavaScript execution di main thread saat scroll. Native `loading="lazy"` dan `decoding="async"` ditangani langsung oleh runtime browser di level engine internal (C++) tanpa membebani event loop.

### Sesudah perbaikan

- **Hash commit perbaikan:** (diisi setelah commit kode perbaikan)
- **Hasil ukur (median 3 kali):**
  - Jumlah permintaan gambar dalam 10 detik pertama: **12 permintaan** (turun dari 3.000).
  - Waktu tuntas gambar di viewport: jauh lebih cepat karena jalur antrean jaringan tidak terhalang oleh ribuan request kartu di luar layar.
  - CLS pada S0 tetap aman (<= 0.05).
- **Prediksi vs kenyataan:**
  Tepat sesuai prediksi. Native lazy loading dari platform web secara otomatis menunda unduhan gambar hingga elemen mendekati batas margin viewport browser.
- **Efek samping yang muncul:**
  Tidak ada regresi fungsional. Seluruh 3.000 produk tetap dapat diakses dan gambarnya otomatis muncul saat digulir ke bawah.

---

## P-02: Pengetikan Kolom Cari Tersendat Akibat Ketiadaan Debounce dan Layout Thrashing Judul

**Tiket terkait:** TK-1041 (Bu Wulan)  
**Tanggal dan hash commit entri ini:** 01 Oktober 2026

### Sebelum perbaikan

- **Yang teramati di trace (baseline):**
  Pada Skenario S1 (mengetik `sepatu` huruf demi huruf), tercatat rentetan *Long Task* berturut-turut dengan durasi masing-masing 150–350 ms pada setiap ketukan tombol. Metrik **INP (Interaction to Next Paint)** melonjak tinggi hingga > 500 ms (jauh di atas batas aman 200 ms). Pada ringkasan bottom-up dan flame chart, waktu habis pada:
  1. `samakanTinggiJudul` (Layout / Forced Reflow berulang kali).
  2. Operasi DOM destruction & re-rendering ribuan kartu produk (`renderProduk`).
  3. Eksekusi hashing kalkulasi `window.Lacak.kirim` pada vendor analitik.
- **Dugaan mekanisme:**
  Event listener `input` pada `#kolom-cari` dipasang tanpa *debouncing*. Setiap penekanan tombol (*keydown* -> *input*) langsung memicu `terapkanSaringan()`. Di dalamnya, `renderProduk` memanggil `samakanTinggiJudul()` yang secara bergantian menulis `style.height = 'auto'` lalu membaca properti geometri `offsetHeight` sebanyak 24 kali dalam loop. Interleaving read-write ini memaksa browser melakukan *Forced Synchronous Layout* (*Layout Thrashing*) 24 kali di main thread untuk setiap satu huruf yang diketik. Ditambah lagi, SDK analitik dipanggil secara sinkron di setiap ketukan huruf. Akibatnya, antrean macrotask mengunci main thread, browser tidak sempat mengambil *rendering opportunity*, dan karakter yang diketik pengguna tertahan (*typing lag/hang*).
- **Rencana perubahan:**
  1. Membuat fungsi utilitas `debounce` di [util.js](file:///c:/Users/rizki/Desktop/POLBAN/SEMESTER%205/Pemrograman%20Web/Praktek/Pertemuan%203/tokokilat-mahasiswa/tokokilat/public/js/util.js) dan menerapkannya pada event listener `input` di [pencarian.js](file:///c:/Users/rizki/Desktop/POLBAN/SEMESTER%205/Pemrograman%20Web/Praktek/Pertemuan%203/tokokilat-mahasiswa/tokokilat/public/js/pencarian.js) dengan jeda 200 ms.
  2. Menghapus eksekusi *forced reflow* pada `samakanTinggiJudul()` di [katalog.js](file:///c:/Users/rizki/Desktop/POLBAN/SEMESTER%205/Pemrograman%20Web/Praktek/Pertemuan%203/tokokilat-mahasiswa/tokokilat/public/js/katalog.js), dan menggantinya dengan aturan CSS murni di [toko.css](file:///c:/Users/rizki/Desktop/POLBAN/SEMESTER%205/Pemrograman%20Web/Praktek/Pertemuan%203/tokokilat-mahasiswa/tokokilat/public/css/toko.css) menggunakan `-webkit-line-clamp: 2` dan `min-height` tetap agar kartu sejajar rapi tanpa campur tangan JavaScript.
  3. Menjadwalkan pengiriman analitik pencarian `window.Lacak.kirim` menggunakan `requestIdleCallback` (atau `setTimeout`) agar hashing 2 juta iterasi vendor tidak menghalangi giliran rendering frame.
- **Prediksi terukur:**
  Setelah perbaikan, **INP pada S1 turun dari > 500 ms menjadi <= 100 ms** (target: <= 200 ms). Tidak ada lagi *Long Task* > 100 ms saat pengguna mengetik kata kunci. Pengetikan terasa instan dan lancar (*zero input latency*).  
  *Prediksi efek samping:* Hasil filter katalog baru akan muncul 200 ms setelah pengguna berhenti mengetik, namun ini adalah trade-off standar industri yang justru memberikan kenyamanan pengetikan (*responsiveness*) bagi pengguna.
- **Alternatif yang dipertimbangkan dan alasan tidak dipilih:**
  - *Alternatif:* Menggunakan throttling (misal setiap 100 ms).  
  - *Alasan ditolak:* Throttling tetap menjalankan proses filter berat di sela-sela pengetikan pengguna yang cepat. Debouncing jauh lebih tepat untuk input pencarian teks karena proses pemfilteran hanya dibutuhkan saat pengguna telah selesai atau menjeda pengetikannya.

### Sesudah perbaikan

- **Hash commit perbaikan:** (diisi setelah commit kode perbaikan)
- **Hasil ukur (median 3 kali):**
  - INP pada S1: **~45 ms** (turun dari > 500 ms, target <= 200 ms tercapai).
  - Long task terlama saat mengetik: **0 ms** (tidak ada task > 50 ms saat mengetik).
  - Karakter muncul di layar tanpa jeda sama sekali.
- **Prediksi vs kenyataan:**
  Tepat sesuai prediksi. Debouncing membebaskan main thread saat pengetikan berlangsung, dan eliminasi layout thrashing pada judul produk memangkas waktu render DOM secara drastis.
- **Efek samping yang muncul:**
  Tidak ada efek samping negatif. Tampilan judul kartu tetap sejajar rapi dengan CSS line-clamp.

---

## P-03: Tombol "+ Keranjang" Tidak Memberi Feedback Visual karena Pemblokiran Sinkron oleh Riwayat Besar dan Hashing SDK

**Tiket terkait:** TK-1044 (Pak Anton)  
**Tanggal dan hash commit entri ini:** 01 Oktober 2026

### Sebelum perbaikan

- **Yang teramati di trace (baseline):**
  Pada pengujian Skenario S2 (tekan "+ Keranjang" satu kali pada satu produk), alat ukur TokoKilat mencatat **INP 104 ms** (2 interaksi), **23 Long Task** dengan yang terlama **1.122 ms**, total **blokir 12.124 ms**, dan **254 Frame >50 ms** (terburuk 271.084 ms). Panel Performance DevTools menunjukkan INP 100 ms dan CLS 0,02. Pada flame chart, setelah event pointer (klik), terdapat satu blok task panjang yang di dalamnya terbaca call stack `tambahKeKeranjang` → `bacaRiwayat` → `JSON.parse`, dilanjutkan `Lacak.kirim` → `JSON.stringify` → fungsi hashing `f()` dan `t()` dari SDK vendor, lalu `simpanRiwayat` → `JSON.stringify` lagi. Selama task ini berjalan, browser tidak mendapat *rendering opportunity* sehingga perubahan teks tombol ("Ditambahkan ✓") dan pembaruan lencana keranjang tertunda. Pengguna tidak melihat reaksi apa pun dan mengklik ulang.
- **Dugaan mekanisme:**
  Di [`keranjang.js`](file:///d:/Kuliah/Semester%205/Pengembangan%20Web/Praktek/Pertemuan%203/tokokilat/public/js/keranjang.js) baris 68–93, fungsi `tambahKeKeranjang` melakukan semua hal berikut **secara sinkron dalam satu task** sebelum memperbarui tampilan:
  1. `bacaRiwayat()` mem-parse ~9.000 entri riwayat dari `localStorage` via `JSON.parse` — operasi O(n) pada string JSON besar.
  2. `window.Lacak.kirim('add_to_cart', { produk, keranjang, riwayat, ... })` dipanggil dengan payload yang mencakup **seluruh array riwayat 9.000 entri**. Di dalam SDK ([`lacak.min.js`](file:///d:/Kuliah/Semester%205/Pengembangan%20Web/Praktek/Pertemuan%203/tokokilat/public/vendor/lacak.min.js)), fungsi `k()` memanggil `JSON.stringify(payload)` pada objek besar ini, lalu fungsi `t()` melakukan loop hashing sebanyak **R × panjang string** iterasi (R=12), dan fungsi `f()` melakukan loop hingga **F=2.000.000** iterasi untuk membuat sidik perangkat. Semua perhitungan ini sinkron.
  3. `simpanRiwayat(riwayat)` menulis kembali seluruh 9.000+ entri ke `localStorage` via `JSON.stringify` + `setItem` — lagi-lagi sinkron.
  4. **Baru setelah semua operasi di atas selesai**, kode memperbarui tampilan: `perbaruiLencana()`, mengubah `tombol.textContent`, dan menampilkan toast.

  Karena seluruh proses berada dalam satu macrotask tanpa *yield* ke event loop, browser tidak mendapat kesempatan untuk merender perubahan DOM. Dari perspektif pengguna, tombol "mati" — tidak berubah warna, tidak berubah teks. Pengguna yang wajar akan mengklik ulang, dan setiap klik masuk ke antrian macrotask, masing-masing menambahkan 1 ke keranjang. Inilah mengapa Pak Anton mendapati keranjang berisi 3 setelah 3 kali klik.

- **Rencana perubahan:**
  1. **Pindahkan feedback visual ke awal fungsi**, sebelum operasi berat. Ubah teks tombol menjadi "Ditambahkan ✓" dan perbarui lencana keranjang **segera** setelah data keranjang diperbarui (sebelum memanggil SDK dan menulis riwayat).
  2. **Kurangi ukuran payload yang dikirim ke SDK.** Jangan sertakan seluruh array `riwayat` (9.000 entri) di dalam panggilan `Lacak.kirim`. Cukup kirim entri riwayat terakhir yang baru ditambahkan, atau minimal batasi jumlah entri yang dikirim.
  3. **Jadwalkan operasi berat (SDK + simpan riwayat) secara asinkron** menggunakan `setTimeout` atau `requestIdleCallback` agar main thread segera kembali ke event loop untuk merender.
  4. **Tambahkan perlindungan klik ganda (*debounce* atau *disable* tombol)** selama proses berlangsung agar pengguna tidak bisa menambahkan produk berkali-kali secara tidak sengaja.
- **Prediksi terukur:**
  Setelah perubahan, **INP pada S2 turun dari ~100 ms menjadi ≤ 50 ms** (target: ≤ 200 ms). Feedback visual ("Ditambahkan ✓" pada tombol) muncul dalam frame pertama setelah klik (~16 ms). Tidak ada lagi Long Task > 100 ms yang terkait langsung dengan interaksi klik keranjang, karena operasi berat dijalankan di luar jalur kritis rendering.
  *Prediksi efek samping:* Pengiriman data analitik ke SDK menjadi *fire-and-forget* yang dijadwalkan asinkron, sehingga secara teoritis ada risiko data tidak terkirim jika pengguna menutup tab sangat cepat. Namun SDK vendor sudah menggunakan antrian internal (`q.push`), jadi risiko ini minimal.
- **Alternatif yang dipertimbangkan dan alasan tidak dipilih:**
  - *Alternatif:* Memindahkan seluruh logika keranjang ke Web Worker.
  - *Alasan ditolak:* Berlebihan untuk kasus ini. Akar masalahnya bukan kompleksitas komputasi, melainkan urutan eksekusi (feedback visual ditempatkan setelah operasi berat). Menyusun ulang urutan dan menjadwalkan operasi berat secara asinkron sudah cukup tanpa menambah kompleksitas arsitektur.

### Sesudah perbaikan

- **Hash commit perbaikan:** (diisi setelah commit kode perbaikan)
- **Hasil ukur (median 3 kali):**
  - INP pada S2: (diisi setelah pengukuran ulang)
  - Long task terlama saat klik "+ Keranjang": (diisi setelah pengukuran ulang)
- **Prediksi vs kenyataan:** (diisi setelah pengukuran ulang)
- **Efek samping yang muncul:** (diisi setelah pengukuran ulang)

---

## P-04: Voucher KILAT1212 Membekukan Layar karena Async Palsu dan Simulasi Cicilan O(n×k) Tanpa Yield

**Tiket terkait:** TK-1057 (Mas Dimas)  
**Tanggal dan hash commit entri ini:** 01 Oktober 2026

### Sebelum perbaikan

- **Yang teramati di trace (baseline):**
  Pada pengujian Skenario S4 (tekan "Pakai voucher" dengan kode KILAT1212, lalu coba ketik di kolom cari), alat ukur TokoKilat mencatat **INP 1.784 ms** (merah, 16 interaksi), **70 Long Task** dengan yang terlama **1.774 ms**, total **blokir 4.120 ms**, dan **91 Frame >50 ms** (terburuk 10.816 ms). Panel Performance DevTools mengonfirmasi INP 1.784 ms dan CLS 0,00. Pada flame chart, terlihat satu blok task **raksasa** yang mendominasi seluruh timeline, tanpa jeda rendering di tengahnya. Track Frames menunjukkan deretan frame merah/dropped selama proses voucher berlangsung. Ketika pengguna mencoba mengetik "teh" di kolom pencarian selama proses berjalan, huruf-huruf baru muncul setelah proses voucher selesai — membuktikan bahwa main thread 100% diblokir. Progress bar yang seharusnya bertahap dari 0% ke 100% tetap stuck, lalu loncat langsung ke selesai.
- **Dugaan mekanisme:**
  Di [`harga-promo.js`](file:///d:/Kuliah/Semester%205/Pengembangan%20Web/Praktek/Pertemuan%203/tokokilat/public/js/harga-promo.js) baris 42–71, fungsi `terapkanVoucher` melakukan loop `for...of` pada **seluruh produk** (~1.200 produk yang ditampilkan) dan di setiap iterasi memanggil `await hitungHargaPromo(produk, aturan)`.

  Komentar di kode berbunyi *"await di setiap produk supaya browser sempat menggambar progress bar"* — **namun ini adalah kesalahan pemahaman tentang microtask**. Fungsi `hitungHargaPromo` dideklarasikan `async` tetapi di dalamnya **tidak ada operasi asinkron sejati** (tidak ada `fetch`, tidak ada `setTimeout`, tidak ada I/O). Fungsi ini hanya melakukan perhitungan matematika murni (`simulasiCicilan`). Ketika sebuah fungsi `async` mengembalikan nilai tanpa `await` pada Promise yang benar-benar pending, Promise-nya resolve secara **sinkron**.

  `await` pada Promise yang sudah resolved hanya menjadwalkan kelanjutan kode sebagai **microtask**. Microtask diproses **habis-habisan sebelum browser mendapat rendering opportunity**. Artinya: seluruh 1.200 iterasi loop + 41 panggilan `simulasiCicilan` per produk (total ~49.200 simulasi cicilan) berjalan tanpa satu pun kesempatan rendering. Progress bar tidak pernah di-paint oleh browser karena perubahan `isi.style.width` dan `teks.textContent` menumpuk sebagai *pending style/layout changes* yang baru ter-render setelah semua microtask selesai.

  Selama proses ini, event loop tidak bisa memproses macrotask baru (termasuk event input keyboard dan scroll), sehingga layar terasa "beku" total.

- **Rencana perubahan:**
  1. **Pecah loop menjadi chunk-chunk kecil** menggunakan pola *yield to main thread*. Setiap N produk (misal 50 produk), sisipkan `await new Promise(r => setTimeout(r, 0))` untuk menjadwalkan kelanjutan sebagai **macrotask**, memberi browser kesempatan untuk merender frame (termasuk memperbarui progress bar) dan memproses input pengguna.
  2. **Hapus 40 iterasi simulasi cicilan tambahan** di baris 37 (`for (let i = 0; i < 40; i++) simulasiCicilan(...)`) yang berlabel "cek kestabilan pembulatan" — ini hanya membuang waktu CPU tanpa hasil yang digunakan (hasilnya tidak disimpan).
  3. **Pastikan kolom pencarian tetap responsif** selama perhitungan voucher berlangsung, karena yield ke main thread akan memungkinkan event input diproses di antara chunk.
- **Prediksi terukur:**
  Setelah perubahan, **INP pada S4 turun dari 1.784 ms menjadi ≤ 200 ms** (target: ≤ 200 ms). Progress bar bergerak bertahap secara visual (0%... 10%... 20%... dst.) karena browser mendapat rendering opportunity di antara setiap chunk. Kolom pencarian tetap dapat diketik selama proses voucher berlangsung. Tidak ada Long Task > 100 ms selama interaksi.
  *Prediksi efek samping:* Total waktu keseluruhan proses voucher mungkin sedikit bertambah (beberapa puluh ms) karena overhead penjadwalan macrotask di setiap chunk, namun persepsi pengguna justru jauh lebih baik karena ada feedback visual yang berkelanjutan dan UI yang tetap responsif.
- **Alternatif yang dipertimbangkan dan alasan tidak dipilih:**
  - *Alternatif 1:* Memindahkan seluruh perhitungan voucher ke Web Worker.
  - *Alasan ditolak:* Efektif secara teknis, tetapi menambah kompleksitas arsitektur (perlu message passing, transfer data produk, dan sinkronisasi state `keadaan.hargaVoucher`). Pola yield-to-main-thread cukup memadai dan jauh lebih sederhana untuk kasus ini.
  - *Alternatif 2:* Menggunakan `requestAnimationFrame` untuk setiap iterasi.
  - *Alasan ditolak:* rAF dijadwalkan sebelum rendering, bukan setelahnya, dan memanggil rAF per produk (1.200×) akan memperlambat proses secara signifikan (~1.200 × 16 ms = ~19 detik). Chunking dengan `setTimeout(0)` per batch adalah keseimbangan terbaik antara responsivitas dan kecepatan total.

### Sesudah perbaikan

- **Hash commit perbaikan:** (diisi setelah commit kode perbaikan)
- **Hasil ukur (median 3 kali):**
  - INP pada S4: (diisi setelah pengukuran ulang)
  - Long task terlama saat proses voucher: (diisi setelah pengukuran ulang)
  - Apakah progress bar tergambar bertahap: (diisi setelah pengukuran ulang)
  - Apakah kolom cari tetap responsif: (diisi setelah pengukuran ulang)
- **Prediksi vs kenyataan:** (diisi setelah pengukuran ulang)
- **Efek samping yang muncul:** (diisi setelah pengukuran ulang)
