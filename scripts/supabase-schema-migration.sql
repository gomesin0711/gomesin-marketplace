-- ============================================================
-- mesinKU Database Schema Migration (PostgreSQL)
-- Target: Supabase project baru (yzxeinqoryvprhuibtzn.supabase.co)
-- Generated from prisma/schema.prisma
-- ============================================================

-- Extension untuk cuid (tidak default di Postgres)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Table: Category
-- ============================================================
CREATE TABLE IF NOT EXISTS "Category" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL UNIQUE,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "Category_sortOrder_idx" ON "Category"("sortOrder");

-- ============================================================
-- Table: Seller
-- ============================================================
CREATE TABLE IF NOT EXISTS "Seller" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "avatar" TEXT,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 4.5,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Table: User
-- ============================================================
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT,
    "company" TEXT,
    "address" TEXT,
    "bannerImage" TEXT,
    "logoImage" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Table: Listing
-- ============================================================
CREATE TABLE IF NOT EXISTS "Listing" (
    "id" TEXT PRIMARY KEY,
    "title" TEXT NOT NULL,
    "titleEn" TEXT,
    "titleZh" TEXT,
    "slug" TEXT NOT NULL UNIQUE,
    "description" TEXT NOT NULL,
    "descEn" TEXT,
    "descZh" TEXT,
    "price" BIGINT NOT NULL,
    "priceType" TEXT NOT NULL DEFAULT 'fixed',
    "condition" TEXT NOT NULL DEFAULT 'bekas',
    "brand" TEXT,
    "yearProduced" INTEGER,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "images" TEXT NOT NULL,
    "specs" TEXT NOT NULL,
    "specsEn" TEXT,
    "specsZh" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "views" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "paymentExpiry" TIMESTAMP(3),
    "uniqueCode" INTEGER,
    "packageType" TEXT NOT NULL DEFAULT 'gratis',
    "violationFlag" BOOLEAN NOT NULL DEFAULT false,
    "violationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoryId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "userId" TEXT,
    CONSTRAINT "Listing_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Listing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Listing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Listing_categoryId_idx" ON "Listing"("categoryId");
CREATE INDEX IF NOT EXISTS "Listing_city_idx" ON "Listing"("city");
CREATE INDEX IF NOT EXISTS "Listing_featured_idx" ON "Listing"("featured");
CREATE INDEX IF NOT EXISTS "Listing_userId_idx" ON "Listing"("userId");

-- ============================================================
-- Table: Message
-- ============================================================
CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT PRIMARY KEY,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "listingId" TEXT,
    "listingTitle" TEXT,
    "content" TEXT NOT NULL,
    "image" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Message_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Message_receiverId_idx" ON "Message"("receiverId");
CREATE INDEX IF NOT EXISTS "Message_senderId_idx" ON "Message"("senderId");

-- ============================================================
-- Table: Paket (paket iklan + special keys untuk banner config)
-- ============================================================
CREATE TABLE IF NOT EXISTS "Paket" (
    "id" TEXT PRIMARY KEY,
    "key" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "originalPrice" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "features" TEXT NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- Table: UniqueCode (reservation 3-digit unique payment codes)
-- ============================================================
CREATE TABLE IF NOT EXISTS "UniqueCode" (
    "id" TEXT PRIMARY KEY,
    "code" INTEGER NOT NULL UNIQUE,
    "userId" TEXT NOT NULL,
    "packageType" TEXT NOT NULL,
    "listingId" TEXT,
    "amount" INTEGER NOT NULL,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3)
);

-- ============================================================
-- Table: SiteSetting (key-value store for site-wide settings)
-- ============================================================
CREATE TABLE IF NOT EXISTS "SiteSetting" (
    "key" TEXT PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Trigger: auto-update "updatedAt" on User table
-- ============================================================
CREATE OR REPLACE FUNCTION update_updatedAt_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_updatedAt ON "User";
CREATE TRIGGER update_user_updatedAt BEFORE UPDATE ON "User"
    FOR EACH ROW EXECUTE FUNCTION update_updatedAt_column();

DROP TRIGGER IF EXISTS update_sitesetting_updatedAt ON "SiteSetting";
CREATE TRIGGER update_sitesetting_updatedAt BEFORE UPDATE ON "SiteSetting"
    FOR EACH ROW EXECUTE FUNCTION update_updatedAt_column();

-- ============================================================
-- Enable RLS (Row Level Security) — public read/write via anon key
-- WARNING: This is the same policy as the old project (open access).
-- For production with sensitive data, restrict policies accordingly.
-- ============================================================
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Seller" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Listing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Paket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UniqueCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteSetting" ENABLE ROW LEVEL SECURITY;

-- Public access policies (same as old project)
CREATE POLICY "public_categories_select" ON "Category" FOR SELECT USING (true);
CREATE POLICY "public_categories_insert" ON "Category" FOR INSERT WITH CHECK (true);
CREATE POLICY "public_categories_update" ON "Category" FOR UPDATE USING (true);
CREATE POLICY "public_categories_delete" ON "Category" FOR DELETE USING (true);

CREATE POLICY "public_sellers_select" ON "Seller" FOR SELECT USING (true);
CREATE POLICY "public_sellers_insert" ON "Seller" FOR INSERT WITH CHECK (true);
CREATE POLICY "public_sellers_update" ON "Seller" FOR UPDATE USING (true);
CREATE POLICY "public_sellers_delete" ON "Seller" FOR DELETE USING (true);

CREATE POLICY "public_listings_select" ON "Listing" FOR SELECT USING (true);
CREATE POLICY "public_listings_insert" ON "Listing" FOR INSERT WITH CHECK (true);
CREATE POLICY "public_listings_update" ON "Listing" FOR UPDATE USING (true);
CREATE POLICY "public_listings_delete" ON "Listing" FOR DELETE USING (true);

CREATE POLICY "public_users_select" ON "User" FOR SELECT USING (true);
CREATE POLICY "public_users_insert" ON "User" FOR INSERT WITH CHECK (true);
CREATE POLICY "public_users_update" ON "User" FOR UPDATE USING (true);
CREATE POLICY "public_users_delete" ON "User" FOR DELETE USING (true);

CREATE POLICY "public_messages_select" ON "Message" FOR SELECT USING (true);
CREATE POLICY "public_messages_insert" ON "Message" FOR INSERT WITH CHECK (true);
CREATE POLICY "public_messages_update" ON "Message" FOR UPDATE USING (true);
CREATE POLICY "public_messages_delete" ON "Message" FOR DELETE USING (true);

CREATE POLICY "public_paket_select" ON "Paket" FOR SELECT USING (true);
CREATE POLICY "public_paket_insert" ON "Paket" FOR INSERT WITH CHECK (true);
CREATE POLICY "public_paket_update" ON "Paket" FOR UPDATE USING (true);
CREATE POLICY "public_paket_delete" ON "Paket" FOR DELETE USING (true);

CREATE POLICY "public_uniquecode_select" ON "UniqueCode" FOR SELECT USING (true);
CREATE POLICY "public_uniquecode_insert" ON "UniqueCode" FOR INSERT WITH CHECK (true);
CREATE POLICY "public_uniquecode_update" ON "UniqueCode" FOR UPDATE USING (true);
CREATE POLICY "public_uniquecode_delete" ON "UniqueCode" FOR DELETE USING (true);

CREATE POLICY "public_sitesetting_select" ON "SiteSetting" FOR SELECT USING (true);
CREATE POLICY "public_sitesetting_insert" ON "SiteSetting" FOR INSERT WITH CHECK (true);
CREATE POLICY "public_sitesetting_update" ON "SiteSetting" FOR UPDATE USING (true);
CREATE POLICY "public_sitesetting_delete" ON "SiteSetting" FOR DELETE USING (true);

-- ============================================================
-- Seed Data: Categories
-- ============================================================
INSERT INTO "Category" ("id", "name", "slug", "icon", "color", "sortOrder") VALUES
('cms1trfeh0000pza3cqkoi51r', 'Mesin Cetak', 'mesin-cetak', 'Printer', 'emerald', 1),
('cms1trfeh0001pza37gzgjn9r', 'Mesin Digital Printing', 'mesin-digital-printing', 'MonitorPrinter', 'teal', 2),
('cms1trfei0002pza3igp4i6jn', 'Mesin Kemasan & Packaging', 'mesin-kemasan', 'Package', 'green', 3),
('cms1trfej0003pza3wqrgrz7x', 'Mesin Kayu', 'mesin-kayu', 'TreePine', 'lime', 4),
('cms1trfej0004pza4n1qkgjqc', 'Mesin Logam', 'mesin-logam', 'Wrench', 'orange', 5),
('cms1trfek0005pza4hmfhn3ph', 'Mesin Plastik', 'mesin-plastik', 'Box', 'amber', 6),
('cms1trfel0006pza4vxlf6jq2', 'Mesin Tekstil', 'mesin-tekstil', 'Shirt', 'rose', 7),
('cms1trfel0007pza5gxxr4b4h', 'Mesin Makanan & Minuman', 'mesin-makanan-minuman', 'UtensilsCrossed', 'red', 8),
('cms1trfem0008pza5klc7bxbv', 'Mesin Pertanian', 'mesin-pertanian', 'Wheat', 'yellow', 9),
('cms1trfen0009pza5w8hxvq8e', 'Mesin Konstruksi', 'mesin-konstruksi', 'HardHat', 'stone', 10),
('cms1trfeo000apza6f5xk3v4k', 'Mesin Laboratorium', 'mesin-laboratorium', 'FlaskConical', 'cyan', 11),
('cms1trfeo000bpza6p3h4d2t', 'Lainnya', 'lainnya', 'Boxes', 'slate', 12)
ON CONFLICT ("id") DO NOTHING;

-- ============================================================
-- Seed Data: Paket (paket iklan + banner config placeholders)
-- ============================================================
INSERT INTO "Paket" ("id", "key", "name", "price", "originalPrice", "duration", "features", "active", "sortOrder") VALUES
('cms1trfr00000pzb1c0d4g3k', 'gratis', 'GRATIS', 0, 0, 30, '{"maxPhotos":3,"featuredDays":0,"spotlightDays":0,"highlightDays":0,"badgeFree":true,"support":"email","duration":30}', true, 1),
('cms1trfr00001pzb1h2h5f6g', 'spotlight', 'SPOTLIGHT', 50000, 75000, 30, '{"maxPhotos":8,"featuredDays":7,"spotlightDays":7,"highlightDays":0,"badgeFree":true,"support":"whatsapp","duration":30}', true, 2),
('cms1trfr00002pzb1m7j8k9l', 'highlight', 'HIGHLIGHT', 100000, 150000, 30, '{"maxPhotos":12,"featuredDays":14,"spotlightDays":7,"highlightDays":14,"badgeFree":true,"support":"priority","duration":30}', true, 3),
('cms1trfr00003pzb1p2n3o4p', 'titanium', 'TITANIUM', 250000, 350000, 30, '{"maxPhotos":20,"featuredDays":30,"spotlightDays":14,"highlightDays":30,"badgeFree":true,"support":"priority","duration":30}', true, 4),
('cms1trfr00004pzb1q5r6s7t', 'platinum', 'PLATINUM', 500000, 750000, 30, '{"maxPhotos":30,"featuredDays":30,"spotlightDays":30,"highlightDays":30,"badgeFree":true,"support":"priority","duration":30}', true, 5)
ON CONFLICT ("key") DO NOTHING;

-- ============================================================
-- Seed Data: Admin User (default admin)
-- Password: admin123 (CHANGE THIS IMMEDIATELY after first login!)
-- ============================================================
INSERT INTO "User" ("id", "email", "name", "password", "role", "phone", "city", "company") VALUES
('cmsv4ru2c0000q71dpo8ynqqi', 'admin@gomesin.com', '$2b$10$PlaceholderHashReplaceMe', 'Admin mesinKU', 'admin', '081234567890', 'Jakarta', 'mesinKU')
ON CONFLICT ("email") DO NOTHING;

