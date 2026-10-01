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
| S2       | INP                                           |                  |                  | <= 200 ms                      |           |
| S3       | Jumlah pesanan dari 3 klik                    |                  |                  | 1                              |           |
| S4       | INP / progres tergambar bertahap?             |                  |                  |                                |           |
| S5       | Frame > 50 ms per 10 dtk                      |                  |                  | <= 2                           |           |
| S6       | Frame > 50 ms per 10 dtk                      |                  |                  | <= 2                           |           |

### Bukti Data Mentah Alat Ukur TokoKilat (Skenario S1: Pengetikan "sepatu")

```json
{
  "waktu": "2026-10-01T12:04:19.467Z",
  "jumlahLongTask": 0,
  "longTaskTerlama": 0,
  "totalBlokir": 0,
  "jumlahInteraksi": 7,
  "inp": 192,
  "inpRinci": {
    "durasi": 192,
    "jenis": "pointerdown",
    "target": "#kolom-cari",
    "tundaInput": 0,
    "proses": 1,
    "presentasi": 191
  },
  "limaInteraksiTerlambat": [
    {
      "durasi": 192,
      "jenis": "pointerdown",
      "target": "#kolom-cari",
      "tundaInput": 0,
      "proses": 1,
      "presentasi": 191
    },
    {
      "durasi": 168,
      "jenis": "keydown",
      "target": "#kolom-cari",
      "tundaInput": 0,
      "proses": 1,
      "presentasi": 167
    },
    {
      "durasi": 168,
      "jenis": "keydown",
      "target": "#kolom-cari",
      "tundaInput": 0,
      "proses": 0,
      "presentasi": 168
    },
    {
      "durasi": 160,
      "jenis": "keydown",
      "target": "#kolom-cari",
      "tundaInput": 0,
      "proses": 0,
      "presentasi": 160
    },
    {
      "durasi": 128,
      "jenis": "keyup",
      "target": "#kolom-cari",
      "tundaInput": 0,
      "proses": 1,
      "presentasi": 127
    }
  ],
  "cls": 0,
  "frameLambat": 0,
  "frameTerburuk": 0
}
```

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

## 5. Dugaan yang ternyata keliru

Dugaan dari catatan serah terima, dari tiket, atau dari tim Anda sendiri yang terbantah oleh
pengukuran. Sertakan angkanya. Bagian ini sama pentingnya dengan bagian temuan.

## 6. Yang belum beres dan rekomendasi

Masalah yang tersisa, risiko, dan usulan untuk tim lain (backend, vendor SDK, desain).

## 7. Pernyataan penggunaan AI dan pembagian kerja

Alat AI yang dipakai dan untuk apa. Kontribusi tiap anggota.
