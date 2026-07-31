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
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
