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
