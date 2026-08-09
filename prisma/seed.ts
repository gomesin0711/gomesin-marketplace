import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Local images (all under 120kb, compressed)
const IMG: Record<string, string[]> = {
  cetak: [
    "/listing-images/cetak-1.jpg",
    "/listing-images/cetak-2.jpg",
    "/listing-images/cetak-3.jpg",
    "/listing-images/cetak-4.jpg",
  ],
  digitalprint: [
    "/listing-images/digitalprint-1.jpg",
    "/listing-images/digitalprint-2.jpg",
    "/listing-images/digitalprint-3.jpg",
    "/listing-images/digitalprint-4.jpg",
  ],
  kemasan: [
    "/listing-images/kemasan-1.jpg",
    "/listing-images/kemasan-2.jpg",
    "/listing-images/kemasan-3.jpg",
    "/listing-images/kemasan-4.jpg",
  ],
  plastik: [
    "/listing-images/plastik-1.jpg",
    "/listing-images/plastik-2.jpg",
    "/listing-images/plastik-3.jpg",
    "/listing-images/plastik-4.jpg",
  ],
  kompressor: [
    "/listing-images/kompressor-1.jpg",
    "/listing-images/kompressor-2.jpg",
    "/listing-images/kompressor-3.jpg",
    "/listing-images/kompressor-4.jpg",
  ],
  cnc: [
    "/listing-images/cnc-1.jpg",
    "/listing-images/cnc-2.jpg",
    "/listing-images/cnc-3.jpg",
    "/listing-images/cnc-4.jpg",
  ],
  laser: [
    "/listing-images/laser-1.jpg",
    "/listing-images/laser-2.jpg",
    "/listing-images/laser-3.jpg",
    "/listing-images/laser-4.jpg",
  ],
  bubut: [
    "/listing-images/bubut-1.jpg",
    "/listing-images/bubut-2.jpg",
    "/listing-images/bubut-3.jpg",
    "/listing-images/bubut-4.jpg",
  ],
  makanan: [
    "/listing-images/makanan-1.jpg",
    "/listing-images/makanan-2.jpg",
    "/listing-images/makanan-3.jpg",
    "/listing-images/makanan-4.jpg",
  ],
  tekstil: [
    "/listing-images/tekstil-1.jpg",
    "/listing-images/tekstil-2.jpg",
    "/listing-images/tekstil-3.jpg",
    "/listing-images/tekstil-4.jpg",
  ],
  kayu: [
    "/listing-images/kayu-1.jpg",
    "/listing-images/kayu-2.jpg",
    "/listing-images/kayu-3.jpg",
    "/listing-images/kayu-4.jpg",
  ],
  alatberat: [
    "/listing-images/alatberat-1.jpg",
    "/listing-images/alatberat-2.jpg",
    "/listing-images/alatberat-3.jpg",
    "/listing-images/alatberat-4.jpg",
  ],
  sparepart: [
    "/listing-images/sparepart-1.jpg",
    "/listing-images/sparepart-2.jpg",
    "/listing-images/sparepart-3.jpg",
    "/listing-images/sparepart-4.jpg",
  ],
};

const categories = [
  { name: "Mesin Cetak", slug: "mesin-cetak", icon: "Printer", color: "emerald", sortOrder: 1 },
  { name: "Mesin Digital Printing", slug: "mesin-digital-printing", icon: "MonitorPrinter", color: "teal", sortOrder: 2 },
  { name: "Mesin Kemasan & Packaging", slug: "mesin-kemasan", icon: "Package", color: "green", sortOrder: 3 },
  { name: "Mesin Plastik & Injeksi", slug: "mesin-plastik", icon: "FlaskConical", color: "emerald", sortOrder: 4 },
  { name: "Kompressor & Generator", slug: "kompressor-generator", icon: "Zap", color: "teal", sortOrder: 5 },
  { name: "Mesin CNC & Laser", slug: "mesin-cnc-laser", icon: "Cog", color: "teal", sortOrder: 6 },
  { name: "Mesin Bubut", slug: "mesin-bubut", icon: "Disc3", color: "green", sortOrder: 7 },
  { name: "Mesin Makanan & Minuman", slug: "mesin-makanan", icon: "CookingPot", color: "green", sortOrder: 8 },
  { name: "Mesin Tekstil & Garment", slug: "mesin-tekstil", icon: "Shirt", color: "lime", sortOrder: 9 },
  { name: "Mesin Kayu & Perkakas", slug: "mesin-kayu", icon: "TreePine", color: "lime", sortOrder: 10 },
  { name: "Alat Berat & Konstruksi", slug: "alat-berat", icon: "Truck", color: "emerald", sortOrder: 11 },
  { name: "Sparepart & Aksesoris", slug: "sparepart", icon: "Wrench", color: "teal", sortOrder: 12 },
];

const sellers = [
  { name: "PT. Karya Teknik Sukses", phone: "081234567890", city: "Bekasi", province: "Jawa Barat", verified: true, rating: 4.8, reviewCount: 156 },
  { name: "Toko Mesin Jaya Abadi", phone: "082345678901", city: "Semarang", province: "Jawa Tengah", verified: true, rating: 4.6, reviewCount: 89 },
  { name: "CV. Mesindo Mandiri", phone: "083456789012", city: "Surabaya", province: "Jawa Timur", verified: true, rating: 4.7, reviewCount: 234 },
  { name: "Bengkel Las & Mesin Sejahtera", phone: "084567890123", city: "Tangerang", province: "Banten", verified: false, rating: 4.3, reviewCount: 45 },
  { name: "UD. Sumber Rezeki Mesin", phone: "085678901234", city: "Bandung", province: "Jawa Barat", verified: true, rating: 4.5, reviewCount: 112 },
  { name: "PT. Indoprint Engineering", phone: "086789012345", city: "Jakarta Selatan", province: "DKI Jakarta", verified: true, rating: 4.9, reviewCount: 312 },
  { name: "Mitramega Mesin Industri", phone: "087890123456", city: "Medan", province: "Sumatera Utara", verified: false, rating: 4.2, reviewCount: 67 },
  { name: "CV. Garuda Mesin", phone: "088901234567", city: "Surabaya", province: "Jawa Timur", verified: true, rating: 4.6, reviewCount: 178 },
];

// Slug generator
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function pick<T>(arr: T[], indices: number[]): T[] {
  return indices.map((i) => arr[i % arr.length]);
}

type ListingInput = {
  title: string;
  titleEn?: string;
  desc: string;
  descEn?: string;
  price: number;
  priceType: "fixed" | "negotiable";
  condition: "baru" | "bekas";
  brand?: string;
  year?: number;
  city: string;
  province: string;
  catSlug: string;
  imgKey: string;
  imgs: number[];
  specs: Record<string, string>;
  featured?: boolean;
  views?: number;
  packageType?: "highlight" | "spotlight" | "colek";
};

const listings: ListingInput[] = [
  // ===== MESIN CETAK =====
  {
    title: "Mesin Cetak Offset Heidelberg SM 52 4 Warna",
    titleEn: "Heidelberg SM 52 4-Color Offset Printing Machine",
    desc: "Mesin cetak offset Heidelberg SM 52 kondisi prima. 4 warna, cocok untuk cetak brosur, katalog, kemasan, kartu nama. Hasil cetak berkualitas tinggi, register presisi. Sudah overhaul plat dan blanket baru.",
    descEn: "Heidelberg SM 52 offset printing machine in excellent condition. 4 color, suitable for brochures, catalogs, packaging, business cards. High quality prints, precise registration. Overhauled with new plate and blanket.",
    price: 285000000, priceType: "negotiable", condition: "bekas", brand: "Heidelberg", year: 2015,
    city: "Jakarta Selatan", province: "DKI Jakarta", catSlug: "mesin-cetak", imgKey: "cetak", imgs: [0, 1],
    specs: { "Tipe": "SM 52 4 Warna", "Ukuran Cetak": "A3+ (32x46cm)", "Counter": "45 juta impressi", "Tahun": "2015", "Kondisi": "Siap Pakai" },
    featured: true, views: 1250, packageType: "spotlight",
  },
  {
    title: "Mesin Cetak Digital Konika Minolta C3080",
    titleEn: "Konika Minolta C3080 Digital Printing Machine",
    desc: "Mesin cetak digital Konika Minolta C3080 produksi tinggi. Cocok untuk cetak short run, variable data, dan personalisasi. Kualitas cetak setara offset. Mesin import Jepang kondisi istimewa.",
    descEn: "Konika Minolta C3080 high production digital printing machine. Ideal for short run, variable data, and personalization. Offset-equivalent print quality. Japanese import in excellent condition.",
    price: 195000000, priceType: "negotiable", condition: "bekas", brand: "Konika Minolta", year: 2018,
    city: "Surabaya", province: "Jawa Timur", catSlug: "mesin-cetak", imgKey: "cetak", imgs: [2, 3],
    specs: { "Tipe": "C3080", "Resolusi": "1200x1200 dpi", "Speed": "80 ppm", "Warna": "CMYK", "Tahun": "2018" },
    featured: true, views: 890, packageType: "highlight",
  },
  {
    title: "Mesin Cetak Sablon Flat Screen Manual + Vacuum",
    titleEn: "Manual Flat Screen Printing Machine with Vacuum",
    desc: "Mesin cetak sablon flat screen manual dengan sistem vacuum table. Area cetak 60x80cm, cocok untuk kaos, kertas, dan material datar lainnya. Frame alumunium ringan dan tahan karat.",
    descEn: "Manual flat screen printing machine with vacuum table system. 60x80cm print area, suitable for t-shirts, paper, and other flat materials. Lightweight and rust-proof aluminum frame.",
    price: 4500000, priceType: "fixed", condition: "baru",
    city: "Bandung", province: "Jawa Barat", catSlug: "mesin-cetak", imgKey: "cetak", imgs: [1],
    specs: { "Area Cetak": "60 x 80 cm", "Frame": "Alumunium", "Table": "Vacuum", "Warna": "1-4 Warna" },
    views: 340,
  },
  {
    title: "Mesin Cetak Label Flexo 3 Warna",
    titleEn: "3-Color Flexo Label Printing Machine",
    desc: "Mesin cetak label flexo 3 warna untuk produksi stiker dan label kemasan. Kecepatan tinggi hingga 120m/menit. Dilengkapi die cutting inline. Cocok untuk industri makanan dan kosmetik.",
    descEn: "3-color flexo label printing machine for sticker and packaging label production. High speed up to 120m/min. Equipped with inline die cutting. Suitable for food and cosmetics industry.",
    price: 75000000, priceType: "negotiable", condition: "bekas", brand: "Nilpeter",
    city: "Tangerang", province: "Banten", catSlug: "mesin-cetak", imgKey: "cetak", imgs: [3, 0],
    specs: { "Warna": "3 Stasiun", "Lebar Material": "250mm", "Speed": "120 m/min", "Die Cut": "Inline" },
    views: 520,
  },

  // ===== MESIN DIGITAL PRINTING =====
  {
    title: "Mesin UV Flatbed Printer 60x90cm A3+",
    titleEn: "UV Flatbed Printer 60x90cm A3+",
    desc: "Mesin cetak UV flatbed A3+ untuk cetak langsung di akrilik, kaca, kayu, logam, dan berbagai material lainnya. Hasil cetak tahan gores dan UV. 6 warna + white ink. Cocok untuk souvenir dan signage.",
    descEn: "A3+ UV flatbed printer for direct printing on acrylic, glass, wood, metal, and various other materials. Scratch and UV resistant prints. 6 colors + white ink. Ideal for souvenirs and signage.",
    price: 85000000, priceType: "negotiable", condition: "baru",
    city: "Jakarta Selatan", province: "DKI Jakarta", catSlug: "mesin-digital-printing", imgKey: "digitalprint", imgs: [0, 1],
    specs: { "Area Cetak": "60 x 90 cm", "Tipe": "UV Flatbed", "Warna": "6 Warna + White", "Resolusi": "1440 dpi" },
    featured: true, views: 780, packageType: "highlight",
  },
  {
    title: "Mesin Digital Printing Large Format Eco-Solvent 1.6m",
    titleEn: "Large Format Eco-Solvent Digital Printing Machine 1.6m",
    desc: "Mesin digital printing eco-solvent lebar 1.6 meter. Untuk cetak banner, spanduk, sticker, dan backdrop outdoor. Tahan air dan UV. Dilengkapi 2 head Epson i3200-U1. Produksi harian tinggi.",
    descEn: "1.6m wide eco-solvent digital printing machine. For outdoor banners, spanduk, stickers, and backdrops. Water and UV resistant. Equipped with 2 Epson i3200-U1 heads. High daily production capacity.",
    price: 65000000, priceType: "fixed", condition: "baru", brand: "Mimaki",
    city: "Bekasi", province: "Jawa Barat", catSlug: "mesin-digital-printing", imgKey: "digitalprint", imgs: [2, 3],
    specs: { "Lebar": "1.6 meter", "Head": "Epson i3200-U1 x2", "Tinta": "Eco-Solvent", "Speed": "21 m²/jam" },
    featured: true, views: 1560, packageType: "spotlight",
  },
  {
    title: "Mesin Sublimasi Tinta 1.8m + Heat Press",
    titleEn: "1.8m Sublimation Ink Machine + Heat Press",
    desc: "Mesin sublimasi tinta lebar 1.8m lengkap dengan heat press roll. Untuk produksi kaos, mug, kain, bendera. Hasil warna menyerap sempurna ke kain polyester.",
    descEn: "1.8m wide sublimation ink machine complete with roll heat press. For t-shirt, mug, fabric, and flag production. Colors absorb perfectly into polyester fabric.",
    price: 28500000, priceType: "fixed", condition: "baru", brand: "Epson",
    city: "Bandung", province: "Jawa Barat", catSlug: "mesin-digital-printing", imgKey: "digitalprint", imgs: [1],
    specs: { "Tipe": "Sublimasi Tinta", "Lebar": "1.8 meter", "Head": "Epson i3200", "Include": "Heat Press Roll" },
    views: 540,
  },

  // ===== MESIN KEMASAN =====
  {
    title: "Mesin Packaging Sealer Otomatis Continuous",
    titleEn: "Automatic Continuous Packaging Sealer Machine",
    desc: "Mesin sealer kontinu otomatis untuk kemasan sachet, standing pouch, dan cup. Kecepatan 40-120 pouch/menit. Dilengkapi penghitung digital dan tanggal kadaluarsa printer. Cocok untuk industri makanan.",
    descEn: "Automatic continuous sealer for sachet, standing pouch, and cup packaging. Speed 40-120 pouch/min. Equipped with digital counter and expiry date printer. Suitable for food industry.",
    price: 45000000, priceType: "negotiable", condition: "bekas",
    city: "Surabaya", province: "Jawa Timur", catSlug: "mesin-kemasan", imgKey: "kemasan", imgs: [0, 1],
    specs: { "Tipe": "Continuous Sealer", "Speed": "40-120 pouch/min", "Kapasitas": "50-500ml", "Kemasan": "Sachet, Standing Pouch" },
    views: 670,
  },
  {
    title: "Mesin Filling & Capping Botol Otomatis 6 Nozzle",
    titleEn: "Automatic 6-Nozzle Bottle Filling & Capping Machine",
    desc: "Mesin pengisi dan penutup botol otomatis 6 nozzle. Untuk cairan, sirup, minyak, dan produk cair lainnya. Presisi tinggi dengan toleransi ±1ml. Stainless steel food grade. Kapasitas 2000 botol/jam.",
    descEn: "Automatic 6-nozzle bottle filling and capping machine. For liquids, syrups, oils, and other liquid products. High precision with ±1ml tolerance. Food grade stainless steel. 2000 bottles/hour capacity.",
    price: 120000000, priceType: "negotiable", condition: "baru",
    city: "Semarang", province: "Jawa Tengah", catSlug: "mesin-kemasan", imgKey: "kemasan", imgs: [2, 3],
    specs: { "Nozzle": "6", "Kapasitas": "2000 botol/jam", "Volume": "50-1000ml", "Material": "SS 304" },
    featured: true, views: 890, packageType: "colek",
  },
  {
    title: "Mesin Shrink Wrap Tunnel L Sealer",
    titleEn: "L Sealer Shrink Wrap Tunnel Machine",
    desc: "Mesin shrink wrap lengkap L-sealer dan tunnel pemanas. Untuk membungkus produk dengan film shrink PVC/POF. Cocok untuk kemasan produk elektronik, makanan, dan kosmetik. Tinggi tunnel adjustable.",
    descEn: "Complete shrink wrap machine with L-sealer and heating tunnel. For wrapping products with PVC/POF shrink film. Suitable for electronics, food, and cosmetics packaging. Adjustable tunnel height.",
    price: 35000000, priceType: "fixed", condition: "bekas",
    city: "Tangerang", province: "Banten", catSlug: "mesin-kemasan", imgKey: "kemasan", imgs: [3],
    specs: { "Tipe": "L-Sealer + Tunnel", "Max Film": "550mm", "Tunnel": "L x W x H 100x45x25cm", "Film": "PVC / POF" },
    views: 420,
  },

  // ===== MESIN PLASTIK =====
  {
    title: "Mesin Injection Molding 150 Ton Bekas",
    titleEn: "Used 150 Ton Injection Molding Machine",
    desc: "Mesin injection molding 150 ton bekas import Jepang. Merk Toshiba. Kondisi running siap produksi. Shot size 300g, cocok untuk produk plastik rumah tangga dan automotive parts. Dilengkapi auto loader dan hopper dryer.",
    descEn: "Used 150 ton injection molding machine imported from Japan. Toshiba brand. Running condition, production ready. 300g shot size, suitable for household plastics and automotive parts. Equipped with auto loader and hopper dryer.",
    price: 185000000, priceType: "negotiable", condition: "bekas", brand: "Toshiba", year: 2012,
    city: "Bekasi", province: "Jawa Barat", catSlug: "mesin-plastik", imgKey: "plastik", imgs: [0, 1],
    specs: { "Clamp Force": "150 Ton", "Shot Size": "300g", "Screw": "45mm", "Brand": "Toshiba IS150" },
    featured: true, views: 2100, packageType: "spotlight",
  },
  {
    title: "Mesin Blow Molding Botol 5L",
    titleEn: "5L Bottle Blow Molding Machine",
    desc: "Mesin blow molding semi-otomatis untuk produksi botol HDPE/PP kapasitas 1-5 liter. Cocok untuk botol minyak, deterjen, dan bahan kimia. 1 cavity, produksi 400 botol/jam. Mudah dioperasikan.",
    descEn: "Semi-automatic blow molding machine for 1-5 liter HDPE/PP bottle production. Suitable for oil, detergent, and chemical bottles. 1 cavity, 400 bottles/hour production. Easy to operate.",
    price: 65000000, priceType: "fixed", condition: "baru",
    city: "Surabaya", province: "Jawa Timur", catSlug: "mesin-plastik", imgKey: "plastik", imgs: [2],
    specs: { "Kapasitas": "1-5 Liter", "Produksi": "400 botol/jam", "Cavity": "1", "Material": "HDPE, PP" },
    views: 560,
  },
  {
    title: "Mesin Extruder Pipa PVC 65mm",
    titleEn: "65mm PVC Pipe Extruder Machine",
    desc: "Mesin extruder pipa PVC diameter 16-65mm. Lengkap dengan vacuum tank, haul-off, dan cutter. Produksi pipa air standar SNI. Mesin second import Taiwan kondisi siap pakai.",
    descEn: "16-65mm diameter PVC pipe extruder machine. Complete with vacuum tank, haul-off, and cutter. SNI standard water pipe production. Used Taiwan import machine, ready to use.",
    price: 95000000, priceType: "negotiable", condition: "bekas",
    city: "Medan", province: "Sumatera Utara", catSlug: "mesin-plastik", imgKey: "plastik", imgs: [3, 0],
    specs: { "Diameter": "16-65mm", "Screw": "65mm L/D 25:1", "Output": "100-150 kg/jam", "Standar": "SNI" },
    views: 430,
  },

  // ===== KOMPRESOR & GENERATOR =====
  {
    title: "Air Compressor Screw 30 HP Atlas Copco",
    titleEn: "Atlas Copco 30 HP Screw Air Compressor",
    desc: "Kompresor angin screw 30 HP merk Atlas Copco GA30. Dilengkapi refrigerated dryer dan filter. Working pressure 8-10 bar. Kondisi second import, sudah di-overhaul. Cocok untuk pabrik dan bengkel besar.",
    descEn: "Atlas Copco GA30 30 HP screw air compressor. Equipped with refrigerated dryer and filter. Working pressure 8-10 bar. Used import condition, overhauled. Suitable for factories and large workshops.",
    price: 75000000, priceType: "negotiable", condition: "bekas", brand: "Atlas Copco",
    city: "Jakarta Timur", province: "DKI Jakarta", catSlug: "kompressor-generator", imgKey: "kompressor", imgs: [0, 1],
    specs: { "Power": "30 HP / 22 kW", "Pressure": "8-10 bar", "CFM": "130 cfm", "Brand": "Atlas Copco GA30" },
    featured: true, views: 980, packageType: "highlight",
  },
  {
    title: "Generator Set Perkins 100 kVA Silent",
    titleEn: "Perkins 100 kVA Silent Generator Set",
    desc: "Generator set Perkins 100 kVA type silent. Mesin diesel Perkins, alternator Stamford. Dilengkapi ATS (Auto Transfer Switch) dan panel kontrol digital. Bisa untuk backup pabrik atau proyek konstruksi.",
    descEn: "Perkins 100 kVA silent type generator set. Perkins diesel engine, Stamford alternator. Equipped with ATS (Auto Transfer Switch) and digital control panel. Suitable for factory backup or construction projects.",
    price: 125000000, priceType: "negotiable", condition: "bekas", brand: "Perkins",
    city: "Semarang", province: "Jawa Tengah", catSlug: "kompressor-generator", imgKey: "kompressor", imgs: [2, 3],
    specs: { "Kapasitas": "100 kVA", "Engine": "Perkins 1006-TAG2", "Alternator": "Stamford", "Tipe": "Silent Canopy" },
    views: 760,
  },
  {
    title: "Kompressor Piston 10 HP Twin Tank",
    titleEn: "10 HP Twin Tank Piston Compressor",
    desc: "Kompressor piston 10 HP dengan twin tank 200 liter. Tekanan max 12 kg/cm². Cocok untuk bengkel body repair, spray painting, dan pneumatic tools. Kondisi baru, garansi 1 tahun.",
    descEn: "10 HP piston compressor with 200 liter twin tank. Max pressure 12 kg/cm². Suitable for body repair workshops, spray painting, and pneumatic tools. New condition, 1 year warranty.",
    price: 18000000, priceType: "fixed", condition: "baru",
    city: "Bandung", province: "Jawa Barat", catSlug: "kompressor-generator", imgKey: "kompressor", imgs: [1],
    specs: { "Power": "10 HP", "Tank": "200L Twin", "Pressure": "12 kg/cm²", "Garansi": "1 Tahun" },
    views: 390,
  },

  // ===== CNC & LASER =====
  {
    title: "Mesin CNC Router Woodworking 1325 3 Axis",
    titleEn: "1325 3-Axis CNC Woodworking Router",
    desc: "Mesin CNC router 1325 3 axis untuk kayu, MDF, akrilik, dan aluminium composite. Area kerja 1300x2500mm. Spindle 3.2kW air cooling. Driver leadshine. Cocok untuk furniture, signage, dan craft.",
    descEn: "1325 3-axis CNC router for wood, MDF, acrylic, and aluminum composite. 1300x2500mm working area. 3.2kW air cooling spindle. Leadshine driver. Suitable for furniture, signage, and craft.",
    price: 55000000, priceType: "fixed", condition: "baru",
    city: "Bekasi", province: "Jawa Barat", catSlug: "mesin-cnc-laser", imgKey: "cnc", imgs: [0, 1],
    specs: { "Area": "1300x2500mm", "Spindle": "3.2kW Air Cooling", "Driver": "Leadshine", "Frame": "Steel Welded" },
    featured: true, views: 1850, packageType: "spotlight",
  },
  {
    title: "Mesin Laser Cutting CO2 1300x900 130W",
    titleEn: "CO2 Laser Cutting Machine 1300x900 130W",
    desc: "Mesin laser cutting CO2 130W area kerja 1300x900mm. Untuk potong akrilik, MDF, plywood, kain, dan kulit. Reci W4 tube, lensa focus ZnSe. Kontrol Ruida RDC6445G. Kecepatan potong hingga 800mm/s.",
    descEn: "130W CO2 laser cutting machine with 1300x900mm working area. For cutting acrylic, MDF, plywood, fabric, and leather. Reci W4 tube, ZnSe focus lens. Ruida RDC6445G controller. Cutting speed up to 800mm/s.",
    price: 78000000, priceType: "negotiable", condition: "baru",
    city: "Surabaya", province: "Jawa Timur", catSlug: "mesin-cnc-laser", imgKey: "laser", imgs: [0, 1],
    specs: { "Power": "130W CO2", "Area": "1300x900mm", "Tube": "Reci W4", "Controller": "Ruida RDC6445G" },
    featured: true, views: 1420, packageType: "highlight",
  },
  {
    title: "Mesin CNC Milling VMC 850 Second Import Jepang",
    titleEn: "Used Japanese Import CNC Milling VMC 850",
    desc: "Mesin CNC milling vertical VMC 850 import Jepang (Mazak). Travel X=850 Y=500 Z=500mm. Spindle 8000 RPM, BT40 taper. Kondisi bagus, siap produksi. Cocok untuk mold making dan precision parts.",
    descEn: "Japanese import (Mazak) CNC vertical milling VMC 850. Travel X=850 Y=500 Z=500mm. 8000 RPM spindle, BT40 taper. Good condition, production ready. Suitable for mold making and precision parts.",
    price: 285000000, priceType: "negotiable", condition: "bekas", brand: "Mazak", year: 2010,
    city: "Jakarta Selatan", province: "DKI Jakarta", catSlug: "mesin-cnc-laser", imgKey: "cnc", imgs: [2, 3],
    specs: { "Travel": "850x500x500mm", "Spindle": "8000 RPM BT40", "Brand": "Mazak", "Tahun": "2010" },
    views: 1120, packageType: "colek",
  },
  {
    title: "Mesin Laser Fiber Marking 20W (Tanda Seri)",
    titleEn: "20W Fiber Laser Marking Machine (Serial Number)",
    desc: "Mesin laser marking fiber 20W portable untuk tanda seri, logo, QR code pada metal dan plastik. Area marking 110x110mm. Speed tinggi, presisi 0.001mm. Raycus source, EZCAD software.",
    descEn: "20W portable fiber laser marking machine for serial numbers, logos, QR codes on metal and plastic. 110x110mm marking area. High speed, 0.001mm precision. Raycus source, EZCAD software.",
    price: 28000000, priceType: "fixed", condition: "baru",
    city: "Bandung", province: "Jawa Barat", catSlug: "mesin-cnc-laser", imgKey: "laser", imgs: [2],
    specs: { "Power": "20W Fiber", "Area": "110x110mm", "Source": "Raycus", "Software": "EZCAD2" },
    views: 620,
  },

  // ===== MESIN BUBUT =====
  {
    title: "Mesin Bubut Logam Conventional WD6150 1500mm Swing 500mm",
    titleEn: "WD6150 Conventional Metal Lathe 1500mm Swing 500mm",
    desc: "Mesin bubut logam konvensional WD6150 swing 500mm, center distance 1500mm. Untuk bubut besi, baja, dan stainless steel. Kondisi bekas import China, masih bagus dan presisi. Cocok untuk bengkel dan workshop.",
    descEn: "WD6150 conventional metal lathe, 500mm swing, 1500mm center distance. For turning iron, steel, and stainless steel. Used Chinese import, still in good and precise condition. Suitable for workshops.",
    price: 45000000, priceType: "negotiable", condition: "bekas", brand: "WD",
    city: "Surabaya", province: "Jawa Timur", catSlug: "mesin-bubut", imgKey: "bubut", imgs: [0, 1],
    specs: { "Swing": "500mm", "Center": "1500mm", "Spindle Bore": "80mm", "Range": "12-1500 RPM" },
    featured: true, views: 950, packageType: "spotlight",
  },
  {
    title: "Mesin Bubut CNC 2 Axis Slant Bed Mazak QT-200",
    titleEn: "Mazak QT-200 2-Axis CNC Slant Bed Lathe",
    desc: "Mesin bubut CNC 2 axis slant bed Mazak QT-200. Chuck 8 inch, spindle 4000 RPM. Fanuc 0i-TD control. Kondisi second import Jepang, sudah diperiksa teknisi. Garansi 3 bulan.",
    descEn: "Mazak QT-200 2-axis CNC slant bed lathe. 8 inch chuck, 4000 RPM spindle. Fanuc 0i-TD control. Used Japanese import, technician inspected. 3 month warranty.",
    price: 320000000, priceType: "negotiable", condition: "bekas", brand: "Mazak", year: 2008,
    city: "Jakarta Timur", province: "DKI Jakarta", catSlug: "mesin-bubut", imgKey: "bubut", imgs: [2, 3],
    specs: { "Chuck": "8 inch", "Spindle": "4000 RPM", "Control": "Fanuc 0i-TD", "Tahun": "2008" },
    featured: true, views: 780, packageType: "highlight",
  },
  {
    title: "Mesin Bubut Mini Table Top 180x300 (Bench Lathe)",
    titleEn: "180x300 Mini Bench Lathe",
    desc: "Mesin bubut mini bench lathe 180x300mm untuk hobi dan workshop kecil. Bisa bubut logam lunak, plastik, dan kayu. Dilengkapi 3-jaw chuck dan tailstock. Motor 550W. Cocok untuk pemula.",
    descEn: "180x300mm mini bench lathe for hobby and small workshop. Can turn soft metal, plastic, and wood. Equipped with 3-jaw chuck and tailstock. 550W motor. Suitable for beginners.",
    price: 8500000, priceType: "fixed", condition: "baru",
    city: "Semarang", province: "Jawa Tengah", catSlug: "mesin-bubut", imgKey: "bubut", imgs: [1],
    specs: { "Swing": "180mm", "Center": "300mm", "Motor": "550W", "Chuck": "3-Jaw 80mm" },
    views: 440,
  },

  // ===== MESIN MAKANAN =====
  {
    title: "Mesin Penggiling Daging (Meat Mincer) 22mm Industrial",
    titleEn: "22mm Industrial Meat Mincer / Grinder",
    desc: "Mesin penggiling daging industrial kapasitas 200-300 kg/jam. Pisau dan plate stainless steel food grade. Motor 3 HP. Cocok untuk usaha bakso, sosis, dan daging olahan. Body full stainless steel.",
    descEn: "Industrial meat grinder with 200-300 kg/hour capacity. Stainless steel food grade blade and plate. 3 HP motor. Suitable for meatball, sausage, and processed meat business. Full stainless steel body.",
    price: 12000000, priceType: "fixed", condition: "baru",
    city: "Bekasi", province: "Jawa Barat", catSlug: "mesin-makanan", imgKey: "makanan", imgs: [0, 1],
    specs: { "Kapasitas": "200-300 kg/jam", "Motor": "3 HP", "Pisau": "SS 304", "Plate": "22mm" },
    featured: true, views: 870, packageType: "colek",
  },
  {
    title: "Mesin Pasteurizer Susu 200L Stainless",
    titleEn: "200L Stainless Steel Milk Pasteurizer",
    desc: "Mesin pasteurisasi susu kapasitas 200 liter per batch. Sistem pemanasan langsung dengan pengaduk. Kontrol suhu digital otomatis. Material full stainless steel 304. Cocok untuk usaha susu segar dan yogurt.",
    descEn: "200 liter per batch milk pasteurization machine. Direct heating system with stirrer. Automatic digital temperature control. Full SS 304 material. Suitable for fresh milk and yogurt business.",
    price: 45000000, priceType: "negotiable", condition: "baru",
    city: "Bandung", province: "Jawa Barat", catSlug: "mesin-makanan", imgKey: "makanan", imgs: [2, 3],
    specs: { "Kapasitas": "200 Liter/Batch", "Material": "SS 304", "Heating": "Direct + Stirrer", "Control": "Digital" },
    views: 560,
  },
  {
    title: "Mesin Mixer Adonan Roti Spiral 25kg",
    titleEn: "25kg Spiral Dough Mixer for Bread",
    desc: "Mesin mixer spiral untuk adonan roti kapasitas 25kg. 2 speed, bowl dan spiral stainless steel. Motor 3 HP. Cocok untuk bakery dan roti manis. Dilengkapi timer dan safety guard.",
    descEn: "Spiral dough mixer for bread, 25kg capacity. 2 speed, stainless steel bowl and spiral. 3 HP motor. Suitable for bakery and sweet bread. Equipped with timer and safety guard.",
    price: 22000000, priceType: "fixed", condition: "baru",
    city: "Surabaya", province: "Jawa Timur", catSlug: "mesin-makanan", imgKey: "makanan", imgs: [1],
    specs: { "Kapasitas": "25kg", "Speed": "2 Speed", "Motor": "3 HP", "Bowl": "SS 304" },
    views: 480,
  },

  // ===== MESIN TEKSTIL =====
  {
    title: "Mesin Jahit Industri Juki DDL-8700 (1 Jarum)",
    titleEn: "Juki DDL-8700 Industrial Sewing Machine (1 Needle)",
    desc: "Mesin jahit industri Juki DDL-8700 high speed 1 jarum. Untuk jahit lurus pada kain tipis hingga sedang. Kecepatan 4500 stitch/menit. Kondisi baru, garansi resmi. Cocok untuk konveksi kaos dan kemeja.",
    descEn: "Juki DDL-8700 industrial high speed sewing machine, 1 needle. For straight stitching on light to medium fabrics. 4500 stitch/min speed. New condition with official warranty. Suitable for t-shirt and shirt convection.",
    price: 4500000, priceType: "fixed", condition: "baru", brand: "Juki",
    city: "Bandung", province: "Jawa Barat", catSlug: "mesin-tekstil", imgKey: "tekstil", imgs: [0, 1],
    specs: { "Tipe": "DDL-8700", "Speed": "4500 s.p.m", "Jarum": "1 Jarum", "Stitch": "Straight" },
    featured: true, views: 1120, packageType: "highlight",
  },
  {
    title: "Mesin Bordir Komputer 6 Kepala 15 Jarum",
    titleEn: "Computer Embroidery Machine 6 Heads 15 Needles",
    desc: "Mesin bordir komputer 6 kepala 15 jarum. Area bordir 40x50cm per kepala. Untuk produksi massal bordir baju, topi, dan kain. Software Tajima DST compatible. Kondisi second import China.",
    descEn: "6-head 15-needle computer embroidery machine. 40x50cm embroidery area per head. For mass production of garment, hat, and fabric embroidery. Tajima DST compatible software. Used Chinese import.",
    price: 145000000, priceType: "negotiable", condition: "bekas",
    city: "Surabaya", province: "Jawa Timur", catSlug: "mesin-tekstil", imgKey: "tekstil", imgs: [2, 3],
    specs: { "Kepala": "6", "Jarum": "15", "Area": "40x50cm", "Software": "Tajima DST" },
    views: 670, packageType: "colek",
  },
  {
    title: "Mesin Overlock 4 Benang Brother",
    titleEn: "Brother 4-Thread Overlock Machine",
    desc: "Mesin overlock 4 benang merk Brother untuk finising tepian kain. Kecepatan tinggi, hasil rapi dan kuat. Cocok untuk konveksi dan garment. Kondisi baru dengan garansi resmi.",
    descEn: "Brother 4-thread overlock machine for fabric edge finishing. High speed, neat and strong results. Suitable for convection and garment. New condition with official warranty.",
    price: 6500000, priceType: "fixed", condition: "baru", brand: "Brother",
    city: "Tangerang", province: "Banten", catSlug: "mesin-tekstil", imgKey: "tekstil", imgs: [0],
    specs: { "Benang": "4 Benang", "Speed": "7000 s.p.m", "Differential": "Ada", "Garansi": "1 Tahun" },
    views: 380,
  },

  // ===== MESIN KAYU =====
  {
    title: "Mesin Table Saw Sliding 3000mm + Scoring",
    titleEn: "3000mm Sliding Table Saw with Scoring",
    desc: "Meja potong kayu sliding table 3000mm lengkap scoring blade. Motor utama 5.5 HP, motor scoring 1 HP. Presisi potong tinggi, cocok untuk furniture factory dan workshop. Merk SCM.",
    descEn: "3000mm sliding table saw with scoring blade. 5.5 HP main motor, 1 HP scoring motor. High cutting precision, suitable for furniture factory and workshop. SCM brand.",
    price: 65000000, priceType: "negotiable", condition: "bekas", brand: "SCM",
    city: "Bekasi", province: "Jawa Barat", catSlug: "mesin-kayu", imgKey: "kayu", imgs: [0, 1],
    specs: { "Sliding": "3000mm", "Blade": "10 inch", "Motor": "5.5 HP + 1 HP", "Scoring": "Termasuk" },
    featured: true, views: 780, packageType: "spotlight",
  },
  {
    title: "Mesin Planner Thicknesser 20 Inch 3 in 1",
    titleEn: "20 Inch 3-in-1 Planer Thicknesser",
    desc: "Mesin kayu 3 in 1: planer, thicknesser, dan saw. Lebar kerja 20 inch (510mm). 3 pisau HSS. Motor 3 HP. Cocok untuk woodworking shop dan furniture maker. Kondisi baru.",
    descEn: "3-in-1 woodworking machine: planer, thicknesser, and saw. 20 inch (510mm) working width. 3 HSS blades. 3 HP motor. Suitable for woodworking shop and furniture maker. New condition.",
    price: 18000000, priceType: "fixed", condition: "baru",
    city: "Semarang", province: "Jawa Tengah", catSlug: "mesin-kayu", imgKey: "kayu", imgs: [2, 3],
    specs: { "Lebar": "510mm (20 inch)", "Fungsi": "Planer + Thicknesser + Saw", "Motor": "3 HP", "Pisau": "3 HSS" },
    views: 540,
  },
  {
    title: "Mesin Bubut Kayu Copy Lathe CNC",
    titleEn: "CNC Wood Copy Lathe",
    desc: "Mesin bubut kayu copy lathe dengan sistem CNC. Untuk produksi tiang, benda putar, dan baluster. Bisa copy dari master atau dari program. Spindle 1.5kW, speed variable.",
    descEn: "CNC wood copy lathe machine. For pillar, turned objects, and baluster production. Can copy from master or program. 1.5kW spindle, variable speed.",
    price: 35000000, priceType: "fixed", condition: "baru",
    city: "Surabaya", province: "Jawa Timur", catSlug: "mesin-kayu", imgKey: "kayu", imgs: [1, 2],
    specs: { "Spindle": "1.5kW Variable", "Length": "2000mm", "Diameter": "300mm", "Control": "CNC" },
    views: 420,
  },

  // ===== ALAT BERAT =====
  {
    title: "Excavator Komatsu PC200-8 Bekas",
    titleEn: "Used Komatsu PC200-8 Excavator",
    desc: "Excavator Komatsu PC200-8 tahun 2015. Working hours 6500 jam. Kondisi baik, siap kerja. Bucket 0.8m³. Cocok untuk proyek galian, perataan lahan, dan konstruksi. Lokasi unit di Bekasi.",
    descEn: "Komatsu PC200-8 excavator year 2015. 6500 working hours. Good condition, ready to work. 0.8m³ bucket. Suitable for excavation, land leveling, and construction. Unit located in Bekasi.",
    price: 850000000, priceType: "negotiable", condition: "bekas", brand: "Komatsu", year: 2015,
    city: "Bekasi", province: "Jawa Barat", catSlug: "alat-berat", imgKey: "alatberat", imgs: [0, 1],
    specs: { "Model": "PC200-8", "Year": "2015", "Working Hours": "6500 jam", "Bucket": "0.8m³", "Weight": "20 ton" },
    featured: true, views: 2340, packageType: "spotlight",
  },
  {
    title: "Forklift Toyota 3 Ton Diesel",
    titleEn: "Toyota 3 Ton Diesel Forklift",
    desc: "Forklift Toyota 8FGU25 kapasitas 3 ton. Tahun 2018, diesel engine. Mast 3 stage tinggi 6 meter. Kondisi prima, service record lengkap. Cocok untuk gudang dan pabrik.",
    descEn: "Toyota 8FGU25 forklift, 3 ton capacity. Year 2018, diesel engine. 3 stage mast, 6m height. Excellent condition, complete service record. Suitable for warehouses and factories.",
    price: 125000000, priceType: "negotiable", condition: "bekas", brand: "Toyota", year: 2018,
    city: "Jakarta Timur", province: "DKI Jakarta", catSlug: "alat-berat", imgKey: "alatberat", imgs: [2, 3],
    specs: { "Kapasitas": "3 Ton", "Engine": "Diesel 4D", "Mast": "3 Stage 6m", "Year": "2018" },
    featured: true, views: 1560, packageType: "highlight",
  },
  {
    title: "Concrete Mixer 350L Diesel Engine",
    titleEn: "350L Diesel Concrete Mixer",
    desc: "Mesin pengaduk beton (concrete mixer) kapasitas 350 liter. Penggerak engine diesel 7 HP. Drum baja tebal, frame kokoh. Cocok untuk proyek bangunan skala menengah.",
    descEn: "350 liter capacity concrete mixer. 7 HP diesel engine drive. Thick steel drum, sturdy frame. Suitable for medium-scale construction projects.",
    price: 15000000, priceType: "fixed", condition: "baru",
    city: "Medan", province: "Sumatera Utara", catSlug: "alat-berat", imgKey: "alatberat", imgs: [1],
    specs: { "Kapasitas": "350 Liter", "Engine": "Diesel 7 HP", "Drum": "Baja", "Frame": "Besi" },
    views: 320,
  },

  // ===== SPAREPART =====
  {
    title: "Pisau CNC V-Bit Set 10pcs (Hard Carbide)",
    titleEn: "10pcs CNC V-Bit Set (Hard Carbide)",
    desc: "Set pisau CNC V-Bit 10 pcs berbagai sudut (15°, 20°, 30°, 45°, 60°). Material tungsten carbide. Cocok untuk ukiran detail, signage, dan cutting MDF/akrilik. Cocok untuk CNC router 3018, 1325, 6040.",
    descEn: "10pcs CNC V-Bit set with various angles (15°, 20°, 30°, 45°, 60°). Tungsten carbide material. Suitable for detailed engraving, signage, and MDF/acrylic cutting. Compatible with 3018, 1325, 6040 CNC routers.",
    price: 850000, priceType: "fixed", condition: "baru",
    city: "Jakarta Selatan", province: "DKI Jakarta", catSlug: "sparepart", imgKey: "sparepart", imgs: [0, 1],
    specs: { "Jumlah": "10 pcs", "Sudut": "15°, 20°, 30°, 45°, 60°", "Material": "Tungsten Carbide", "Shank": "3.175mm / 6mm" },
    views: 560,
  },
  {
    title: "Sparepart Roller Offset Heidelberg (Set)",
    titleEn: "Heidelberg Offset Roller Spare Part (Set)",
    desc: "Set roller mesin cetak offset Heidelberg SM 52. Termasuk dampening roller, inking roller, dan form roller. Material polyurethane dan rubber. Cocok untuk overhaul mesin cetak.",
    descEn: "Heidelberg SM 52 offset printing machine roller set. Includes dampening roller, inking roller, and form roller. Polyurethane and rubber material. Suitable for printing machine overhaul.",
    price: 15000000, priceType: "negotiable", condition: "baru", brand: "Heidelberg",
    city: "Surabaya", province: "Jawa Timur", catSlug: "sparepart", imgKey: "sparepart", imgs: [2, 3],
    specs: { "Kompatibel": "Heidelberg SM 52", "Isi": "5 Roller", "Material": "PU + Rubber", "Garansi": "6 Bulan" },
    views: 430,
  },
  {
    title: "Filter Oli Kompressor Atlas Copco (Original)",
    titleEn: "Atlas Copco Compressor Oil Filter (Original)",
    desc: "Filter oli original Atlas Copco untuk kompressor seri GA30-GA90. Pack isi 3 pcs. Ganti setiap 2000 jam operasi. Menjaga kualitas oli dan umur kompressor.",
    descEn: "Original Atlas Copco oil filter for GA30-GA90 compressor series. Pack of 3. Replace every 2000 operating hours. Maintains oil quality and compressor lifespan.",
    price: 1200000, priceType: "fixed", condition: "baru", brand: "Atlas Copco",
    city: "Bekasi", province: "Jawa Barat", catSlug: "sparepart", imgKey: "sparepart", imgs: [1],
    specs: { "Serupa": "GA30 - GA90", "Isi": "3 pcs", "Interval": "2000 jam", "Brand": "Atlas Copco Original" },
    views: 290,
  },
  {
    title: "Nozzle Mesin Injeksi Plastik (Universal)",
    titleEn: "Universal Plastic Injection Machine Nozzle",
    desc: "Nozzle mesin injeksi plastik universal. Cocok untuk berbagai merk mesin injeksi (Haitian, Chen Hsong, JSW). Material baja tahan panas H13. Ukuran 5mm-12mm tersedia.",
    descEn: "Universal plastic injection machine nozzle. Compatible with various injection machine brands (Haitian, Chen Hsong, JSW). H13 heat-resistant steel. Available in 5mm-12mm sizes.",
    price: 2500000, priceType: "fixed", condition: "baru",
    city: "Tangerang", province: "Banten", catSlug: "sparepart", imgKey: "sparepart", imgs: [3],
    specs: { "Material": "H13 Steel", "Size": "5-12mm", "Kompatibel": "Haitian, Chen Hsong, JSW", "Tip": "Free Flow" },
    views: 340,
  },
];

async function seed() {
  console.log("=== SEEDING DATABASE ===");

  // 1. Delete ALL existing listings
  const deleted = await db.listing.deleteMany({});
  console.log(`Deleted ${deleted.count} existing listings`);

  // 2. Upsert categories
  const catMap: Record<string, string> = {};
  for (const c of categories) {
    const cat = await db.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, icon: c.icon, color: c.color, sortOrder: c.sortOrder },
      create: c,
    });
    catMap[c.slug] = cat.id;
    console.log(`Category: ${cat.name} (${cat.id})`);
  }

  // 3. Upsert sellers
  const sellerMap: string[] = [];
  for (const s of sellers) {
    const seller = await db.seller.upsert({
      where: { id: (await db.seller.findFirst({ where: { name: s.name } }))?.id || "" },
      update: s,
      create: s,
    });
    sellerMap.push(seller.id);
    console.log(`Seller: ${seller.name} (${seller.id})`);
  }

  // 4. Create listings
  let created = 0;
  for (const l of listings) {
    const catId = catMap[l.catSlug];
    if (!catId) {
      console.error(`SKIP: category ${l.catSlug} not found`);
      continue;
    }
    const sellerId = sellerMap[created % sellerMap.length];
    const images = pick(IMG[l.imgKey], l.imgs);
    const slug = slugify(l.title) + "-" + Math.random().toString(36).slice(2, 7);

    await db.listing.create({
      data: {
        title: l.title,
        titleEn: l.titleEn || null,
        description: l.desc,
        descEn: l.descEn || null,
        slug,
        price: BigInt(l.price),
        priceType: l.priceType,
        condition: l.condition,
        brand: l.brand || null,
        yearProduced: l.year || null,
        city: l.city,
        province: l.province,
        images: JSON.stringify(images),
        specs: JSON.stringify(l.specs),
        featured: l.featured || false,
        views: l.views || 0,
        status: "active",
        paymentStatus: "paid",
        paymentExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        packageType: l.packageType || "colek",
        categoryId: catId,
        sellerId,
      },
    });
    created++;
    console.log(`Listing ${created}: ${l.title}`);
  }

  // 5. Upsert paket
  const pakets = [
    { key: "colek", name: "Gold", price: 60000, originalPrice: 120000, duration: 30, features: JSON.stringify(["Tampil di bagian Premium", "Badge Gold", "Maksimal 5 foto", "Prioritas pencarian"]), active: true, sortOrder: 0 },
    { key: "highlight", name: "Platinum", price: 50000, originalPrice: 100000, duration: 7, features: JSON.stringify(["Tampil di bagian Premium", "Badge Platinum", "Maksimal 10 foto", "Prioritas pencarian", "Highlight border"]), active: true, sortOrder: 1 },
    { key: "spotlight", name: "Titanium", price: 100000, originalPrice: 200000, duration: 7, features: JSON.stringify(["Tampil di bagian Premium", "Badge Titanium", "Maksimal 15 foto", "Prioritas tertinggi", "Spotlight border", "Dilihat lebih banyak"]), active: true, sortOrder: 2 },
  ];
  for (const p of pakets) {
    await db.paket.upsert({
      where: { key: p.key },
      update: p,
      create: p,
    });
  }

  console.log(`\n=== DONE: ${created} listings created ===`);
}

seed()
  .catch((e) => {
    console.error("SEED FAILED:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
