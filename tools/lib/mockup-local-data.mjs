/**
 * The local Datasource of `npm run mockup` (no shared server): a folder on this machine — `.mockup-data/Datasource` (one JSON document per name) and
 * `.mockup-data/Storage` (uploaded files) — served by tools/mockup-server.mjs on 127.0.0.1.
 *
 * The pages start from the seeds of their own code, so the only documents the folder must hold from the first run are the ones of the pretend
 * sign-in (tools/lib/mockup-idp.mjs): the group code, the companies, the role groups and the test accounts. They are written only when the
 * file is missing — whatever somebody edited, or what the pages saved, is never touched. The accounts are TEST accounts: the password is the
 * user name (never put a real password in a Datasource).
 *
 *   sign in:  group code  sun   ·   user  admin / admin   (all rights, super_admin)   ·   demo / demo   (all rights)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BRANCHES = [{ id: 1004400123, code: 'SUN', name: 'SUN GATEWAY', nameTh: 'SUN GATEWAY' }];
const GROUPS = [{ code: 'sun', internalCode: 'g1042' }];
const ROLES = [{ code: 'all', name: 'ทุกสิทธิ์', description: 'every permission the app knows', grant: ['*', 'super_admin'] }];
const user = (username, profileName, employeeId, employeeCode, extra = {}) => ({
  username,
  password: username,
  profileName,
  employeeId,
  employeeCode,
  roleGroups: ['all'],
  branches: ['SUN'],
  ...extra,
});
const USERS = [user('admin', 'ผู้ดูแลระบบ (ทดลอง)', 1, 'E001'), user('demo', 'ผู้ใช้ทดลอง', 2, 'E002')];

const DOCUMENTS = { branches: BRANCHES, groups: GROUPS, roles: ROLES, users: USERS };

/** creates the folders and the sign-in documents that are not there yet; gives the names of the documents it wrote */
export async function ensureLocalData(dataDir) {
  const datasource = join(dataDir, 'Datasource');
  await mkdir(datasource, { recursive: true });
  await mkdir(join(dataDir, 'Storage'), { recursive: true });
  const written = [];
  for (const [name, doc] of Object.entries(DOCUMENTS)) {
    const file = join(datasource, `${name}.json`);
    try {
      await readFile(file);
    } catch {
      await writeFile(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
      written.push(name);
    }
  }
  return { datasource, storage: join(dataDir, 'Storage'), written };
}
