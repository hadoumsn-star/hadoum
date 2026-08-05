import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createTestApp,
  cleanDatabase,
  getPrisma,
  seedTestUsers,
  TEST_PASSWORD,
} from './utils/test-app';
import { PrismaService } from '../src/prisma/prisma.service';

// PR 10: Staff attendance improvements — weekly schedule Saturday/Sunday
// support and the new daily presence confirmation workflow (NON_CONFIRMED
// default / PRESENT / ABSENT), driven against the real API + real Postgres.
// Also re-verifies the pre-existing Congé/Retard/Absence (StaffAttendance)
// endpoints are completely untouched by this PR.
describe('Staff attendance (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let directorToken: string;
  let supervisorToken: string;
  let staffId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const users = await seedTestUsers(prisma);

    directorToken = (
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: users.director.email, password: TEST_PASSWORD })
    ).body.token;
    supervisorToken = (
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: users.supervisor.email, password: TEST_PASSWORD })
    ).body.token;

    const staff = await prisma.staffMember.create({
      data: { firstName: 'Awa', lastName: 'Diop', role: 'Éducateur' },
    });
    staffId = staff.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('weekly schedule (Samedi/Dimanche)', () => {
    it('preserves an existing Monday-Friday schedule exactly', async () => {
      const weekdaySchedule = {
        Lundi: [{ debut: '08:00', fin: '12:00', label: 'Classe' }],
        Mardi: [],
        Mercredi: [{ debut: '14:00', fin: '17:00', label: 'Soutien' }],
        Jeudi: [],
        Vendredi: [],
      };
      await request(app.getHttpServer())
        .patch(`/api/staff/${staffId}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ scheduleJson: JSON.stringify(weekdaySchedule) })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/staff/${staffId}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);

      expect(JSON.parse(res.body.scheduleJson)).toEqual(weekdaySchedule);
    });

    it('saves and displays a schedule that includes Samedi and Dimanche', async () => {
      const fullWeekSchedule = {
        Lundi: [], Mardi: [], Mercredi: [], Jeudi: [], Vendredi: [],
        Samedi: [{ debut: '09:00', fin: '12:00', label: 'Permanence' }],
        Dimanche: [{ debut: '10:00', fin: '11:00', label: 'Astreinte' }],
      };
      await request(app.getHttpServer())
        .patch(`/api/staff/${staffId}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ scheduleJson: JSON.stringify(fullWeekSchedule) })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/staff/${staffId}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);

      const saved = JSON.parse(res.body.scheduleJson);
      expect(saved.Samedi).toHaveLength(1);
      expect(saved.Dimanche).toHaveLength(1);
    });

    it('does not lose an existing weekday schedule when only adding weekend slots', async () => {
      const initial = { Lundi: [{ debut: '08:00', fin: '12:00', label: 'Classe' }], Mardi: [], Mercredi: [], Jeudi: [], Vendredi: [] };
      await request(app.getHttpServer())
        .patch(`/api/staff/${staffId}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ scheduleJson: JSON.stringify(initial) })
        .expect(200);

      const withWeekend = { ...initial, Samedi: [{ debut: '09:00', fin: '11:00', label: 'Permanence' }], Dimanche: [] };
      await request(app.getHttpServer())
        .patch(`/api/staff/${staffId}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ scheduleJson: JSON.stringify(withWeekend) })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/staff/${staffId}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      const saved = JSON.parse(res.body.scheduleJson);
      expect(saved.Lundi).toEqual(initial.Lundi);
      expect(saved.Samedi).toHaveLength(1);
    });
  });

  describe('daily presence confirmation', () => {
    it('defaults to NON_CONFIRMED for every staff member on a fresh date', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/staff/presence?date=2026-08-04')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);

      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0].status).toBe('NON_CONFIRMED');
      expect(res.body.nonConfirmedCount).toBe(1);
    });

    it('DIRECTOR confirms PRESENT', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/staff/${staffId}/presence`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ date: '2026-08-04', status: 'PRESENT' })
        .expect(201);
      expect(res.body.status).toBe('PRESENT');

      const list = await request(app.getHttpServer())
        .get('/api/staff/presence?date=2026-08-04')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(list.body.entries[0].status).toBe('PRESENT');
      expect(list.body.nonConfirmedCount).toBe(0);
    });

    it('DIRECTOR confirms ABSENT', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/staff/${staffId}/presence`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ date: '2026-08-04', status: 'ABSENT' })
        .expect(201);
      expect(res.body.status).toBe('ABSENT');
    });

    it('changing the date shows a different day\'s confirmations independently', async () => {
      await request(app.getHttpServer())
        .post(`/api/staff/${staffId}/presence`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ date: '2026-08-04', status: 'PRESENT' })
        .expect(201);

      const day1 = await request(app.getHttpServer())
        .get('/api/staff/presence?date=2026-08-04')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(day1.body.entries[0].status).toBe('PRESENT');

      const day2 = await request(app.getHttpServer())
        .get('/api/staff/presence?date=2026-08-05')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(day2.body.entries[0].status).toBe('NON_CONFIRMED');
    });

    it('resets a confirmed status back to non-confirmed', async () => {
      await request(app.getHttpServer())
        .post(`/api/staff/${staffId}/presence`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ date: '2026-08-04', status: 'ABSENT' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/staff/${staffId}/presence?date=2026-08-04`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);

      const list = await request(app.getHttpServer())
        .get('/api/staff/presence?date=2026-08-04')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(list.body.entries[0].status).toBe('NON_CONFIRMED');
    });

    it('the unconfirmed count reflects a mix of confirmed and unconfirmed staff', async () => {
      const staff2 = await prisma.staffMember.create({ data: { firstName: 'Moussa', lastName: 'Fall', role: 'Éducateur' } });
      await prisma.staffMember.create({ data: { firstName: 'Fatou', lastName: 'Sow', role: 'Éducateur' } });

      await request(app.getHttpServer())
        .post(`/api/staff/${staffId}/presence`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ date: '2026-08-04', status: 'PRESENT' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/staff/${staff2.id}/presence`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ date: '2026-08-04', status: 'ABSENT' })
        .expect(201);

      const list = await request(app.getHttpServer())
        .get('/api/staff/presence?date=2026-08-04')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(list.body.entries).toHaveLength(3);
      expect(list.body.nonConfirmedCount).toBe(1);
    });

    it('SUPERVISOR can read daily presence but cannot confirm or reset', async () => {
      await request(app.getHttpServer())
        .get('/api/staff/presence?date=2026-08-04')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/staff/${staffId}/presence`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ date: '2026-08-04', status: 'PRESENT' })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/api/staff/${staffId}/presence?date=2026-08-04`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(403);
    });
  });

  describe('existing Congé/Retard/Absence (StaffAttendance) records are unaffected', () => {
    it('still creates, lists, updates and deletes a leave record exactly as before', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/staff/${staffId}/attendance`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ type: 'conge', motif: 'Congé annuel', dateDebut: '2026-08-10', dateFin: '2026-08-15' })
        .expect(201);
      expect(created.body.type).toBe('conge');

      const list = await request(app.getHttpServer())
        .get(`/api/staff/${staffId}/attendance`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(list.body).toHaveLength(1);

      const updated = await request(app.getHttpServer())
        .patch(`/api/staff/attendance/${created.body.id}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ motif: 'Congé annuel modifié' })
        .expect(200);
      expect(updated.body.motif).toBe('Congé annuel modifié');

      await request(app.getHttpServer())
        .delete(`/api/staff/attendance/${created.body.id}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
    });

    it('a staff member on active Absence still shows ABSENT via GET /api/staff, unaffected by daily presence', async () => {
      await request(app.getHttpServer())
        .post(`/api/staff/${staffId}/attendance`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ type: 'absence', dateDebut: new Date().toISOString().slice(0, 10) })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/staff')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(res.body.find((m: { id: string }) => m.id === staffId).status).toBe('ABSENT');

      // Daily presence confirmation is a distinct concept — confirming it
      // doesn't touch or require touching the StaffAttendance leave record.
      await request(app.getHttpServer())
        .post(`/api/staff/${staffId}/presence`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ date: new Date().toISOString().slice(0, 10), status: 'ABSENT' })
        .expect(201);

      const attendance = await request(app.getHttpServer())
        .get(`/api/staff/${staffId}/attendance`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(attendance.body).toHaveLength(1);
      expect(attendance.body[0].type).toBe('absence');
    });

    it('the daily presence list flags a staff member on leave without altering the leave record', async () => {
      const today = new Date().toISOString().slice(0, 10);
      await request(app.getHttpServer())
        .post(`/api/staff/${staffId}/attendance`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ type: 'conge', dateDebut: today })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/staff/presence?date=${today}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);

      expect(res.body.entries[0].onLeave).toBe('conge');
      expect(res.body.entries[0].status).toBe('NON_CONFIRMED');
    });
  });

  // Attendance page fix: "Non confirmées" must never count a staff member
  // whose Congé/Absence/Maladie record covers the *selected* date — checked
  // against real Postgres date-range queries, not just the entries array
  // shape, since the date-boundary conditions live in the Prisma `where`
  // clause (dateDebut <= end AND (dateFin is null OR dateFin >= start)).
  describe('non-confirmed eligibility respects leave/absence date ranges', () => {
    it('a leave that starts before and ends after the selected date excludes the staff member', async () => {
      await request(app.getHttpServer())
        .post(`/api/staff/${staffId}/attendance`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ type: 'conge', dateDebut: '2026-08-01', dateFin: '2026-08-10' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/staff/presence?date=2026-08-05')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);

      expect(res.body.entries[0].onLeave).toBe('conge');
      expect(res.body.nonConfirmedCount).toBe(0);
    });

    it('a leave that starts exactly on the selected date excludes the staff member', async () => {
      await request(app.getHttpServer())
        .post(`/api/staff/${staffId}/attendance`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ type: 'absence', motif: 'Maladie', dateDebut: '2026-08-05', dateFin: '2026-08-08' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/staff/presence?date=2026-08-05')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);

      expect(res.body.entries[0].onLeave).toBe('absence');
      expect(res.body.nonConfirmedCount).toBe(0);
    });

    it('a leave that ends exactly on the selected date excludes the staff member', async () => {
      await request(app.getHttpServer())
        .post(`/api/staff/${staffId}/attendance`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ type: 'conge', dateDebut: '2026-08-01', dateFin: '2026-08-05' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/staff/presence?date=2026-08-05')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);

      expect(res.body.entries[0].onLeave).toBe('conge');
      expect(res.body.nonConfirmedCount).toBe(0);
    });

    it('a leave range that does not cover the selected date does NOT exclude the staff member', async () => {
      await request(app.getHttpServer())
        .post(`/api/staff/${staffId}/attendance`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ type: 'conge', dateDebut: '2026-08-01', dateFin: '2026-08-04' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/staff/presence?date=2026-08-05')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);

      expect(res.body.entries[0].onLeave).toBeNull();
      expect(res.body.nonConfirmedCount).toBe(1);
    });

    it('changing the selected date recomputes eligibility across the leave boundary', async () => {
      await request(app.getHttpServer())
        .post(`/api/staff/${staffId}/attendance`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ type: 'conge', dateDebut: '2026-08-05', dateFin: '2026-08-07' })
        .expect(201);

      const before = await request(app.getHttpServer())
        .get('/api/staff/presence?date=2026-08-04')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(before.body.entries[0].onLeave).toBeNull();
      expect(before.body.nonConfirmedCount).toBe(1);

      const during = await request(app.getHttpServer())
        .get('/api/staff/presence?date=2026-08-06')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(during.body.entries[0].onLeave).toBe('conge');
      expect(during.body.nonConfirmedCount).toBe(0);

      const after = await request(app.getHttpServer())
        .get('/api/staff/presence?date=2026-08-08')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(after.body.entries[0].onLeave).toBeNull();
      expect(after.body.nonConfirmedCount).toBe(1);
    });

    it('nonConfirmedCount mixes eligible and on-leave staff correctly', async () => {
      const staffOnLeave = await prisma.staffMember.create({ data: { firstName: 'Moussa', lastName: 'Fall', role: 'Éducateur' } });
      const staffEligible = await prisma.staffMember.create({ data: { firstName: 'Fatou', lastName: 'Sow', role: 'Éducateur' } });
      await request(app.getHttpServer())
        .post(`/api/staff/${staffOnLeave.id}/attendance`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ type: 'conge', dateDebut: '2026-08-05' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/staff/presence?date=2026-08-05')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);

      // staffId (Awa) + staffEligible are eligible and non-confirmed;
      // staffOnLeave is excluded. All three still appear in `entries`.
      expect(res.body.entries).toHaveLength(3);
      expect(res.body.nonConfirmedCount).toBe(2);
      void staffEligible;
    });
  });
});
