import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { createTestApp, cleanDatabase, getPrisma } from './utils/test-app';
import { PrismaService } from '../src/prisma/prisma.service';

// Real-database proof that the exact create-order DonationsService.create
// uses — create the Transaction first, then the Donation referencing it,
// both inside one `prisma.$transaction` — genuinely rolls back as a unit
// when the second write fails. donations.service.spec.ts (unit, mocked
// Prisma) proves our *code* never catches/swallows that failure; this spec
// proves Postgres/Prisma actually undoes both writes when it's allowed to
// run for real. No HTTP layer involved on purpose — the service's own
// pre-validation would normally prevent ever reaching this state; this is
// the DB-level safety net for whatever that validation might miss (e.g. a
// race), not a reachable API scenario.
describe('Module 5 — Donation/Transaction $transaction rollback (e2e, direct Prisma)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rolls back the just-created Transaction when the Donation insert in the same $transaction fails', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const transaction = await tx.transaction.create({
          data: {
            type: 'RECETTE',
            category: 'DON',
            label: 'Don test',
            amountXof: 15_000,
            date: new Date(),
            status: 'VALIDE',
          },
        });
        // donorProfileId references nothing — violates the FK Donation
        // requires, forcing the insert to fail from inside the transaction.
        await tx.donation.create({
          data: {
            donorProfileId: 'does-not-exist',
            amountXof: 15_000,
            date: new Date(),
            transactionId: transaction.id,
          },
        });
      }),
    ).rejects.toThrow();

    expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.donation.count()).toBe(0);
  });

  it('rolls back the just-created Transaction when the Donation insert violates the transactionId uniqueness constraint', async () => {
    const category = await prisma.contactCategory.create({
      data: { key: 'ATOMICITY_TEST', label: 'Test' },
    });
    const contact = await prisma.contact.create({
      data: { fullName: 'Atomicity Test Donor', categoryId: category.id },
    });
    const donor = await prisma.donorProfile.create({
      data: { contactId: contact.id, type: 'DONATEUR_PONCTUEL' },
    });

    // A pre-existing Transaction, already linked to a Donation — standing
    // in for "the transactionId this attempt will collide with".
    const existingTransaction = await prisma.transaction.create({
      data: {
        type: 'RECETTE',
        category: 'DON',
        label: 'Don existant',
        amountXof: 5_000,
        date: new Date(),
        status: 'VALIDE',
      },
    });
    await prisma.donation.create({
      data: {
        donorProfileId: donor.id,
        amountXof: 5_000,
        date: new Date(),
        transactionId: existingTransaction.id,
      },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        // This Transaction is the one expected to be rolled back — created
        // fresh, then never referenced again (the Donation below
        // deliberately reuses `existingTransaction.id` instead, to trigger
        // the uniqueness violation).
        await tx.transaction.create({
          data: {
            type: 'RECETTE',
            category: 'DON',
            label: 'Don en double',
            amountXof: 9_999,
            date: new Date(),
            status: 'VALIDE',
          },
        });
        await tx.donation.create({
          data: {
            donorProfileId: donor.id,
            amountXof: 9_999,
            date: new Date(),
            // Reuses the already-linked Transaction's id — @unique on
            // Donation.transactionId rejects this.
            transactionId: existingTransaction.id,
          },
        });
      }),
    ).rejects.toThrow();

    // Only the original pair survives — the second attempt's Transaction
    // never persists, and no second Donation exists.
    expect(await prisma.transaction.count()).toBe(1);
    expect(await prisma.donation.count()).toBe(1);
  });
});
