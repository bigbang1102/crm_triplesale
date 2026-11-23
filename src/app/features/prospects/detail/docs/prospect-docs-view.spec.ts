import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { I18n } from '@core/i18n/i18n.service';
import { PermissionService } from '@core/permissions/permission.service';
import type { ProspectDoc } from '../../prospects.docs';
import { ProspectDocsView } from './prospect-docs-view';

const lang = signal<'th' | 'en'>('th');
const doc = (no: string, filename: string, kind: string): ProspectDoc => ({ no, attachfile: `http://f/prospect/7/${filename}`, description: filename, typecode: 'DOC', kind, filename });

describe('Prospect documents tab (generated from the form, edit look)', () => {
  let fixture: ComponentFixture<ProspectDocsView>;

  function setup(docs: ProspectDoc[], granted: { roles?: boolean; buttons?: boolean }) {
    TestBed.configureTestingModule({
      providers: [
        { provide: I18n, useValue: { lang, t: (k: string) => k } },
        { provide: PermissionService, useValue: { has: () => granted.roles ?? true, canUse: () => granted.buttons ?? true } },
      ],
    });
    fixture = TestBed.createComponent(ProspectDocsView);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentRef.setInput('id', '7');
    fixture.componentRef.setInput('docs', docs);
    fixture.componentRef.setInput('uploadAcceptExt', '.pdf,.jpg');
    fixture.componentRef.setInput('request', async () => new Response('{}'));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    fixture?.destroy();
    fixture?.nativeElement.remove();
  });

  it('lists the documents with download and delete, and the upload button', () => {
    const el = setup([doc('1', 'a.pdf', 'pdf'), doc('2', 'b.jpg', 'image')], {});
    expect(el.querySelectorAll('.ct-doc-row2').length).toBe(2);
    expect(el.querySelectorAll('.ct-doc-dl-btn').length).toBe(2);
    expect(el.querySelectorAll('.pi-trash').length).toBe(2);
    expect(el.querySelector('#ctMdUploadBtn')).toBeTruthy();
    expect(el.querySelector('#ctMdFileInput')!.getAttribute('accept')).toBe('.pdf,.jpg');
    expect(el.querySelector('.ct-doc-file-link')!.textContent).toContain('a.pdf');
  });

  it('keeps the permissions of the form: no upload button, no download link without them', () => {
    const el = setup([doc('1', 'a.pdf', 'pdf')], { roles: false, buttons: false });
    expect(el.querySelector('#ctMdUploadBtn')).toBeNull();
    expect(el.querySelector('.ct-doc-dl-btn')).toBeNull();
    expect(el.querySelectorAll('.ct-doc-row2').length).toBe(1);
  });

  it('says so when there is no document', () => {
    const el = setup([], {});
    expect(el.querySelectorAll('.ct-doc-row2').length).toBe(0);
    expect(el.textContent).toContain('label.contracts.empty_attachments');
  });
});
