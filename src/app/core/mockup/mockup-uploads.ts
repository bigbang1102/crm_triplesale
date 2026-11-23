/**
 * Uploaded files of the mock pages → Storage/ (through the mockup file server), and back for a download.
 *
 * The services take an upload as JSON with `fileContentBase64` + `fileName`. A mock that keeps that in memory (and a journal that records
 * the body) would carry megabytes of base64 and lose the file at the next restart. `base64Upload` is a `prepare` step of the journal: it
 * puts the bytes in `Storage/<folder>/` and hands the mock the same call with `storageId` instead of the bytes. The mock then lists the file
 * under a `mockup-storage/<id>/<name>` address and answers its download with `fetchStored`.
 */
import { MOCKUP_API, storedFileUrl, uploadFile } from './mockup-client';
import type { PrepareCall } from './mockup-journal';

export const STORAGE_REF = 'mockup-storage/';

const TYPE_OF_EXT: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export const contentTypeOf = (fileName: string): string => TYPE_OF_EXT[fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';

/** the Storage id of a file address made by `storedRef` (`mockup-storage/<id>/<name>`), or undefined */
export function storageIdOf(url: string): string | undefined {
  const i = url.indexOf(STORAGE_REF);
  if (i < 0) return undefined;
  const id = url.slice(i + STORAGE_REF.length).split('/')[0];
  return /^[a-f0-9]{16}$/.test(id) ? id : undefined;
}

export const storedRef = (id: string, fileName: string): string => `${STORAGE_REF}${id}/${fileName}`;

function bytesOfBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64.replace(/^data:[^,]*,/, '').replace(/\s/g, ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * `prepare` for a mock whose upload call is `POST` + a JSON body `{ fileName, fileContentBase64, … }`.
 * @param matches which calls are uploads (by the address)
 * @param folderOf the folder of Storage/ for a body (e.g. `prospects/12`)
 * @param accepts a file name the mock would take; one it would refuse is not stored (no orphan file in Storage/) and the call goes to the mock as it is
 */
export function base64Upload(matches: (input: string) => boolean, folderOf: (body: Record<string, unknown>) => string, accepts: (fileName: string) => boolean = () => true): PrepareCall {
  return async (input, init) => {
    if ((init?.method ?? 'GET').toUpperCase() !== 'POST' || typeof init?.body !== 'string' || !matches(input)) return undefined;
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      return undefined;
    }
    const base64 = typeof body['fileContentBase64'] === 'string' ? body['fileContentBase64'] : '';
    const fileName = typeof body['fileName'] === 'string' && body['fileName'] !== '' ? body['fileName'] : 'document';
    // nothing to store (the mock will refuse the call itself), or a name the mock must fail on purpose: leave the call as it is
    if (base64.trim() === '' || !accepts(fileName)) return undefined;
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = bytesOfBase64(base64);
    } catch {
      return undefined;
    }
    const stored = await uploadFile(new Blob([bytes], { type: contentTypeOf(fileName) }), fileName, folderOf(body));
    if (!stored) return undefined;
    return { ...init, body: JSON.stringify({ ...body, fileContentBase64: '', storageId: stored.id }) };
  };
}

/** the file of a Storage address as a Response for a download / a preview, or undefined when the server does not have it */
export async function fetchStored(id: string, fileName: string, download: boolean): Promise<Response | undefined> {
  try {
    const res = await fetch(`${MOCKUP_API}/storage/${id}${download ? '?download=1' : ''}`);
    if (!res.ok) return undefined;
    const headers = new Headers({ 'Content-Type': res.headers.get('content-type') ?? contentTypeOf(fileName) });
    headers.set('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    return new Response(await res.arrayBuffer(), { status: 200, headers });
  } catch {
    return undefined;
  }
}

/**
 * The body of an upload call with its bytes moved to Storage/<folder>: the same body with `storageId` and an empty `field`.
 * undefined = nothing to move (no bytes, not base64) or the file server did not take the file — the caller goes on with the body as it is.
 */
export async function moveBase64ToStorage(body: Record<string, unknown>, folder: string, field: string, nameField: string): Promise<Record<string, unknown> | undefined> {
  const base64 = typeof body[field] === 'string' ? body[field] : '';
  const fileName = typeof body[nameField] === 'string' && body[nameField] !== '' ? body[nameField] : 'document';
  if (base64.trim() === '') return undefined;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = bytesOfBase64(base64);
  } catch {
    return undefined;
  }
  const stored = await uploadFile(new Blob([bytes], { type: contentTypeOf(fileName) }), fileName, folder);
  return stored ? { ...body, [field]: '', storageId: stored.id } : undefined;
}

/** a file address the page shows: a Storage address becomes the address the file server serves (anything else is left as it is) */
export const resolveStoredUrl = (url: string): string => {
  const id = storageIdOf(url);
  return id ? storedFileUrl(id) : url;
};
