import { afterEach, describe, expect, it } from 'vitest';
import { resetMockupForTests, setDatasource } from '@core/mockup/mockup-datasource';
import { resetJournalsForTests } from '@core/mockup/mockup-journal';
import { createMockSupportingDocs } from './supporting-doc.mock';
import { SUPPORTING_DOC_TYPES } from './supporting-doc-types';

/** what the user saved is replayed at the next start: a create is recorded with its `id` argument as null (JSON has no undefined) */
describe('the supporting documents kept in the journal', () => {
  afterEach(() => {
    resetJournalsForTests();
    resetMockupForTests();
  });

  const family = SUPPORTING_DOC_TYPES[0];
  const body = { formType: family.formType, receiveDate: '2026-11-20', remark: 'จากไฟล์', receiveById: 2, customerId: 1 };

  it('should replay a create (id null) as a create, and an attach with the id of its file', async () => {
    setDatasource(
      {
        'journal.supporting-docs': [
          { method: 'CALL', url: 'save', body: JSON.stringify([family.formType, null, body]) },
          { method: 'CALL', url: 'attach', body: JSON.stringify([family.formType, '9999', { fileName: 'a.pdf', fileType: 'application/pdf', detail: '', contentBase64: '', storageId: '0123456789abcdef' }]) },
        ],
      },
      true,
    );
    const mock = createMockSupportingDocs({ delayMs: 0 });
    await mock.api.documents(family.formType, 1, 1); // the first call waits for the replay
    const created = mock.documents(family).find((d) => d['remark'] === 'จากไฟล์');
    expect(created).toBeDefined();
    const detail = JSON.parse(await mock.api.document(family.formType, String(created?.['id']))) as { result: { remark: string } };
    expect(detail.result.remark).toBe('จากไฟล์');
  });
});
