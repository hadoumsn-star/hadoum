// Unit tests for scripts/import-besoin-contacts.ts's DB-touching logic
// (buildPlan / execute / assertSafeEnvironment), driven against a small
// in-memory fake Prisma client rather than a real database — this repo's
// established pattern for this feature is "keep the logic dependency-free
// and testable with plain Jest" (see besoin-import.util.ts's own top
// comment). The fake implements only the handful of Prisma calls the script
// actually makes, so these tests prove the two properties the task calls out
// explicitly: a dry run (buildPlan alone) performs no writes, and a confirmed
// run (buildPlan + execute) creates/reuses/enriches contacts correctly.
//
// This file lives under src/contacts/ (not scripts/) so the default `npm
// test` unit-test Jest config — rootDir "src" — actually discovers it; it
// still imports the script from ../../scripts/ normally.

import {
  buildPlan,
  execute,
  assertSafeEnvironment,
} from '../../scripts/import-besoin-contacts';
import { parseContactsUtilesRows, type ImportRow } from './besoin-import.util';
import type { PrismaClient } from '@prisma/client';

// ─── Minimal in-memory fake Prisma ─────────────────────────────────────────

interface FakeCategory {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
}
interface FakeContact {
  id: string;
  fullName: string;
  organization: string | null;
  functionTitle: string | null;
  phone: string | null;
  notes: string | null;
  email: string | null;
  categoryId: string;
  active: boolean;
}

function makeFakePrisma(initial: {
  categories: FakeCategory[];
  contacts: FakeContact[];
}) {
  const categories = [...initial.categories];
  let contacts = [...initial.contacts];
  let nextId = 1;

  const withCategory = (c: FakeContact) => ({
    ...c,
    category: { key: categories.find((cat) => cat.id === c.categoryId)!.key },
  });

  const zeroCount = jest.fn(() => Promise.resolve(0));
  const emptyFindMany = jest.fn(() => Promise.resolve([] as unknown[]));

  const contact = {
    findMany: jest.fn(() => Promise.resolve(contacts.map(withCategory))),
    count: jest.fn(() => Promise.resolve(contacts.length)),
    delete: jest.fn(({ where: { id } }: { where: { id: string } }) => {
      contacts = contacts.filter((c) => c.id !== id);
      return Promise.resolve({});
    }),
    create: jest.fn(({ data }: { data: Partial<FakeContact> }) => {
      const created: FakeContact = {
        id: `new-${nextId++}`,
        fullName: data.fullName!,
        organization: data.organization ?? null,
        functionTitle: data.functionTitle ?? null,
        phone: data.phone ?? null,
        notes: data.notes ?? null,
        email: data.email ?? null,
        categoryId: data.categoryId!,
        active: data.active ?? true,
      };
      contacts.push(created);
      return Promise.resolve(created);
    }),
    update: jest.fn(
      ({
        where: { id },
        data,
      }: {
        where: { id: string };
        data: Partial<FakeContact>;
      }) => {
        const idx = contacts.findIndex((c) => c.id === id);
        contacts[idx] = { ...contacts[idx], ...data };
        return Promise.resolve(contacts[idx]);
      },
    ),
    findUniqueOrThrow: jest.fn(
      ({ where: { id } }: { where: { id: string } }) => {
        const found = contacts.find((c) => c.id === id);
        if (!found) throw new Error(`fake contact ${id} not found`);
        return Promise.resolve(found);
      },
    ),
  };

  const contactCategory = {
    findUnique: jest.fn(({ where: { key } }: { where: { key: string } }) =>
      Promise.resolve(categories.find((c) => c.key === key) ?? null),
    ),
    create: jest.fn(
      ({
        data,
      }: {
        data: { key: string; label: string; sortOrder: number };
      }) => {
        const created: FakeCategory = { id: `cat-${nextId++}`, ...data };
        categories.push(created);
        return Promise.resolve(created);
      },
    ),
  };

  const fake: Record<string, unknown> = {
    contact,
    contactCategory,
    transaction: { count: zeroCount, findMany: emptyFindMany },
    supplierContract: { count: zeroCount, findMany: emptyFindMany },
    administrativeProcedure: { count: zeroCount, findMany: emptyFindMany },
    maintenanceTicket: { count: zeroCount, findMany: emptyFindMany },
  };
  fake.$transaction = jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
    fn(fake),
  );

  return {
    prisma: fake as unknown as PrismaClient,
    getContacts: () => contacts.map(withCategory),
    getCategories: () => categories,
    mocks: {
      create: contact.create,
      update: contact.update,
      delete: contact.delete,
      transaction: fake.$transaction as jest.Mock,
    },
  };
}

const BASE_CATEGORIES: FakeCategory[] = [
  { id: 'cat-sante', key: 'SANTE', label: 'Santé', sortOrder: 4 },
  { id: 'cat-social', key: 'SOCIAL', label: 'Social', sortOrder: 5 },
  { id: 'cat-artisan', key: 'ARTISAN', label: 'Artisan', sortOrder: 8 },
  {
    id: 'cat-fournisseur',
    key: 'FOURNISSEUR',
    label: 'Fournisseur',
    sortOrder: 1,
  },
  {
    id: 'cat-prestataire',
    key: 'PRESTATAIRE',
    label: 'Prestataire',
    sortOrder: 2,
  },
];

function rows(
  ...specs: {
    Nom: string;
    Fonction?: string | null;
    Service: string;
    Téléphone?: string | null;
    Notes?: string | null;
  }[]
): ImportRow[] {
  return parseContactsUtilesRows(
    specs.map((s) => ({
      Nom: s.Nom,
      Fonction: s.Fonction ?? null,
      Service: s.Service,
      Téléphone: s.Téléphone ?? null,
      Notes: s.Notes ?? null,
    })),
  );
}

describe('scripts/import-besoin-contacts (buildPlan / execute against a fake Prisma)', () => {
  describe('dry run', () => {
    it('performs no database writes', async () => {
      const { prisma, getContacts, mocks } = makeFakePrisma({
        categories: BASE_CATEGORIES,
        contacts: [],
      });
      const before = getContacts();

      const { importPlan } = await buildPlan(
        prisma,
        rows(
          {
            Nom: 'Docteur Camara',
            Service: 'MEDICAL',
            Téléphone: '77 528 75 19',
          },
          { Nom: 'Seydou', Service: 'OUVRIER', Téléphone: '77 502 90 44' },
        ),
      );

      expect(importPlan.filter((p) => p.action === 'create')).toHaveLength(2);
      expect(getContacts()).toEqual(before); // unchanged
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.delete).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
    });
  });

  describe('confirmed import', () => {
    it('creates contacts and maps MEDICAL/OUVRIER/FOURNISSEUR to the right categories', async () => {
      const { prisma, getContacts, mocks } = makeFakePrisma({
        categories: BASE_CATEGORIES,
        contacts: [],
      });

      const { testItems, importPlan } = await buildPlan(
        prisma,
        rows(
          {
            Nom: 'Docteur Camara',
            Service: 'MEDICAL',
            Téléphone: '77 528 75 19',
          },
          { Nom: 'Seydou', Service: 'OUVRIER', Téléphone: '77 502 90 44' },
          {
            Nom: 'Ablaye MBAYE',
            Service: 'FOURNISSEUR',
            Téléphone: '77 453 64 16',
          },
        ),
      );
      const result = await execute(prisma, testItems, importPlan);

      expect(result).toEqual({
        deletedCount: 0,
        created: 3,
        reused: 0,
        enriched: 0,
      });
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      const byName = new Map(getContacts().map((c) => [c.fullName, c]));
      expect(byName.get('Docteur Camara')!.category.key).toBe('SANTE');
      expect(byName.get('Seydou')!.category.key).toBe('ARTISAN');
      expect(byName.get('Ablaye MBAYE')!.category.key).toBe('FOURNISSEUR');
    });

    it('reuses an existing contact matched on normalized phone, and enriches only empty fields', async () => {
      const existing: FakeContact = {
        id: 'existing-1',
        fullName: 'Docteur Camara',
        organization: null,
        functionTitle: null,
        phone: '77 528 75 19',
        notes: null,
        email: null,
        categoryId: 'cat-sante',
        active: true,
      };
      const { prisma, getContacts } = makeFakePrisma({
        categories: BASE_CATEGORIES,
        contacts: [existing],
      });

      const { testItems, importPlan } = await buildPlan(
        prisma,
        rows({
          Nom: 'Docteur Camara',
          Service: 'MEDICAL',
          Téléphone: '77 528 75 19',
          Fonction: 'Médecin Al Falah',
        }),
      );
      expect(importPlan[0].action).toBe('reuse');

      const result = await execute(prisma, testItems, importPlan);
      expect(result).toEqual({
        deletedCount: 0,
        created: 0,
        reused: 1,
        enriched: 1,
      });

      const updated = getContacts().find((c) => c.id === 'existing-1')!;
      expect(updated.functionTitle).toBe('Médecin Al Falah'); // empty field enriched
      expect(updated.phone).toBe('77 528 75 19'); // non-empty field preserved as-is
    });

    it('does not overwrite a non-empty existing field', async () => {
      const existing: FakeContact = {
        id: 'existing-1',
        fullName: 'Ablaye MBAYE',
        organization: null,
        functionTitle: 'Ancien titre',
        phone: '77 453 64 16',
        notes: null,
        email: null,
        categoryId: 'cat-fournisseur',
        active: true,
      };
      const { prisma, getContacts } = makeFakePrisma({
        categories: BASE_CATEGORIES,
        contacts: [existing],
      });

      const { testItems, importPlan } = await buildPlan(
        prisma,
        rows({
          Nom: 'Ablaye MBAYE',
          Service: 'FOURNISSEUR',
          Téléphone: '77 453 64 16',
          Fonction: 'Nouveau titre',
        }),
      );
      await execute(prisma, testItems, importPlan);

      const updated = getContacts().find((c) => c.id === 'existing-1')!;
      expect(updated.functionTitle).toBe('Ancien titre'); // never overwritten
    });

    it('does not create a duplicate for a phone appearing twice within the same sheet (same name)', async () => {
      const { prisma, getContacts } = makeFakePrisma({
        categories: BASE_CATEGORIES,
        contacts: [],
      });

      const { testItems, importPlan } = await buildPlan(
        prisma,
        rows(
          {
            Nom: 'Boubacar Diallo',
            Service: 'SOCIAL',
            Téléphone: '77 577 50 18',
          },
          {
            Nom: 'Boubacar Diallo',
            Service: 'SOCIAL',
            Téléphone: null,
            Notes: 'suite',
          },
        ),
      );
      const result = await execute(prisma, testItems, importPlan);

      expect(result.created).toBe(1);
      expect(result.reused).toBe(1);
      expect(
        getContacts().filter((c) => c.fullName === 'Boubacar Diallo'),
      ).toHaveLength(1);
    });

    it('leaves an ambiguous match uncreated and unresolved', async () => {
      const a: FakeContact = {
        id: 'a',
        fullName: 'Awa Diop',
        organization: null,
        functionTitle: null,
        phone: '77 111 22 33',
        notes: null,
        email: null,
        categoryId: 'cat-social',
        active: true,
      };
      const b: FakeContact = {
        id: 'b',
        fullName: 'Awa Diop',
        organization: null,
        functionTitle: null,
        phone: '77 111 22 33',
        notes: null,
        email: null,
        categoryId: 'cat-social',
        active: true,
      };
      const { prisma, getContacts } = makeFakePrisma({
        categories: BASE_CATEGORIES,
        contacts: [a, b],
      });

      const { testItems, importPlan } = await buildPlan(
        prisma,
        rows({ Nom: 'Awa Diop', Service: 'SOCIAL', Téléphone: '77 111 22 33' }),
      );
      expect(importPlan[0].action).toBe('ambiguous');

      const result = await execute(prisma, testItems, importPlan);
      expect(result).toEqual({
        deletedCount: 0,
        created: 0,
        reused: 0,
        enriched: 0,
      });
      expect(getContacts()).toHaveLength(2); // untouched
    });

    it('never plans or creates an ETAT row', async () => {
      const { prisma } = makeFakePrisma({
        categories: BASE_CATEGORIES,
        contacts: [],
      });
      const { testItems, importPlan } = await buildPlan(
        prisma,
        rows(
          { Nom: 'Mr NDIAYE', Service: 'État', Téléphone: '77 634 92 16' },
          {
            Nom: 'Docteur Camara',
            Service: 'MEDICAL',
            Téléphone: '77 528 75 19',
          },
        ),
      );
      const result = await execute(prisma, testItems, importPlan);
      expect(result.created).toBe(1);
      expect(
        importPlan.find((p) => p.row.fullName === 'Mr NDIAYE')!.action,
      ).toBe('skip');
    });
  });

  describe('assertSafeEnvironment', () => {
    it('allows a plain localhost DATABASE_URL without any flag', () => {
      expect(() =>
        assertSafeEnvironment(
          'postgresql://user:pass@localhost:5432/hadoum_db',
          false,
        ),
      ).not.toThrow();
    });

    it('refuses a non-localhost host without --allow-production', () => {
      expect(() =>
        assertSafeEnvironment(
          'postgresql://user:pass@db.example.com:5432/hadoum_db',
          false,
        ),
      ).toThrow(/Refusing to run against what looks like production/);
    });

    it('allows a non-localhost host when allowProduction is true', () => {
      expect(() =>
        assertSafeEnvironment(
          'postgresql://user:pass@db.example.com:5432/hadoum_db',
          true,
        ),
      ).not.toThrow();
    });

    it('refuses when NODE_ENV=production, even on localhost, without the flag', () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        expect(() =>
          assertSafeEnvironment(
            'postgresql://user:pass@localhost:5432/hadoum_db',
            false,
          ),
        ).toThrow(/Refusing to run against what looks like production/);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('refuses when DATABASE_URL is missing', () => {
      expect(() => assertSafeEnvironment(undefined, false)).toThrow(
        /DATABASE_URL is not set/,
      );
    });
  });
});
