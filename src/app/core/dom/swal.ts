/**
 * SweetAlert (v2 API) — the library `template.xhtml` loads for every Java page (`js/sweetalert/sweetalertv1.min.js` + `sweetalert.css`;
 * the file is called v1 but is v2). The generated page engines call `swal({...})` exactly as the Java pages do, so the dialogs
 * and toasts look and behave the same: `env.swal = (o) => loadSwal().then((swal) => swal(o))`.
 *
 * The files are the same bytes as in the Java project (MIT licence), served from `assets/vendor/sweetalert/` and loaded on first
 * use. The rules the template adds on top (`.swal-overlay` above everything, the blue confirm button) are in styles/_swal.scss.
 */
import { loadScript, loadStyle } from './load-script';

export interface SwalOptions {
  title?: string;
  text?: string;
  icon?: string;
  timer?: number;
  /** `false` = no buttons (a toast); `[cancel, ok]`; `{ cancel: …, confirm: … }` */
  buttons?: boolean | string[] | Record<string, unknown>;
  dangerMode?: boolean;
  closeOnClickOutside?: boolean;
  closeOnEsc?: boolean;
  content?: unknown;
  [key: string]: unknown;
}

/** what `swal(...)` resolves with: the value of the clicked button (`true` for OK, `null` for cancel, a string for an input) */
export type SwalFn = (options: SwalOptions | string, ...rest: unknown[]) => Promise<unknown>;

const BASE = 'assets/vendor/sweetalert/';

/** loads the stylesheet and the script once; resolves with `window.swal` */
export async function loadSwal(): Promise<SwalFn> {
  const w = window as unknown as { swal?: SwalFn };
  if (!w.swal) {
    await Promise.all([loadStyle(BASE + 'sweetalert.css'), loadScript(BASE + 'sweetalert.min.js')]);
    if (!w.swal) throw new Error('sweetalert did not define swal');
  }
  return w.swal;
}
