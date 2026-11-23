import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_PROSPECT_COUNT, prospectIds, seedProspect } from '@core/mock/crm-seed';
import { resetSharedDb, sharedDb } from '@core/mock/shared-db';
import {
  crmPhone,
  mergeProspects,
  syncProspectsToCrm,
  type SmartDocProspect,
} from './smart-doc.crm';

const sample: SmartDocProspect = {
  code: 'P26-00101',
  name: 'สมชาย ใจดี',
  taxId: '3101200456781',
  addr: '88/12 ถนนพหลโยธิน',
  prov: 'กรุงเทพมหานคร',
  zip: '10900',
  country: 'ไทย',
  tel: '0812345678',
  email: 'somchai@example.com',
  fax: '',
};

describe('smart doc ↔ CRM customers', () => {
  beforeEach(() => resetSharedDb());

  it('crmPhone should write a 10 / 9 digit number the way CRM does and keep any other as typed', () => {
    expect(crmPhone('0812345678')).toBe('081-234-5678');
    expect(crmPhone('021234567')).toBe('02-123-4567');
    expect(crmPhone('1234')).toBe('1234');
  });

  describe('mergeProspects', () => {
    it('should list every CRM customer after the samples when the quotation opens', () => {
      const list = mergeProspects([sample]);
      expect(list).toHaveLength(1 + SEED_PROSPECT_COUNT);
      expect(list[0]?.code).toBe('P26-00101');
      const first = seedProspect(1);
      expect(list[1]).toMatchObject({
        code: first.code,
        name: first.fullName,
        prov: first.province,
        email: first.email,
        tel: first.phone.replace(/\D/g, ''),
        country: 'ไทย',
      });
    });

    it('should keep the fields only Smart Doc has but take the name from CRM when a CRM customer was saved before', () => {
      const crm = seedProspect(2);
      const saved = {
        ...sample,
        code: crm.code,
        name: 'ชื่อเก่า',
        taxId: '0105559012345',
        addr: 'ที่อยู่ในใบเสนอราคา',
      };
      const merged = mergeProspects([saved]).find((p) => p.code === crm.code);
      expect(merged).toMatchObject({
        name: crm.fullName,
        taxId: '0105559012345',
        addr: 'ที่อยู่ในใบเสนอราคา',
      });
    });
  });

  describe('syncProspectsToCrm', () => {
    it('should update the CRM customer when the quotation edited its name, phone, e-mail or province', () => {
      const crm = seedProspect(3);
      const edited = {
        ...mergeProspects([]).find((p) => p.code === crm.code)!,
        name: 'วิภา ใหม่ใจ',
        tel: '0899999999',
      };
      const out = syncProspectsToCrm([edited], new Set());
      expect(out).toEqual({ created: [], updated: [crm.code] });
      expect(seedProspect(3)).toMatchObject({
        fullName: 'วิภา ใหม่ใจ',
        firstName: 'วิภา',
        lastName: 'ใหม่ใจ',
        phone: '089-999-9999',
      });
    });

    it('should leave CRM alone when nothing CRM keeps was changed (only the tax id)', () => {
      const same = {
        ...mergeProspects([]).find((p) => p.code === seedProspect(4).code)!,
        taxId: '0105559012345',
      };
      expect(syncProspectsToCrm([same], new Set())).toEqual({ created: [], updated: [] });
      expect(sharedDb().prospects).toEqual({});
    });

    it('should add a customer created in the quotation to CRM once', () => {
      const created = { ...sample, code: 'P26-00286', name: 'ร้าน ใหม่ จำกัด' };
      expect(syncProspectsToCrm([created], new Set()).created).toEqual(['P26-00286']);
      expect(prospectIds()).toContain(3000);
      expect(seedProspect(3000)).toMatchObject({
        code: 'P26-00286',
        fullName: 'ร้าน ใหม่ จำกัด',
        source: 'Smart Doc',
      });
      expect(syncProspectsToCrm([created], new Set())).toEqual({ created: [], updated: [] });
    });

    it('should keep the samples of the prototype out of CRM', () => {
      expect(syncProspectsToCrm([sample], new Set(['P26-00101']))).toEqual({
        created: [],
        updated: [],
      });
      expect(sharedDb().addedProspects).toEqual([]);
    });
  });
});
