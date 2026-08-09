"use server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Category IDs
const CAT = {
  cetak: "cms1vpb200000pzgwuuj6hs7h",
  digitalPrinting: "cms1vpb4c0001pzgwnnurqhmz",
  cnc: "cms1vpb940005pzgwhwpyk3nw",
  kompresor: "cms1vpb7x0004pzgwf2t1ktwx",
  alatBerat: "cms1vpbf1000apzgw28bn022k",
  bubut: "cms1vpbab0006pzgwqfmh51yp",
  makanan: "cms1vpbbh0007pzgw3kfuyob7",
};

// Sample sellers (existing)
const SELLERS = [
  "cms1vpbjv000dpzgwjxztz60z", // PT. Karya Teknik Sukses - Bekasi
  "cms1vpbl2000epzgwby03ww7q", // Toko Mesin Jaya Abadi - Semarang
  "cms1vpbhf000cpzgwhdy1lkb6", // CV. Mesindo Mandiri - Surabaya
];

const SAMPLE_ADS = [
  // ===== JASA CETAK (3 iklan) =====
  {
    title: "Jasa Cetak Banner & Spanduk Large Format",
    titleEn: "Large Format Banner & Spanduk Printing Service",
    description:
      "Jasa cetak banner, spanduk, dan backdrop ukuran besar dengan mesin outdoor Eco-Solvent. Hasil cetak tajam, tahan air dan UV. Menerima pesanan satuan maupun partai besar. Proses cepat 1-3 hari kerja.",
    descEn:
      "Large format banner, spanduk, and backdrop printing with outdoor Eco-Solvent machine. Sharp prints, water and UV resistant. Single and bulk orders accepted. Fast 1-3 working days process.",
    price: 35000, // per m²
    priceType: "fixed",
    condition: "jasa",
    city: "Jakarta Selatan",
    province: "DKI Jakarta",
    categoryId: CAT.cetak,
    sellerId: SELLERS[0],
    images: JSON.stringify(["https://sfile.chatglm.cn/images-ppt/c6cafcd8460f.png"]),
    specs: JSON.stringify({
      "Mesin": "Eco-Solvent Roland",
      "Resolusi": "1440 dpi",
      "Material": "Flexi, MMT, Albatros",
      "Min Order": "1 m²",
      "Durasi": "1-3 hari kerja",
    }),
  },
  {
    title: "Jasa Cetak Offset Brochure & Kemasan",
    titleEn: "Offset Brochure & Packaging Printing Service",
    description:
      "Jasa cetak offset untuk brosur, katalog, box kemasan, dan kartu nama. Mesin Heidelberg SM 52, hasil cetak berkualitas tinggi dengan warna konsisten. Free desain untuk order minimal 1000 lembar.",
    descEn:
      "Offset printing service for brochures, catalogs, packaging boxes, and business cards. Heidelberg SM 52 machine, high quality prints with consistent colors. Free design for minimum 1000 sheets order.",
    price: 500, // per lembar
    priceType: "fixed",
    condition: "jasa",
    city: "Surabaya",
    province: "Jawa Timur",
    categoryId: CAT.cetak,
    sellerId: SELLERS[2],
    images: JSON.stringify(["https://sfile.chatglm.cn/images-ppt/c6cafcd8460f.png"]),
    specs: JSON.stringify({
      "Mesin": "Heidelberg SM 52",
      "Cetak": "Full Color (CMYK)",
      "Kertas": "Art Paper 150gsm, 260gsm",
      "Min Order": "500 lembar",
      "Finishing": "Laminasi, Potong, Lipat",
    }),
  },
  {
    title: "Jasa Cetak UV & Cutting Sticker Custom",
    titleEn: "UV & Custom Sticker Cutting Service",
    description:
      "Jasa cetak UV flatbed pada berbagai material: akrilik, kaca, logam, kayu. Dilengkapi cutting sticker untuk hasil presisi. Cocok untuk signage, nameplate, dan dekorasi interior.",
    descEn:
      "UV flatbed printing on various materials: acrylic, glass, metal, wood. Equipped with sticker cutting for precision results. Ideal for signage, nameplates, and interior decoration.",
    price: 150000, // per m²
    priceType: "negotiable",
    condition: "jasa",
    city: "Semarang",
    province: "Jawa Tengah",
    categoryId: CAT.digitalPrinting,
    sellerId: SELLERS[1],
    images: JSON.stringify(["https://sfile.chatglm.cn/images-ppt/c6cafcd8460f.png"]),
    specs: JSON.stringify({
      "Mesin": "UV Flatbed 2513",
      "Material": "Akrilik, Kaca, Logam, Kayu",
      "Resolusi": "1080 dpi",
      "Min Order": "1 pcs",
      "Area Layanan": "Jawa Tengah",
    }),
  },

  // ===== SERVICE / PERAWATAN (3 iklan) =====
  {
    title: "Jasa Service & Kalibrasi Mesin CNC Router",
    titleEn: "CNC Router Service & Calibration",
    description:
      "Jasa service, perawatan, dan kalibrasi mesin CNC router semua merk. Tim teknisi berpengalaman 10+ tahun. Ganti sparepart, setting ulang parameter, dan training operator. Garansi service 3 bulan.",
    descEn:
      "Service, maintenance, and calibration for all CNC router brands. Experienced technicians with 10+ years. Spare part replacement, parameter reset, and operator training. 3 months service warranty.",
    price: 500000, // biaya kunjungan
    priceType: "negotiable",
    condition: "jasa",
    city: "Bekasi",
    province: "Jawa Barat",
    categoryId: CAT.cnc,
    sellerId: SELLERS[0],
    images: JSON.stringify(["https://sfile.chatglm.cn/images-ppt/c6cafcd8460f.png"]),
    specs: JSON.stringify({
      "Layanan": "Service, Kalibrasi, Training",
      "Merk": "Semua merk CNC Router",
      "Pengalaman": "10+ tahun",
      "Garansi": "3 bulan",
      "Area": "Jabodetabek",
    }),
  },
  {
    title: "Jasa Servis Kompressor & Genset Industri",
    titleEn: "Industrial Compressor & Generator Service",
    description:
      "Jasa perbaikan dan overhaul kompressor angin serta genset diesel industri. Tersedia sparepart original. Tim siap ke lokasi pabrik. Melayani kontrak perawatan berkala bulanan.",
    descEn:
      "Repair and overhaul service for industrial air compressors and diesel generators. Original spare parts available. On-site factory service. Monthly maintenance contract available.",
    price: 750000, // biaya cek awal
    priceType: "negotiable",
    condition: "jasa",
    city: "Surabaya",
    province: "Jawa Timur",
    categoryId: CAT.kompresor,
    sellerId: SELLERS[2],
    images: JSON.stringify(["https://sfile.chatglm.cn/images-ppt/c6cafcd8460f.png"]),
    specs: JSON.stringify({
      "Layanan": "Perbaikan, Overhaul, Perawatan",
      "Tipe": "Kompressor Angin, Genset Diesel",
      "Kapasitas": "5 HP - 500 HP",
      "Garansi": "1 bulan",
      "Area": "Jawa Timur",
    }),
  },
  {
    title: "Jasa Rewinding Motor Listrik Industri",
    titleEn: "Industrial Electric Motor Rewinding Service",
    description:
      "Jasa rewinding gulungan motor listrik industri dari 1 HP hingga 500 HP. Proses winding presisi dengan kelas isolasi F/H. Dinamo, generator, dan trafo juga dilayani. Estimasi biaya cepat.",
    descEn:
      "Industrial electric motor rewinding from 1 HP to 500 HP. Precision winding with class F/H insulation. Dynamo, generator, and transformer also serviced. Quick cost estimation.",
    price: 250000, // biaya cek
    priceType: "negotiable",
    condition: "jasa",
    city: "Semarang",
    province: "Jawa Tengah",
    categoryId: CAT.bubut,
    sellerId: SELLERS[1],
    images: JSON.stringify(["https://sfile.chatglm.cn/images-ppt/c6cafcd8460f.png"]),
    specs: JSON.stringify({
      "Layanan": "Rewinding, Recondition",
      "Kapasitas": "1 HP - 500 HP",
      "Kelas Isolasi": "F / H",
      "Jenis": "Motor, Dinamo, Generator, Trafo",
      "Garansi": "3 bulan",
    }),
  },

  // ===== SEWA ALAT BERAT (3 iklan) =====
  {
    title: "Sewa Excavator Komatsu PC200 Harian/Bulanan",
    titleEn: "Komatsu PC200 Excavator Rental Daily/Monthly",
    description:
      "Sewa excavator Komatsu PC200-8 kondisi prima dengan operator berpengalaman. Tersedia paket harian dan bulanan. Termasuk BBM dan maintenance. Cocok untuk proyek galian, pondasi, dan perataan lahan.",
    descEn:
      "Rent Komatsu PC200-8 excavator in excellent condition with experienced operator. Daily and monthly packages available. Includes fuel and maintenance. Ideal for excavation, foundation, and land leveling projects.",
    price: 3500000, // per hari
    priceType: "negotiable",
    condition: "sewa",
    city: "Bekasi",
    province: "Jawa Barat",
    categoryId: CAT.alatBerat,
    sellerId: SELLERS[0],
    images: JSON.stringify(["https://sfile.chatglm.cn/images-ppt/c6cafcd8460f.png"]),
    specs: JSON.stringify({
      "Merk": "Komatsu PC200-8",
      "Kapasitas Bucket": "0.8 m³",
      "Operator": "Termasuk",
      "BBM": "Termasuk",
      "Min Sewa": "1 hari",
    }),
  },
  {
    title: "Sewa Forklift 3 Ton & 5 Ton (With Operator)",
    titleEn: "3 Ton & 5 Ton Forklift Rental (With Operator)",
    description:
      "Sewa forklift 3 ton dan 5 ton dengan operator terlatih untuk kebutuhan gudang dan proyek. Mesin terawat, siap pakai. Paket harian, mingguan, atau bulanan tersedia.",
    descEn:
      "Rent 3 ton and 5 ton forklifts with trained operators for warehouse and project needs. Well-maintained machines, ready to use. Daily, weekly, or monthly packages available.",
    price: 1500000, // per hari
    priceType: "negotiable",
    condition: "sewa",
    city: "Surabaya",
    province: "Jawa Timur",
    categoryId: CAT.alatBerat,
    sellerId: SELLERS[2],
    images: JSON.stringify(["https://sfile.chatglm.cn/images-ppt/c6cafcd8460f.png"]),
    specs: JSON.stringify({
      "Kapasitas": "3 Ton / 5 Ton",
      "Operator": "Termasuk",
      "Tipe": "Diesel",
      "Min Sewa": "1 hari",
      "Area": "Jawa Timur",
    }),
  },
  {
    title: "Sewa Tower Crane & Mobile Crane Proyek",
    titleEn: "Tower Crane & Mobile Crane Rental",
    description:
      "Sewa tower crane kapasitas 5-10 ton dan mobile crane 25-50 ton untuk proyek konstruksi. Termasuk erector, operator, dan rigger profesional. Disewakan per bulan dengan kontrak minimal 3 bulan.",
    descEn:
      "Rent 5-10 ton tower crane and 25-50 ton mobile crane for construction projects. Includes erector, operator, and professional rigger. Monthly rental with minimum 3 month contract.",
    price: 45000000, // per bulan
    priceType: "negotiable",
    condition: "sewa",
    city: "Jakarta Timur",
    province: "DKI Jakarta",
    categoryId: CAT.alatBerat,
    sellerId: SELLERS[0],
    images: JSON.stringify(["https://sfile.chatglm.cn/images-ppt/c6cafcd8460f.png"]),
    specs: JSON.stringify({
      "Tipe": "Tower Crane / Mobile Crane",
      "Kapasitas": "5 - 50 Ton",
      "Crew": "Erector, Operator, Rigger",
      "Min Kontrak": "3 bulan",
      "Area": "Jabodetabek",
    }),
  },
];

export async function POST() {
  try {
    let created = 0;
    let skipped = 0;

    for (const ad of SAMPLE_ADS) {
      // Check if already exists by title
      const existing = await db.listing.findFirst({
        where: { title: ad.title },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const slugBase = ad.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const slug = slugBase + "-" + Math.random().toString(36).slice(2, 7);

      await db.listing.create({
        data: {
          title: ad.title,
          titleEn: ad.titleEn || null,
          description: ad.description,
          descEn: ad.descEn || null,
          slug,
          price: BigInt(ad.price),
          priceType: ad.priceType,
          condition: ad.condition,
          city: ad.city,
          province: ad.province,
          images: ad.images,
          specs: ad.specs,
          status: "active",
          paymentStatus: "paid",
          paymentExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          packageType: "colek",
          featured: false,
          categoryId: ad.categoryId,
          sellerId: ad.sellerId,
        },
      });
      created++;
    }

    return NextResponse.json({
      success: true,
      message: `Seeded ${created} iklan baru, ${skipped} sudah ada (skip).`,
      created,
      skipped,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Seed gagal: " + (e?.message || "unknown") },
      { status: 500 }
    );
  }
}
