/**
 * The mockup's row actions of the sales-document list. The generated list engine (`sales-doc-list.engine.ts`) draws a row with a disabled print
 * button only; the saved documents (sales-doc-store.ts) can be opened, edited and deleted, so the host adds — after the engine has drawn the rows —
 * a link on the number (the detail page) and a delete button in an extra column. Framework-free apart from the DOM.
 */

export interface RowActionLabels {
  /** the header of the extra column and the title of its button */
  delete: string;
}

export interface RowActionHandlers {
  /** the number of the row to delete; resolves true when it was deleted (the row is then removed from the table) */
  remove: (no: string) => Promise<boolean>;
}

const DELETE_ICON = '<i class="fas fa-trash-alt" aria-hidden="true"></i>';
const ACTION_ATTR = 'data-sd-actions';

function decorateRow(tr: HTMLTableRowElement, type: string, labels: RowActionLabels): void {
  if (tr.hasAttribute(ACTION_ATTR) || tr.classList.contains('qml-empty')) return;
  const first = tr.firstElementChild;
  const no = (first?.textContent ?? '').trim();
  if (!first || !no) return;
  tr.setAttribute(ACTION_ATTR, '');
  first.textContent = '';
  const link = document.createElement('a');
  link.href = `/sales/docs/${type}/${encodeURIComponent(no)}`;
  link.textContent = no;
  first.appendChild(link);
  const cell = document.createElement('td');
  cell.className = 'c';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'qml-pbtn';
  button.setAttribute('data-sd-delete', no);
  button.setAttribute('aria-label', `${labels.delete} ${no}`);
  button.title = labels.delete;
  button.innerHTML = DELETE_ICON;
  cell.appendChild(button);
  tr.appendChild(cell);
}

function addHeader(body: HTMLElement, labels: RowActionLabels): void {
  const headRow = body.closest('table')?.querySelector('thead tr');
  if (!headRow || headRow.hasAttribute(ACTION_ATTR)) return;
  headRow.setAttribute(ACTION_ATTR, '');
  const th = document.createElement('th');
  th.className = 'c';
  th.textContent = labels.delete;
  headRow.appendChild(th);
}

/** starts the actions on the table body of the list; returns the function that stops them */
export function attachRowActions(body: HTMLElement, type: string, labels: RowActionLabels, handlers: RowActionHandlers): () => void {
  const decorate = (): void => {
    const rows = [...body.querySelectorAll<HTMLTableRowElement>('tr')];
    if (rows.some((r) => !r.classList.contains('qml-empty'))) addHeader(body, labels);
    for (const tr of rows) decorateRow(tr, type, labels);
  };
  const onClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-sd-delete]');
    if (!button || !body.contains(button)) return;
    const no = button.getAttribute('data-sd-delete') ?? '';
    void handlers.remove(no).then((deleted) => {
      if (deleted) button.closest('tr')?.remove();
    });
  };
  const observer = new MutationObserver(decorate);
  observer.observe(body, { childList: true });
  body.addEventListener('click', onClick);
  decorate();
  return () => {
    observer.disconnect();
    body.removeEventListener('click', onClick);
  };
}
