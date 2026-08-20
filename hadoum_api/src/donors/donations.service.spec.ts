import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DonationsService } from './donations.service';
import { CreateDonationDto } from './dto/create-donation.dto';
import { PrismaService } from '../prisma/prisma.service';
import { FinancesService } from '../finances/finances.service';
import { withMockTransaction } from '../test-utils/mock-prisma';
import { matching } from '../test-utils/jest-matchers';

function createMockPrisma() {
  return withMockTransaction({
    donorProfile: { findUnique: jest.fn() },
    fundraisingCampaign: { findUnique: jest.fn() },
    donation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
  });
}

describe('DonationsService', () => {
  let service: DonationsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let finances: { createTransaction: jest.Mock };

  const activeDonor = {
    id: 'donor-1',
    active: true,
    contact: { id: 'contact-1', fullName: 'Fatou Diop', active: true },
  };

  const activeCampaign = {
    id: 'campaign-1',
    title: 'Rentrée scolaire 2026',
    status: 'ACTIVE',
  };

  const createDto: CreateDonationDto = {
    donorProfileId: 'donor-1',
    amountXof: 15_000,
    date: '2026-08-01',
  };

  const createdTransaction = { id: 'txn-1' };
  const createdDonationRow = { id: 'donation-1' };
  const fullDonationResponse = {
    id: 'donation-1',
    amountXof: 15_000,
    transactionId: 'txn-1',
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    finances = { createTransaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DonationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: FinancesService, useValue: finances },
      ],
    }).compile();
    service = module.get(DonationsService);
  });

  // ─── Happy path / Finance integration ──────────────────────────────────

  describe('create — happy path', () => {
    it('creates exactly one Transaction (RECETTE/DON) and links it to the new Donation', async () => {
      prisma.donorProfile.findUnique.mockResolvedValue(activeDonor);
      finances.createTransaction.mockResolvedValue(createdTransaction);
      // No idempotencyKey on createDto, so the pre-check is skipped
      // entirely — the only donation.findUnique call is findOne's
      // re-fetch at the end.
      prisma.donation.findUnique.mockResolvedValue(fullDonationResponse);
      prisma.donation.create.mockResolvedValue(createdDonationRow);

      const result = await service.create(createDto, 'user-1');

      expect(finances.createTransaction).toHaveBeenCalledTimes(1);
      expect(finances.createTransaction).toHaveBeenCalledWith(
        matching({
          type: 'RECETTE',
          category: 'DON',
          amountXof: 15_000,
          status: 'VALIDE',
          isAnonymousDonor: false,
          donorName: 'Fatou Diop',
        }),
        prisma, // the tx client, which withMockTransaction feeds back as `prisma` itself
      );
      expect(prisma.donation.create).toHaveBeenCalledWith(
        matching({
          data: matching({
            donorProfileId: 'donor-1',
            transactionId: 'txn-1',
          }),
        }),
      );
      expect(result).toEqual(fullDonationResponse);
    });

    it('links a donation to an ACTIVE campaign', async () => {
      prisma.donorProfile.findUnique.mockResolvedValue(activeDonor);
      prisma.fundraisingCampaign.findUnique.mockResolvedValue(activeCampaign);
      finances.createTransaction.mockResolvedValue(createdTransaction);
      prisma.donation.findUnique.mockResolvedValue(fullDonationResponse);
      prisma.donation.create.mockResolvedValue(createdDonationRow);

      await service.create(
        { ...createDto, campaignId: 'campaign-1' },
        'user-1',
      );

      expect(prisma.donation.create).toHaveBeenCalledWith(
        matching({ data: matching({ campaignId: 'campaign-1' }) }),
      );
    });
  });

  // ─── Atomicity ──────────────────────────────────────────────────────────

  describe('create — atomicity', () => {
    it('never creates a Donation when Finance Transaction creation fails', async () => {
      prisma.donorProfile.findUnique.mockResolvedValue(activeDonor);
      finances.createTransaction.mockRejectedValue(new Error('finance down'));

      await expect(service.create(createDto, 'user-1')).rejects.toThrow(
        'finance down',
      );
      expect(prisma.donation.create).not.toHaveBeenCalled();
    });

    it('propagates a Donation-insert failure after the Transaction was created in the same $transaction (lets the real DB roll both back)', async () => {
      prisma.donorProfile.findUnique.mockResolvedValue(activeDonor);
      finances.createTransaction.mockResolvedValue(createdTransaction);
      prisma.donation.create.mockRejectedValue(
        new Error('donation insert failed'),
      );

      await expect(service.create(createDto, 'user-1')).rejects.toThrow(
        'donation insert failed',
      );
      // The failure happened *inside* prisma.$transaction's callback — this
      // service never catches/swallows it (see donations.service.ts), so in
      // production the real Prisma $transaction wrapper rolls the
      // just-created Transaction back too. See
      // donors-donation-atomicity.e2e-spec.ts for the real-DB proof of that
      // rollback guarantee.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Idempotency ────────────────────────────────────────────────────────

  describe('create — idempotency', () => {
    it('returns the existing Donation instead of creating a new one when the idempotency key already exists', async () => {
      prisma.donation.findUnique.mockResolvedValue(fullDonationResponse);

      const result = await service.create(
        { ...createDto, idempotencyKey: 'key-1' },
        'user-1',
      );

      expect(result).toEqual(fullDonationResponse);
      expect(prisma.donorProfile.findUnique).not.toHaveBeenCalled();
      expect(finances.createTransaction).not.toHaveBeenCalled();
      expect(prisma.donation.create).not.toHaveBeenCalled();
    });

    it('recovers by returning the winning Donation when two concurrent requests race on the same idempotency key', async () => {
      prisma.donorProfile.findUnique.mockResolvedValue(activeDonor);
      const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '7.8.0',
      });
      prisma.donation.create.mockRejectedValue(p2002);
      finances.createTransaction.mockResolvedValue(createdTransaction);
      prisma.donation.findUnique
        .mockResolvedValueOnce(null) // pre-check: not there yet
        // post-race lookup, then findOne's own re-fetch — both see the
        // winning row from here on.
        .mockResolvedValue(fullDonationResponse);

      const result = await service.create(
        { ...createDto, idempotencyKey: 'key-race' },
        'user-1',
      );

      expect(result).toEqual(fullDonationResponse);
    });
  });

  // ─── Validation ─────────────────────────────────────────────────────────

  describe('create — validation', () => {
    it('rejects an unknown donor', async () => {
      prisma.donorProfile.findUnique.mockResolvedValue(null);
      await expect(service.create(createDto, 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(finances.createTransaction).not.toHaveBeenCalled();
    });

    it('rejects an inactive donor', async () => {
      prisma.donorProfile.findUnique.mockResolvedValue({
        ...activeDonor,
        active: false,
      });
      await expect(service.create(createDto, 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a donor whose Contact is deactivated', async () => {
      prisma.donorProfile.findUnique.mockResolvedValue({
        ...activeDonor,
        contact: { ...activeDonor.contact, active: false },
      });
      await expect(service.create(createDto, 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an unknown campaign', async () => {
      prisma.donorProfile.findUnique.mockResolvedValue(activeDonor);
      prisma.fundraisingCampaign.findUnique.mockResolvedValue(null);
      await expect(
        service.create({ ...createDto, campaignId: 'missing' }, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a donation to a non-ACTIVE campaign', async () => {
      prisma.donorProfile.findUnique.mockResolvedValue(activeDonor);
      prisma.fundraisingCampaign.findUnique.mockResolvedValue({
        ...activeCampaign,
        status: 'BROUILLON',
      });
      await expect(
        service.create({ ...createDto, campaignId: 'campaign-1' }, 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
