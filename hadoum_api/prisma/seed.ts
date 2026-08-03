import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const passwordHash = await bcrypt.hash('hadoumsn2026', 10);

  await prisma.user.upsert({
    where: { email: 'hadoum@gmail.com' },
    update: { passwordHash },
    create: {
      email: 'hadoum@gmail.com',
      passwordHash,
      name: 'Hadoum Admin',
      initials: 'HA',
      role: 'DIRECTOR',
      roleLabel: 'Administrateur',
      title: 'Administration générale',
    },
  });

  console.log('✅ User hadoum@gmail.com created/updated.');

  const dounde = await bcrypt.hash('test123', 10);

  await prisma.user.upsert({
    where: { email: 'dounde.diallo@gmail.com' },
    update: {
      passwordHash: dounde,
      role: 'SUPERVISOR',
      roleLabel: 'Superviseur',
      title: 'Supervision générale',
    },
    create: {
      email: 'dounde.diallo@gmail.com',
      passwordHash: dounde,
      name: 'Dounde Diallo',
      initials: 'DD',
      role: 'SUPERVISOR',
      roleLabel: 'Superviseur',
      title: 'Supervision générale',
    },
  });

  console.log('✅ User dounde.diallo@gmail.com created/updated.');

  // Initial ContactCategory rows for the "Répertoire des contacts" module.
  // Deliberately `update: {}` on the upsert (unlike the User upserts above,
  // which do overwrite): a category's label/color/sortOrder is meant to be
  // editable later by a DIRECTOR through the app, and re-running this seed
  // (e.g. on every `prisma migrate dev`) must never silently revert that
  // kind of manual edit. Only the `key` is treated as the stable identity;
  // if the row already exists, this seed leaves it untouched.
  const CONTACT_CATEGORIES: { key: string; label: string; sortOrder: number }[] = [
    { key: 'FOURNISSEUR', label: 'Fournisseur', sortOrder: 1 },
    { key: 'PRESTATAIRE', label: 'Prestataire', sortOrder: 2 },
    { key: 'ADMINISTRATION', label: 'Administration', sortOrder: 3 },
    { key: 'SANTE', label: 'Santé', sortOrder: 4 },
    { key: 'SOCIAL', label: 'Social', sortOrder: 5 },
    { key: 'TRANSPORT', label: 'Transport', sortOrder: 6 },
    { key: 'MAINTENANCE', label: 'Maintenance', sortOrder: 7 },
    { key: 'ARTISAN', label: 'Artisan', sortOrder: 8 },
    { key: 'COMMERCE', label: 'Commerce', sortOrder: 9 },
    { key: 'AUTRE', label: 'Autre', sortOrder: 10 },
  ];

  for (const category of CONTACT_CATEGORIES) {
    await prisma.contactCategory.upsert({
      where: { key: category.key },
      update: {},
      create: category,
    });
  }

  console.log(`✅ ${CONTACT_CATEGORIES.length} contact categories ensured.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
