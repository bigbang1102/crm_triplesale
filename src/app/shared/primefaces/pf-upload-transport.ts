/**
 * The server of the file upload.
 *
 * `p:fileUpload` is a real PrimeFaces widget here (assets/vendor/primefaces/fileupload.js): it validates the chosen files, draws its message list and its
 * rows, and posts each file to the action of the form with jQuery (`$.ajax`, multipart FormData, `dataType: 'xml'`) and processes the partial response.
 * The Java page had a server to receive that post; the SPA has none, so the post is answered here, by a jQuery ajax *transport* (the layer below `$.ajax`
 * that normally owns the XMLHttpRequest): the host's handler stores the files in the bean and draws the parts named by `update` again, then the widget
 * gets the (empty) partial response a server would have written, so its own `done` / `always` callbacks — `oncomplete`, the global `ajaxComplete`
 * of the page's scripts — run exactly as they do against a server.
 *
 * Only a PrimeFaces partial request with files is claimed (a FormData with `jakarta.faces.partial.ajax=true`); anything else keeps its XMLHttpRequest.
 */
interface JQueryStatic {
  ajaxTransport(dataType: string, factory: (options: { data?: unknown }) => unknown): void;
}

/** the post of one upload request: the files of the widget and the fields of the form */
export type UploadRequestHandler = (files: File[], fields: FormData) => Promise<void>;

/** what a server writes when nothing in the page changes: the widget's `done` handles `<partial-response>` */
const EMPTY_PARTIAL_RESPONSE = `<?xml version='1.0' encoding='UTF-8'?><partial-response id="j_id1"><changes></changes></partial-response>`;

let current: UploadRequestHandler | undefined;
let registered = false;

/** (un)sets the handler of the upload requests; the transport is registered once (jQuery has no way to remove one) */
export function setUploadHandler(handler: UploadRequestHandler | undefined): void {
  current = handler;
  const jq = (window as unknown as { jQuery?: JQueryStatic }).jQuery;
  if (!handler || registered || !jq) return;
  registered = true;
  jq.ajaxTransport('+*', (options) => {
    const data = options.data;
    if (!current || !(data instanceof FormData) || data.get('jakarta.faces.partial.ajax') !== 'true') return undefined;
    let aborted = false;
    return {
      send(_headers: unknown, complete: (status: number, text: string, responses: Record<string, unknown>) => void): void {
        // the widget names every file part after its own id (`paramName`), the request names it as the source
        const files = data.getAll(String(data.get('jakarta.faces.source') ?? '')).filter((f): f is File => f instanceof File);
        void (async () => {
          try {
            await current?.(files, data);
          } catch {
            if (!aborted) complete(500, 'error', { text: '' });
            return;
          }
          if (!aborted) complete(200, 'success', { xml: new DOMParser().parseFromString(EMPTY_PARTIAL_RESPONSE, 'text/xml') });
        })();
      },
      abort(): void {
        aborted = true;
      },
    };
  });
}
