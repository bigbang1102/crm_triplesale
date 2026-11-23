/**
 * `<script src>` / `<link rel="stylesheet">` of the Java pages, loaded on demand and only once per address — for the libraries and
 * helper scripts that a Java page includes itself (`resources/js/step_group_color.js`, `attach_file_types.js` … copied byte for byte
 * to `public/assets/java-js/`) and that define globals the page script uses.
 */
const scripts = new Map<string, Promise<void>>();
const styles = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scripts.delete(src); // a later call may try again
        el.remove();
        reject(new Error(`script could not be loaded: ${src}`));
      };
      document.head.appendChild(el);
    });
    scripts.set(src, p);
  }
  return p;
}

export function loadStyle(href: string): Promise<void> {
  let p = styles.get(href);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement('link');
      el.rel = 'stylesheet';
      el.href = href;
      el.onload = () => resolve();
      el.onerror = () => {
        styles.delete(href);
        el.remove();
        reject(new Error(`stylesheet could not be loaded: ${href}`));
      };
      document.head.appendChild(el);
    });
    styles.set(href, p);
  }
  return p;
}
