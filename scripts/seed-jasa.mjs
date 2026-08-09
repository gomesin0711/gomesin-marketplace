import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

// 1. Create Jasa category
const jasaCat = await db.category.create({
  data: {
    name: 'Jasa',
    slug: 'jasa',
    icon: 'HardHat',
    color: 'amber',
    sortOrder: 13,
  },
});
console.log('Created category:', jasaCat.id, jasaCat.name);

// Get seller IDs to distribute listings
const sellers = await db.seller.findMany({
  where: { id: { not: 'cms1ued630000pzqrvp3qhdia' } }, // exclude "Anda"
  select: { id: true, name: true, city: true, province: true },
});
console.log('Available sellers:', sellers.length);

const jasaListings = [
  {
    title: 'Jasa Cetak Offset A3 Full Color (Min. 500 lembar)',
    slug: 'jasa-cetak-offset-a3-full-color',
    description: 'Jasa cetak offset berkualitas tinggi untuk brosur, flyer, poster, dan kartu nama. Mesin Heidelberg SM 52 4 warna dengan hasil tajam dan warna akurat. Minimal order 500 lembar, harga mulai Rp 150/lembar tergantung ukuran dan jumlah. Proses cepat 3-5 hari kerja. Tersedia coating glossy/doft.',
    price: 150000000n,
    priceType: 'nego',
    condition: 'jasa',
    brand: 'Heidelberg SM 52',
    city: 'Surabaya',
    province: 'Jawa Timur',
    images: '["https://sfile.chatglm.cn/images-ppt/17736d2412bd.jpg"]',
    specs: '{"Layanan":"Cetak Offset","Mesin":"Heidelberg SM 52 4 Warna","Min.Order":"500 lembar","Ukuran":"A3, A4, Custom","Finishing":"Laminasi, Coating, Potong, Lipat","Estimasi":"3-5 hari kerja"}',
    featured: false,
    sellerId: sellers[0]?.id,
  },
  {
    title: 'Jasa Service & Perbaikan Mesin Cetak Offset Semua Merk',
    slug: 'jasa-service-perbaikan-mesin-cetak-offset',
    description: 'Tim teknisi berpengalaman 15+ tahun siap melayani service dan perbaikan mesin cetak offset semua merk (Heidelberg, Komori, Roland, Mitsubishi, KBA, Ryobi, Sakurai). Layanan meliputi: overhaul mesin, ganti bearing, setting registration, perbaikan sistem tinta dan air, kalibrasi. Garansi service 3 bulan. Tersedia kunjungan on-site seluruh Jawa.',
    price: 500000000n,
    priceType: 'nego',
    condition: 'jasa',
    brand: 'Semua Merk',
    city: 'Bekasi',
    province: 'Jawa Barat',
    images: '["https://sfile.chatglm.cn/images-ppt/d52710e49f50.jpg"]',
    specs: '{"Layanan":"Service & Repair","Spesialisasi":"Mesin Cetak Offset","Merk":"Heidelberg, Komori, Roland, dll","Garansi":"3 Bulan","Area":"Seluruh Jawa","Respon":"24 jam"}',
    featured: false,
    sellerId: sellers[1]?.id,
  },
  {
    title: 'Jasa Sewa Excavator Komatsu PC200-8 dengan Operator',
    slug: 'jasa-sewa-excavator-komatsu-pc200',
    description: 'Sewa excavator Komatsu PC200-8 lengkap dengan operator berpengalaman untuk proyek galian, pondasi, perataan lahan, dan pekerjaan konstruksi. Unit terawat dengan performa optimal. Harga sudah termasuk operator dan bahan bakar. Tersedia paket harian, mingguan, dan bulanan. Area Jawa Tengah dan sekitarnya.',
    price: 850000000n,
    priceType: 'nego',
    condition: 'jasa',
    brand: 'Komatsu PC200-8',
    city: 'Semarang',
    province: 'Jawa Tengah',
    images: '["https://sfile.chatglm.cn/images-ppt/3b64863fa410.webp"]',
    specs: '{"Layanan":"Sewa Alat Berat","Unit":"Excavator Komatsu PC200-8","Include":"Operator + BBM","Paket":"Harian / Mingguan / Bulanan","Area":"Jawa Tengah","Kapasitas Bucket":"0.8 m³"}',
    featured: false,
    sellerId: sellers[2]?.id,
  },
  {
    title: 'Jasa CNC Routing & Cutting Kayu, MDF, Akrilik',
    slug: 'jasa-cnc-routing-cutting-kayu-mdf-akrilik',
    description: 'Jasa pemotongan dan ukiran CNC router presisi tinggi untuk berbagai material: kayu jati, kayu sengon, MDF, akrilik, PVC foam board, dan HPL. Mesin CNC 3 axis 1300x2500mm dengan spindle 3.2kW. Cocok untuk pembuatan partisi, furniture custom, sign board, panel dekoratif, dan souvernir. Menerima file AutoCAD, CorelDRAW, ArtCAM.',
    price: 200000000n,
    priceType: 'nego',
    condition: 'jasa',
    brand: 'CNC Router 1325',
    city: 'Tangerang',
    province: 'Banten',
    images: '["https://sfile.chatglm.cn/images-ppt/a5abdd3178ca.jpg"]',
    specs: '{"Layanan":"CNC Routing & Cutting","Area Kerja":"1300x2500mm","Material":"Kayu, MDF, Akrilik, PVC, HPL","Spindle":"3.2kW Air Cooled","Format File":"DXF, DWG, CDR, AI","Akurasi":"±0.1mm"}',
    featured: false,
    sellerId: sellers[3]?.id,
  },
  {
    title: 'Jasa Laser Cutting & Engraving Metal & Akrilik',
    slug: 'jasa-laser-cutting-engraving-metal-akrilik',
    description: 'Jasa potong dan ukir laser CO2 130W untuk akrilik, MDF, kayu, karet, dan kertas. Juga tersedia laser fiber untuk marking dan cutting logam (stainless steel, baja, aluminium). Akurasi tinggi, hasil rapi tanpa rough edges. Cocok untuk signage, nameplate, gantungan kunci, undangan, lampu dekoratif, dan produk promosi.',
    price: 100000000n,
    priceType: 'nego',
    condition: 'jasa',
    brand: 'CO2 130W + Fiber 20W',
    city: 'Bandung',
    province: 'Jawa Barat',
    images: '["https://sfile.chatglm.cn/images-ppt/105817c75ef1.jpg"]',
    specs: '{"Layanan":"Laser Cutting & Engraving","Mesin":"CO2 130W + Fiber 20W","Area Kerja":"1300x900mm","Material":"Akrilik, MDF, Kayu, Logam","Ketebalan Max":"20mm (akrilik)","Format File":"CDR, AI, DXF, PDF"}',
    featured: false,
    sellerId: sellers[4]?.id,
  },
  {
    title: 'Jasa Installasi & Pemasangan Mesin Packaging Otomatis',
    slug: 'jasa-installasi-mesin-packaging-otomatis',
    description: 'Jasa installasi, pemasangan, dan komisioning mesin packaging otomatis (sealer, filler, shrink wrap, labeling). Tim engineer bersertifikat siap membantu dari unloading, positioning, piping, wiring, hingga trial run dan training operator. Melayani pabrik makanan, farmasi, kosmetik, dan FMCG di seluruh Indonesia. Free konsultasi dan survey lokasi.',
    price: 750000000n,
    priceType: 'nego',
    condition: 'jasa',
    brand: 'Multi Merk',
    city: 'Jakarta Selatan',
    province: 'DKI Jakarta',
    images: '["https://sfile.chatglm.cn/images-ppt/f6a676757fdc.jpg"]',
    specs: '{"Layanan":"Installasi & Komisioning","Spesialisasi":"Mesin Packaging","Lingkup":"Unloading, Piping, Wiring, Trial","Training":"Included","Area":"Seluruh Indonesia","Garansi":"6 Bulan"}',
    featured: false,
    sellerId: sellers[5]?.id,
  },
];

for (const item of jasaListings) {
  if (!item.sellerId) continue;
  const listing = await db.listing.create({
    data: {
      ...item,
      categoryId: jasaCat.id,
    },
  });
  console.log('Created listing:', listing.id, '|', listing.title);
}

console.log('\nDone! Jasa category +', jasaListings.filter(l => l.sellerId).length, 'listings created.');
await db.$disconnect();
