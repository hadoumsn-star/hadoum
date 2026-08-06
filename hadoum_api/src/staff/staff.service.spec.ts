import { Test, TestingModule } from '@nestjs/testing';
import { StaffService } from './staff.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { matching } from '../test-utils/jest-matchers';

function createMockPrisma() {
  return {
    staffMember: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    staffAttendance: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    staffPresenceConfirmation: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    formerStaffMember: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

describe('StaffService', () => {
  let service: StaffService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let upload: {
    upload: jest.Mock;
    getPresignedUrl: jest.Mock;
    deleteFile: jest.Mock;
  };

  const staffA = {
    id: 'staff-1',
    firstName: 'Awa',
    lastName: 'Diop',
    role: 'Éducateur',
    classes: [],
    status: 'PRESENT',
    phone: null,
    email: null,
    since: new Date('2025-01-01'),
    cvKey: null,
    scheduleKey: null,
    scheduleJson: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const staffB = {
    ...staffA,
    id: 'staff-2',
    firstName: 'Moussa',
    lastName: 'Fall',
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    upload = {
      upload: jest.fn(),
      getPresignedUrl: jest.fn(),
      deleteFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: upload },
      ],
    }).compile();
    service = module.get(StaffService);
  });

  describe('weekly schedule (scheduleJson pass-through)', () => {
    it('persists a Monday-Friday schedule unchanged', async () => {
      const weekdayOnly = JSON.stringify({
        Lundi: [{ debut: '08:00', fin: '12:00', label: 'Classe' }],
        Mardi: [],
        Mercredi: [],
        Jeudi: [],
        Vendredi: [],
      });
      prisma.staffMember.findUniqueOrThrow.mockResolvedValue(staffA);
      prisma.staffMember.update.mockResolvedValue({
        ...staffA,
        scheduleJson: weekdayOnly,
      });

      const result = await service.updateStaff('staff-1', {
        scheduleJson: weekdayOnly,
      });

      expect(prisma.staffMember.update).toHaveBeenCalledWith(
        matching({
          data: matching({ scheduleJson: weekdayOnly }),
        }),
      );
      expect(JSON.parse(result.scheduleJson as string)).toEqual(
        JSON.parse(weekdayOnly),
      );
    });

    it('persists a schedule that includes Samedi and Dimanche', async () => {
      const withWeekend = JSON.stringify({
        Lundi: [],
        Mardi: [],
        Mercredi: [],
        Jeudi: [],
        Vendredi: [],
        Samedi: [{ debut: '09:00', fin: '12:00', label: 'Permanence' }],
        Dimanche: [],
      });
      prisma.staffMember.findUniqueOrThrow.mockResolvedValue(staffA);
      prisma.staffMember.update.mockResolvedValue({
        ...staffA,
        scheduleJson: withWeekend,
      });

      const result = await service.updateStaff('staff-1', {
        scheduleJson: withWeekend,
      });

      const saved = JSON.parse(result.scheduleJson as string) as Record<
        string,
        unknown[]
      >;
      expect(saved.Samedi).toHaveLength(1);
      expect(saved.Dimanche).toEqual([]);
      // Weekday keys are untouched by adding weekend keys.
      expect(saved.Lundi).toEqual([]);
    });
  });

  describe('daily presence confirmation (PR 10)', () => {
    it('defaults every staff member to NON_CONFIRMED when no confirmation row exists', async () => {
      prisma.staffMember.findMany.mockResolvedValue([staffA, staffB]);
      prisma.staffPresenceConfirmation.findMany.mockResolvedValue([]);
      prisma.staffAttendance.findMany.mockResolvedValue([]);

      const result = await service.listDailyPresence('2026-08-04');

      expect(result.entries).toHaveLength(2);
      expect(result.entries.every((e) => e.status === 'NON_CONFIRMED')).toBe(
        true,
      );
      expect(result.nonConfirmedCount).toBe(2);
    });

    it('confirms PRESENT and reflects it in the daily list', async () => {
      prisma.staffMember.findUniqueOrThrow.mockResolvedValue(staffA);
      prisma.staffPresenceConfirmation.upsert.mockResolvedValue({
        id: 'conf-1',
        staffId: 'staff-1',
        date: new Date('2026-08-04'),
        confirmed: true,
        status: 'PRESENT',
        confirmedById: 'director-1',
        confirmedBy: { id: 'director-1', name: 'Directrice' },
      });

      const result = await service.confirmPresence(
        'staff-1',
        '2026-08-04',
        'PRESENT',
        'director-1',
      );

      expect(prisma.staffPresenceConfirmation.upsert).toHaveBeenCalledWith(
        matching({
          create: matching({
            status: 'PRESENT',
            confirmed: true,
            confirmedById: 'director-1',
          }),
          update: matching({
            status: 'PRESENT',
            confirmed: true,
            confirmedById: 'director-1',
          }),
        }),
      );
      expect(result.status).toBe('PRESENT');

      prisma.staffMember.findMany.mockResolvedValue([staffA]);
      prisma.staffPresenceConfirmation.findMany.mockResolvedValue([result]);
      prisma.staffAttendance.findMany.mockResolvedValue([]);
      const listed = await service.listDailyPresence('2026-08-04');
      expect(listed.entries[0].status).toBe('PRESENT');
      expect(listed.nonConfirmedCount).toBe(0);
    });

    it('confirms ABSENT', async () => {
      prisma.staffMember.findUniqueOrThrow.mockResolvedValue(staffA);
      prisma.staffPresenceConfirmation.upsert.mockResolvedValue({
        id: 'conf-1',
        staffId: 'staff-1',
        date: new Date('2026-08-04'),
        confirmed: false,
        status: 'ABSENT',
        confirmedById: 'director-1',
        confirmedBy: { id: 'director-1', name: 'Directrice' },
      });

      const result = await service.confirmPresence(
        'staff-1',
        '2026-08-04',
        'ABSENT',
        'director-1',
      );

      expect(prisma.staffPresenceConfirmation.upsert).toHaveBeenCalledWith(
        matching({
          create: matching({
            status: 'ABSENT',
            confirmed: false,
          }),
        }),
      );
      expect(result.status).toBe('ABSENT');
      expect(result.confirmed).toBe(false);
    });

    it('resets a confirmed status back to non-confirmed by deleting the row', async () => {
      prisma.staffPresenceConfirmation.deleteMany.mockResolvedValue({
        count: 1,
      });

      await service.resetPresence('staff-1', '2026-08-04');

      expect(prisma.staffPresenceConfirmation.deleteMany).toHaveBeenCalledWith(
        matching({
          where: matching({ staffId: 'staff-1' }),
        }),
      );
    });

    it("changing the queried date returns a different day's confirmations", async () => {
      prisma.staffMember.findMany.mockResolvedValue([staffA]);
      prisma.staffAttendance.findMany.mockResolvedValue([]);

      prisma.staffPresenceConfirmation.findMany.mockResolvedValueOnce([
        {
          staffId: 'staff-1',
          status: 'PRESENT',
          confirmedBy: null,
          updatedAt: new Date(),
        },
      ]);
      const day1 = await service.listDailyPresence('2026-08-04');
      expect(day1.entries[0].status).toBe('PRESENT');

      prisma.staffPresenceConfirmation.findMany.mockResolvedValueOnce([]);
      const day2 = await service.listDailyPresence('2026-08-05');
      expect(day2.entries[0].status).toBe('NON_CONFIRMED');
    });

    it('computes the unconfirmed count correctly with a mix of statuses', async () => {
      const staffC = { ...staffA, id: 'staff-3', firstName: 'Fatou' };
      prisma.staffMember.findMany.mockResolvedValue([staffA, staffB, staffC]);
      prisma.staffPresenceConfirmation.findMany.mockResolvedValue([
        {
          staffId: 'staff-1',
          status: 'PRESENT',
          confirmedBy: null,
          updatedAt: new Date(),
        },
        {
          staffId: 'staff-2',
          status: 'ABSENT',
          confirmedBy: null,
          updatedAt: new Date(),
        },
      ]);
      prisma.staffAttendance.findMany.mockResolvedValue([]);

      const result = await service.listDailyPresence('2026-08-04');

      expect(result.nonConfirmedCount).toBe(1);
      expect(result.entries.find((e) => e.staffId === 'staff-3')?.status).toBe(
        'NON_CONFIRMED',
      );
    });

    it('flags a staff member on active leave (StaffAttendance) as onLeave without affecting their confirmation status', async () => {
      prisma.staffMember.findMany.mockResolvedValue([staffA]);
      prisma.staffPresenceConfirmation.findMany.mockResolvedValue([]);
      prisma.staffAttendance.findMany.mockResolvedValue([
        {
          staffId: 'staff-1',
          type: 'conge',
          dateDebut: new Date('2026-08-01'),
          dateFin: new Date('2026-08-10'),
        },
      ]);

      const result = await service.listDailyPresence('2026-08-04');

      expect(result.entries[0].onLeave).toBe('conge');
      expect(result.entries[0].status).toBe('NON_CONFIRMED');
      // The row itself still shows (flagged via onLeave) — only the count
      // excludes them, since they aren't eligible for confirmation.
      expect(result.nonConfirmedCount).toBe(0);
    });

    it('excludes staff on Congé/Absence from nonConfirmedCount even when mixed with genuinely eligible staff', async () => {
      const staffC = { ...staffA, id: 'staff-3', firstName: 'Fatou' };
      prisma.staffMember.findMany.mockResolvedValue([staffA, staffB, staffC]);
      prisma.staffPresenceConfirmation.findMany.mockResolvedValue([]);
      prisma.staffAttendance.findMany.mockResolvedValue([
        {
          staffId: 'staff-1',
          type: 'conge',
          dateDebut: new Date('2026-08-01'),
          dateFin: new Date('2026-08-10'),
        },
        {
          staffId: 'staff-2',
          type: 'absence',
          dateDebut: new Date('2026-08-04'),
          dateFin: null,
        },
      ]);

      const result = await service.listDailyPresence('2026-08-04');

      // All three still appear in `entries` (staff-1/2 flagged via onLeave)
      // — only staff-3, who is genuinely eligible and unconfirmed, is
      // counted.
      expect(result.entries).toHaveLength(3);
      expect(result.nonConfirmedCount).toBe(1);
      expect(
        result.entries.find((e) => e.staffId === 'staff-3')?.onLeave,
      ).toBeNull();
    });

    it('a leave record that does not cover the selected date does not exclude the staff member', async () => {
      prisma.staffMember.findMany.mockResolvedValue([staffA]);
      prisma.staffPresenceConfirmation.findMany.mockResolvedValue([]);
      // Leave entirely in the past relative to the queried date — the
      // service's own query (dateDebut <= end AND (dateFin is null OR
      // dateFin >= start)) would never return this row from Prisma; mocking
      // `findMany` to return `[]` here is what stands in for that filter
      // already having excluded it upstream.
      prisma.staffAttendance.findMany.mockResolvedValue([]);

      const result = await service.listDailyPresence('2026-08-04');

      expect(result.entries[0].onLeave).toBeNull();
      expect(result.nonConfirmedCount).toBe(1);
    });
  });

  describe('existing StaffAttendance (Congé/Retard/Absence) is untouched', () => {
    it('still creates a leave record the same way', async () => {
      prisma.staffMember.findUniqueOrThrow.mockResolvedValue(staffA);
      prisma.staffAttendance.create.mockResolvedValue({
        id: 'att-1',
        type: 'conge',
      });

      const result = await service.createAttendance('staff-1', {
        type: 'conge',
        dateDebut: '2026-08-01',
        dateFin: '2026-08-05',
      });

      expect(prisma.staffAttendance.create).toHaveBeenCalledWith(
        matching({
          data: matching({ staffId: 'staff-1', type: 'conge' }),
        }),
      );
      expect(result.id).toBe('att-1');
    });

    it('findAllStaff still derives ABSENT/CONGE status from active StaffAttendance records', async () => {
      prisma.staffMember.findMany.mockResolvedValue([staffA]);
      prisma.staffAttendance.findMany.mockResolvedValue([
        {
          staffId: 'staff-1',
          type: 'absence',
          dateDebut: new Date(),
          dateFin: null,
        },
      ]);

      const result = await service.findAllStaff();

      expect(result[0].status).toBe('ABSENT');
    });
  });
});
