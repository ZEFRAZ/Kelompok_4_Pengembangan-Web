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
| S1       | INP                                           |                  |                  | <= 200 ms                      |           |
| S1       | Long task terlama                             |                  |                  | <= 100 ms                      |           |
| S2       | INP                                           |                  |                  | <= 200 ms                      |           |
| S3       | Jumlah pesanan dari 3 klik                    |                  |                  | 1                              |           |
| S4       | INP / progres tergambar bertahap?             |                  |                  |                                |           |
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
- **Hasil:** angka sebelum dan sesudah.

## 5. Dugaan yang ternyata keliru

Dugaan dari catatan serah terima, dari tiket, atau dari tim Anda sendiri yang terbantah oleh
pengukuran. Sertakan angkanya. Bagian ini sama pentingnya dengan bagian temuan.

## 6. Yang belum beres dan rekomendasi

Masalah yang tersisa, risiko, dan usulan untuk tim lain (backend, vendor SDK, desain).

## 7. Pernyataan penggunaan AI dan pembagian kerja

Alat AI yang dipakai dan untuk apa. Kontribusi tiap anggota.
