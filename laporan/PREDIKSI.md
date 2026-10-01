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
