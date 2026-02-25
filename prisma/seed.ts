import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

const libsql = createClient({ url: "file:prisma/dev.db" });
const adapter = new PrismaLibSQL(libsql);
const prisma = new PrismaClient({ adapter });

const categories = [
  // Servicios del hogar
  { name: "Agua", icon: "droplets", color: "#3b82f6" },
  { name: "Luz", icon: "zap", color: "#eab308" },
  { name: "Gas", icon: "flame", color: "#f97316" },
  { name: "Internet", icon: "wifi", color: "#8b5cf6" },
  { name: "Teléfono", icon: "smartphone", color: "#06b6d4" },
  // Suscripciones
  { name: "Netflix", icon: "tv", color: "#ef4444" },
  { name: "Spotify", icon: "music", color: "#22c55e" },
  { name: "YouTube Premium", icon: "play", color: "#ef4444" },
  { name: "Otras suscripciones", icon: "repeat", color: "#a855f7" },
  // Tarjetas de crédito
  { name: "Tarjeta Visa", icon: "credit-card", color: "#1e40af" },
  { name: "Tarjeta Mastercard", icon: "credit-card", color: "#dc2626" },
  { name: "Tarjeta Amex", icon: "credit-card", color: "#2563eb" },
  // Otros
  { name: "Impuestos", icon: "landmark", color: "#64748b" },
  { name: "Seguros", icon: "shield", color: "#14b8a6" },
  { name: "Otro", icon: "ellipsis", color: "#94a3b8" },
];

async function main() {
  console.log("Seeding categories...");

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { id: cat.name.toLowerCase().replace(/\s+/g, "-") },
      update: {},
      create: {
        id: cat.name.toLowerCase().replace(/\s+/g, "-"),
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
      },
    });
  }

  console.log(`Seeded ${categories.length} categories.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
