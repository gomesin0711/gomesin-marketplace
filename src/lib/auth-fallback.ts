import { hashPassword, verifyPassword } from "@/lib/auth";
import { promises as fs } from "fs";
import path from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

type StoredUser = {
  id: string;
  name: string;
  email: string;
  password: string; // hashed via hashPassword()
  phone: string | null;
  city: string | null;
  company: string | null;
  address: string | null;
  bannerImage: string | null;
  logoImage: string | null;
  role: string;
  createdAt: string;
};

export type SafeUser = Omit<StoredUser, "password">;

function toSafe(u: StoredUser): SafeUser {
  const { password: _, ...safe } = u;
  return safe;
}

// ─── Seed user (admin from local DB) ─────────────────────────────────────────
// Pre-hashed password so we don't need scrypt at import time
const SEED_USERS: StoredUser[] = [
  {
    id: "cms1trinv0000pzao4vy44or8",
    name: "Admin Gomesin",
    email: "gomesin0711@gmail.com",
    password:
      "0b1dd31e55556886306717e8dbb2ba9c:b52c0fb71b1f3d98dbf8668c24597d6ea63a21f81757d623c13a08fbb79e69482ee7586e34ab004b3e97840dc9e855fba2ef63be7b36e799112a1dedf1dcc9b1",
    phone: "085888082208",
    city: "Jakarta",
    company: "gomesin",
    address: "tangerang",
    bannerImage: null,
    logoImage: null,
    role: "admin",
    createdAt: "2026-07-26T13:19:34.460Z",
  },
];

// ─── Global in-memory store (persists across warm invocations) ───────────────

const FILE_PATH = "/tmp/auth-users.json";

const globalStore = globalThis as unknown as {
  __authUsers: Map<string, StoredUser> | undefined;
  __authLoaded: boolean;
};

async function loadFromFile(): Promise<Map<string, StoredUser>> {
  try {
    const data = await fs.readFile(FILE_PATH, "utf-8");
    const parsed = JSON.parse(data) as StoredUser[];
    const map = new Map<string, StoredUser>();
    for (const u of parsed) {
      map.set(u.email.toLowerCase().trim(), u);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function saveToFile(map: Map<string, StoredUser>): Promise<void> {
  try {
    const arr = Array.from(map.values());
    await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
    await fs.writeFile(FILE_PATH, JSON.stringify(arr, null, 2), "utf-8");
  } catch {
    // Silently fail — in-memory still works for this invocation
  }
}

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 24; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export async function getAuthStore(): Promise<Map<string, StoredUser>> {
  if (!globalStore.__authUsers || !globalStore.__authLoaded) {
    const fileStore = await loadFromFile();
    for (const seed of SEED_USERS) {
      const key = seed.email.toLowerCase().trim();
      if (!fileStore.has(key)) {
        fileStore.set(key, seed);
      }
    }
    globalStore.__authUsers = fileStore;
    globalStore.__authLoaded = true;
  }
  return globalStore.__authUsers;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fallbackRegisterUser(data: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  city?: string;
  company?: string;
  address?: string;
  bannerImage?: string;
  logoImage?: string;
}): Promise<
  | { ok: true; user: SafeUser }
  | { ok: false; error: string; status: number }
> {
  const store = await getAuthStore();
  const emailKey = data.email.toLowerCase().trim();

  if (store.has(emailKey)) {
    return {
      ok: false,
      error: "Email sudah terdaftar. Silakan masuk.",
      status: 409,
    };
  }

  const newUser: StoredUser = {
    id: generateId(),
    name: data.name.trim(),
    email: emailKey,
    password: hashPassword(data.password),
    phone: data.phone?.trim() || null,
    city: data.city?.trim() || null,
    company: data.company?.trim() || null,
    address: data.address?.trim() || null,
    bannerImage: data.bannerImage?.trim() || null,
    logoImage: data.logoImage?.trim() || null,
    role: "user",
    createdAt: new Date().toISOString(),
  };

  store.set(emailKey, newUser);
  await saveToFile(store);

  return { ok: true, user: toSafe(newUser) };
}

export async function fallbackFindUser(email: string, password: string): Promise<
  | { ok: true; user: SafeUser }
  | { ok: false; error: string; status: number }
> {
  const store = await getAuthStore();
  const emailKey = email.toLowerCase().trim();
  const stored = store.get(emailKey);

  if (!stored) {
    return {
      ok: false,
      error: "Email atau kata sandi salah.",
      status: 401,
    };
  }

  if (!verifyPassword(password, stored.password)) {
    return {
      ok: false,
      error: "Email atau kata sandi salah.",
      status: 401,
    };
  }

  return { ok: true, user: toSafe(stored) };
}

export async function fallbackGetUserById(userId: string): Promise<SafeUser | null> {
  const store = await getAuthStore();
  for (const u of store.values()) {
    if (u.id === userId) return toSafe(u);
  }
  return null;
}

export async function fallbackChangePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<
  | { ok: true }
  | { ok: false; error: string; status: number }
> {
  const store = await getAuthStore();
  for (const [key, u] of store.entries()) {
    if (u.id === userId) {
      if (!verifyPassword(currentPassword, u.password)) {
        return { ok: false, error: "Kata sandi lama salah.", status: 401 };
      }
      u.password = hashPassword(newPassword);
      store.set(key, u);
      await saveToFile(store);
      return { ok: true };
    }
  }
  return { ok: false, error: "User tidak ditemukan.", status: 404 };
}

export async function fallbackFindUserByPhone(phone: string): Promise<
  | { ok: true; user: SafeUser }
  | { ok: false; error: string; status: number }
> {
  const store = await getAuthStore();
  const last10 = phone.replace(/[^0-9]/g, '').slice(-10);
  for (const u of store.values()) {
    const uPhone = (u.phone || '').replace(/[^0-9]/g, '');
    if (uPhone.slice(-10) === last10 || uPhone === phone) {
      return { ok: true, user: toSafe(u) };
    }
  }
  return { ok: false, error: 'Nomor WhatsApp tidak terdaftar.', status: 404 };
}

export async function fallbackUpdateUser(
  userId: string,
  data: Partial<Pick<StoredUser, "name" | "phone" | "city" | "company" | "address" | "bannerImage" | "logoImage">>
): Promise<SafeUser | null> {
  const store = await getAuthStore();
  for (const [key, u] of store.entries()) {
    if (u.id === userId) {
      const updated: StoredUser = { ...u, ...data };
      store.set(key, updated);
      await saveToFile(store);
      return toSafe(updated);
    }
  }
  return null;
}
