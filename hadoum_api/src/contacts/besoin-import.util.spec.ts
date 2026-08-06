import {
  classifyContact,
  normalizePhone,
  normalizePhones,
  splitPhoneEntries,
  normalizeName,
  parseContactsUtilesRows,
  parseParentsOrphelinsRows,
  matchContact,
  type DedupCandidate,
} from './besoin-import.util';

describe('besoin-import.util', () => {
  describe('classifyContact', () => {
    it('flags names carrying the unique() timestamp-suffix fixture pattern', () => {
      const result = classifyContact({
        fullName: 'Recherche Basique 1785744263327-12469',
        organization: null,
        notes: null,
        email: null,
      });
      expect(result.isTest).toBe(true);
      expect(result.reason).toMatch(/timestamp suffix/);
    });

    it('flags a bare 10+ digit timestamp with no trailing hyphen segment', () => {
      const result = classifyContact({
        fullName: 'NoPhone Diag 1785745025',
        organization: null,
        notes: null,
        email: null,
      });
      expect(result.isTest).toBe(true);
    });

    it('flags names containing a test keyword', () => {
      const result = classifyContact({
        fullName: 'Manuel Check Contact',
        organization: null,
        notes: null,
        email: null,
      });
      expect(result.isTest).toBe(true);
      expect(result.reason).toMatch(/test keyword "check"/);
    });

    it('flags contacts using a test/example email domain', () => {
      const result = classifyContact({
        fullName: 'Awa Diop',
        organization: null,
        notes: null,
        email: 'awa.diop@example.com',
      });
      expect(result.isTest).toBe(true);
      expect(result.reason).toMatch(/test\/example domain/);
    });

    it('flags contacts with a test keyword in organization or notes', () => {
      expect(
        classifyContact({
          fullName: 'Awa Diop',
          organization: 'Structure Test',
          notes: null,
          email: null,
        }).isTest,
      ).toBe(true);
      expect(
        classifyContact({
          fullName: 'Awa Diop',
          organization: null,
          notes: 'created by e2e run',
          email: null,
        }).isTest,
      ).toBe(true);
    });

    it('does not flag an ordinary real contact', () => {
      const result = classifyContact({
        fullName: 'Mamadou HANNE',
        organization: null,
        notes: 'Fournisseur de matériel médical',
        email: 'contact@pharmaciehanne.sn',
      });
      expect(result.isTest).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('does not flag a contact merely for having incomplete information', () => {
      const result = classifyContact({
        fullName: 'BARA',
        organization: null,
        notes: null,
        email: null,
      });
      expect(result.isTest).toBe(false);
    });
  });

  describe('normalizePhone', () => {
    it('strips non-digit characters', () => {
      expect(normalizePhone('77 111 22 33')).toBe('771112233');
    });

    it('strips a leading 221 country code when present', () => {
      expect(normalizePhone('+221771112233')).toBe('771112233');
    });

    it('does not strip 221 from a bare 9-digit local number', () => {
      // A local number could coincidentally start with digits resembling
      // "221" (e.g. area-code-like prefixes) — only strip when there are
      // more than 9 digits, i.e. a real country-code prefix is present.
      expect(normalizePhone('221112233')).toBe('221112233');
    });

    it('returns null for empty or missing input', () => {
      expect(normalizePhone('')).toBeNull();
      expect(normalizePhone(null)).toBeNull();
      expect(normalizePhone(undefined)).toBeNull();
      expect(normalizePhone('—')).toBeNull();
    });
  });

  describe('normalizeName', () => {
    it('lowercases, trims, and collapses whitespace', () => {
      expect(normalizeName('  Mamadou   HANNE  ')).toBe('mamadou hanne');
    });

    it('strips accents', () => {
      expect(normalizeName('Sénégal Gaz')).toBe('senegal gaz');
    });

    it('returns an empty string for missing input', () => {
      expect(normalizeName(null)).toBe('');
      expect(normalizeName(undefined)).toBe('');
    });
  });

  describe('parseContactsUtilesRows', () => {
    it('excludes rows with Service = ETAT', () => {
      const [row] = parseContactsUtilesRows([
        {
          Nom: 'Mr NDIAYE',
          Fonction: 'Inspecteur',
          Service: 'ETAT',
          Téléphone: '771234567',
          Notes: null,
        },
      ]);
      expect(row.excluded).toBe(true);
      expect(row.excludeReason).toBe('Service = ETAT');
    });

    it.each([
      ['ETAT'],
      ['État'],
      ['etat'],
      ['état'],
      [' ETAT '],
      ['  État  '],
      ['EtAt'],
    ])(
      'excludes Service = %j case-insensitively, accent-insensitively, and trimmed',
      (service) => {
        const [row] = parseContactsUtilesRows([
          {
            Nom: 'Mr NDIAYE',
            Fonction: 'Inspecteur',
            Service: service,
            Téléphone: '771234567',
            Notes: null,
          },
        ]);
        expect(row.excluded).toBe(true);
        expect(row.excludeReason).toBe('Service = ETAT');
      },
    );

    it('excludes rows missing a Nom even without other errors', () => {
      const [row] = parseContactsUtilesRows([
        {
          Nom: null,
          Fonction: 'Chauffeur',
          Service: 'STAFF',
          Téléphone: '771234567',
          Notes: null,
        },
      ]);
      expect(row.excluded).toBe(true);
      expect(row.excludeReason).toBe('missing Nom');
    });

    it('excludes rows with an unrecognized Service value', () => {
      const [row] = parseContactsUtilesRows([
        {
          Nom: 'X Y',
          Fonction: null,
          Service: 'INCONNU',
          Téléphone: null,
          Notes: null,
        },
      ]);
      expect(row.excluded).toBe(true);
      expect(row.excludeReason).toMatch(/unrecognized Service/);
    });

    it.each([
      ['MEDICAL', 'SANTE'],
      ['OUVRIER', 'ARTISAN'],
      ['SOCIAL', 'SOCIAL'],
      ['FOURNISSEUR', 'FOURNISSEUR'],
      ['MEMBRES', 'SOCIAL'],
      ['STAFF', 'PRESTATAIRE'],
    ])(
      'maps Service=%s to category %s and includes the row',
      (service, expectedCategory) => {
        const [row] = parseContactsUtilesRows([
          {
            Nom: 'Awa Diop',
            Fonction: 'Coordinatrice',
            Service: service,
            Téléphone: '771234567',
            Notes: 'note',
          },
        ]);
        expect(row.excluded).toBe(false);
        expect(row.categoryKey).toBe(expectedCategory);
        expect(row.fullName).toBe('Awa Diop');
        expect(row.functionTitle).toBe('Coordinatrice');
        expect(row.phone).toBe('771234567');
        expect(row.notes).toBe('note');
      },
    );

    it('does not exclude a valid row just because Notes/Fonction/Téléphone are blank', () => {
      const [row] = parseContactsUtilesRows([
        {
          Nom: 'Awa Diop',
          Fonction: null,
          Service: 'SOCIAL',
          Téléphone: null,
          Notes: null,
        },
      ]);
      expect(row.excluded).toBe(false);
    });
  });

  describe('parseParentsOrphelinsRows', () => {
    it('always uses the PARENT_TUTEUR category and is not excluded when Nom is present', () => {
      const [row] = parseParentsOrphelinsRows([
        {
          Nom: 'Fatou Ndiaye',
          Enfants: 'Ibrahima, Awa',
          Role: 'Mère',
          Téléphone: '771234567',
          Notes: 'contacter le soir',
        },
      ]);
      expect(row.excluded).toBe(false);
      expect(row.categoryKey).toBe('PARENT_TUTEUR');
      expect(row.functionTitle).toBe('Mère');
      expect(row.notes).toBe('Enfant(s) : Ibrahima, Awa — contacter le soir');
    });

    it('excludes rows missing a Nom', () => {
      const [row] = parseParentsOrphelinsRows([
        {
          Nom: null,
          Enfants: 'Ibrahima',
          Role: 'Père',
          Téléphone: '771234567',
          Notes: null,
        },
      ]);
      expect(row.excluded).toBe(true);
      expect(row.excludeReason).toBe('missing Nom');
    });

    it('builds notes from Enfants alone when there are no pre-existing Notes', () => {
      const [row] = parseParentsOrphelinsRows([
        {
          Nom: 'Moussa Sarr',
          Enfants: 'Khady',
          Role: 'Père',
          Téléphone: null,
          Notes: null,
        },
      ]);
      expect(row.notes).toBe('Enfant(s) : Khady');
    });
  });

  describe('splitPhoneEntries / normalizePhones', () => {
    it('splits a "/"-separated cell into individual entries', () => {
      expect(splitPhoneEntries('77 624 85 96 /76 623 30 27')).toEqual([
        '77 624 85 96',
        '76 623 30 27',
      ]);
    });

    it('drops empty segments (trailing slash with nothing after it)', () => {
      expect(splitPhoneEntries('77 592 74 48 / ')).toEqual(['77 592 74 48']);
    });

    it('returns a single-entry array for a plain phone', () => {
      expect(splitPhoneEntries('77 111 22 33')).toEqual(['77 111 22 33']);
    });

    it('returns an empty array for missing input', () => {
      expect(splitPhoneEntries(null)).toEqual([]);
      expect(splitPhoneEntries(undefined)).toEqual([]);
      expect(splitPhoneEntries('')).toEqual([]);
    });

    it('normalizes every "/"-separated number', () => {
      expect(normalizePhones('78 484 63 06 / 70 496 17 82')).toEqual([
        '784846306',
        '704961782',
      ]);
    });

    it('de-duplicates identical normalized entries', () => {
      expect(normalizePhones('77 111 22 33 / 77 111 22 33')).toEqual([
        '771112233',
      ]);
    });
  });

  describe('matchContact', () => {
    const candidate = (
      over: Partial<DedupCandidate> & { id: string },
    ): DedupCandidate => ({
      fullName: '',
      phone: null,
      functionTitle: null,
      notes: null,
      ...over,
    });

    it('reuses a clear match on normalized phone + normalized fullName', () => {
      const existing = candidate({
        id: 'c1',
        fullName: 'Awa Diop',
        phone: '77 111 22 33',
      });
      const result = matchContact(
        {
          fullName: 'awa   diop',
          phone: '77 111 22 33',
          functionTitle: null,
          notes: null,
        },
        [existing],
      );
      expect(result.action).toBe('reuse');
      expect(result.matchedContactId).toBe('c1');
      expect(result.matchedOn).toBe('phone+name');
    });

    it('reuses a clear match on normalized phone alone when the sheet cell packs several numbers with "/"', () => {
      const existing = candidate({
        id: 'c1',
        fullName: 'More',
        phone: '78 484 63 06',
      });
      const result = matchContact(
        {
          fullName: 'More',
          phone: '78 484 63 06 / 70 496 17 82',
          functionTitle: null,
          notes: null,
        },
        [existing],
      );
      expect(result.action).toBe('reuse');
      expect(result.matchedContactId).toBe('c1');
    });

    it('reuses a clear match on normalized fullName when the row has no phone', () => {
      const existing = candidate({
        id: 'c1',
        fullName: 'Boubacar Diallo',
        phone: '77 577 50 18',
      });
      const result = matchContact(
        {
          fullName: 'BOUBACAR DIALLO',
          phone: null,
          functionTitle: null,
          notes: 'On plusieurs associations',
        },
        [existing],
      );
      expect(result.action).toBe('reuse');
      expect(result.matchedContactId).toBe('c1');
      expect(result.matchedOn).toBe('name');
    });

    it('does not create a duplicate for a phone already normalized differently (spacing/country code)', () => {
      const existing = candidate({
        id: 'c1',
        fullName: 'Awa Diop',
        phone: '+221 77 111 22 33',
      });
      const result = matchContact(
        {
          fullName: 'Awa Diop',
          phone: '77-111-22-33',
          functionTitle: null,
          notes: null,
        },
        [existing],
      );
      expect(result.action).toBe('reuse');
      expect(result.matchedContactId).toBe('c1');
    });

    it('enriches only the empty fields on reuse, leaving non-empty fields untouched', () => {
      const existing = candidate({
        id: 'c1',
        fullName: 'Awa Diop',
        phone: '77 111 22 33',
        functionTitle: 'Coordinatrice',
        notes: null,
      });
      const result = matchContact(
        {
          fullName: 'Awa Diop',
          phone: '77 111 22 33',
          functionTitle: 'Autre titre',
          notes: 'Nouvelle note',
        },
        [existing],
      );
      expect(result.action).toBe('reuse');
      // functionTitle already set on the existing contact -> not enriched
      // (never overwrite non-empty real data); notes was empty -> enriched.
      expect(result.enrichedFields).toEqual(['notes']);
    });

    it('reports an ambiguous match when several existing contacts share the same phone and name', () => {
      const a = candidate({
        id: 'c1',
        fullName: 'Awa Diop',
        phone: '77 111 22 33',
      });
      const b = candidate({
        id: 'c2',
        fullName: 'Awa Diop',
        phone: '77 111 22 33',
      });
      const result = matchContact(
        {
          fullName: 'Awa Diop',
          phone: '77 111 22 33',
          functionTitle: null,
          notes: null,
        },
        [a, b],
      );
      expect(result.action).toBe('ambiguous');
      expect(result.candidateIds.sort()).toEqual(['c1', 'c2']);
    });

    it('reports an ambiguous match when several existing contacts share the same name and the row has no phone', () => {
      const a = candidate({
        id: 'c1',
        fullName: 'Awa Diop',
        phone: '77 111 22 33',
      });
      const b = candidate({
        id: 'c2',
        fullName: 'Awa Diop',
        phone: '78 999 88 77',
      });
      const result = matchContact(
        { fullName: 'Awa Diop', phone: null, functionTitle: null, notes: null },
        [a, b],
      );
      expect(result.action).toBe('ambiguous');
      expect(result.matchedOn).toBe('name');
    });

    it('creates separately (flagged) instead of merging when a phone is shared by a differently-named contact', () => {
      const existing = candidate({
        id: 'c1',
        fullName: 'BARA',
        phone: '77 957 85 13',
      });
      const result = matchContact(
        {
          fullName: 'Dramé',
          phone: '77 957 85 13',
          functionTitle: null,
          notes: null,
        },
        [existing],
      );
      expect(result.action).toBe('create');
      expect(result.matchedContactId).toBeNull();
      expect(result.note).toMatch(/shares a phone with existing contact/);
    });

    it('creates a brand-new contact when nothing matches', () => {
      const result = matchContact(
        {
          fullName: 'Nouvelle Personne',
          phone: '77 000 00 00',
          functionTitle: null,
          notes: null,
        },
        [
          candidate({
            id: 'c1',
            fullName: "Quelqu'un d'autre",
            phone: '78 111 11 11',
          }),
        ],
      );
      expect(result.action).toBe('create');
      expect(result.note).toBeNull();
    });
  });
});
