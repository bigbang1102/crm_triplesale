import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { forgetGroupCode } from '@core/auth/group-code.store';
import { ConfigService } from '@core/config/config.service';

/**
 * Where Keycloak sends the browser back to (`/auth/callback?code=…&state=…`): finishes the sign-in, then opens the page the user
 * came for. A user with several companies (and none chosen by the server) picks one here first, as in the mobile app: the page of the
 * Java login ("บัญชี … ใช้งานได้หลายบริษัท", a list, "เข้าสู่โปรแกรม") — it reuses the stylesheet generated for the login page (login.scss).
 * The same page is shown again when the user changes company from the top bar.
 */
@Component({
  selector: 'ts-auth-callback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../login/login.scss',
  host: { '[style.--ts-login-art]': 'art' },
  template: `
    <div class="login-body">
      <div class="left-panel">
        <div class="login-wrapper">
          <div class="brand-mobile"><img src="assets/images/triplesales-logo.png" alt="Triple Sales" /></div>
          <h1 class="login-title">ลงชื่อเข้าใช้ TrippleSales</h1>

          <div class="alert error" role="alert" [style.display]="error() ? 'block' : 'none'">{{ error() }}</div>

          @if (auth.companyChoice(); as companies) {
            <form autocomplete="off" (submit)="submit($event)">
              <p class="org-hint">
                บัญชี <b>{{ auth.companyChoiceUser() }}</b> ใช้งานได้หลายบริษัท<br />กรุณาเลือกบริษัทที่ต้องการเข้าใช้งาน
              </p>
              <div class="field">
                <label for="companySelect">บริษัท</label>
                <div class="control">
                  <select id="companySelect" [disabled]="busy()" (change)="pick($event)">
                    <option value="" [selected]="selected() === ''">-- กรุณาเลือกบริษัท --</option>
                    @for (c of companies; track c.id) {
                      <option [value]="c.id" [selected]="selected() === c.id">{{ c.name }} ({{ c.code }})</option>
                    }
                  </select>
                </div>
              </div>
              <button type="submit" class="login-btn" [disabled]="busy() || selected() === ''">{{ busy() ? 'กำลังเข้าสู่โปรแกรม…' : 'เข้าสู่โปรแกรม' }}</button>
            </form>
            <a href="login" class="forgot-link" (click)="backToLogin($event)">← กลับไปหน้าเข้าสู่ระบบ</a>
            <a href="login?changeGroup=1" class="forgot-link" (click)="changeGroup($event)">เปลี่ยนรหัสกลุ่ม</a>
          } @else if (auth.signInBlocked()) {
            <!-- NO_ACTIVE_COMPANY / NO_SYSTEM_ACCESS: a new sign-in cannot help (Keycloak would sign the user in again, round and round): a way OUT only -->
            <button type="button" class="login-btn" (click)="auth.signOutBlocked()">ออกจากระบบ</button>
          } @else if (error()) {
            <a href="login" class="forgot-link" (click)="backToLogin($event)">กลับไปหน้าเข้าสู่ระบบ</a>
          } @else {
            <p class="org-hint" role="status">กำลังเข้าสู่ระบบ…</p>
          }
        </div>
        <div class="version-tag">Version {{ version }}</div>
      </div>
      <div class="right-panel">
        <div class="right-content"><img class="brand-logo" src="assets/images/triplesales-logo.png" alt="Triple Sales" /></div>
      </div>
    </div>
  `,
})
export class AuthCallback implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly version = inject(ConfigService).value.branding.version;
  protected readonly art = `url("${new URL('assets/images/login-bg.jpg', document.baseURI).href}")`;
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  /** the id of the company picked in the list ('' = none yet: the button stays off) */
  protected readonly selected = signal('');

  async ngOnInit(): Promise<void> {
    document.documentElement.classList.add('ts-login-page'); // styles/_login-page.scss: the html/body rule of the Java page
    // sent here by EMPLOYEE_INACTIVE: the companies are already waiting (the sign-in itself is over) — only the choice is left
    if (this.auth.companyChoice()) return;
    // Keycloak ends a logout here too (post_logout_redirect_uri = this page, the address the client is registered with): nothing came
    // with it — no code, no state, no error — so the user has signed out and goes on to the login page
    const params = new URLSearchParams(window.location.search);
    if (!params.has('code') && !params.has('state') && !params.has('error')) {
      await this.router.navigateByUrl('/login', { replaceUrl: true });
      return;
    }
    try {
      const to = await this.auth.completeKeycloak(params);
      if (to) await this.open(to); // null = the user has to choose a company first
    } catch (err) {
      this.error.set(this.message(err, 'เข้าสู่ระบบไม่สำเร็จ'));
    }
  }

  ngOnDestroy(): void {
    document.documentElement.classList.remove('ts-login-page');
  }

  protected pick(event: Event): void {
    this.selected.set((event.target as HTMLSelectElement).value);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const id = this.selected();
    if (!id) return;
    this.error.set('');
    this.busy.set(true);
    try {
      await this.open(await this.auth.chooseCompany(id));
    } catch (err) {
      this.error.set(this.message(err, 'เลือกบริษัทไม่สำเร็จ'));
      this.busy.set(false);
    }
  }

  protected backToLogin(ev: Event): void {
    ev.preventDefault();
    this.auth.backToLogin();
  }

  /** leave this sign-in and ask for the group code again (the remembered one is forgotten) */
  protected changeGroup(ev: Event): void {
    ev.preventDefault();
    forgetGroupCode();
    this.auth.backToLogin();
  }

  private open(to: string): Promise<boolean> {
    // only same-site absolute paths (prevents open redirects)
    const safe = to.startsWith('/') && !to.startsWith('//') ? to : '/crm/home';
    if (this.auth.takeReloadAfterChoice()) {
      // a company switch: load the whole app again so nothing of the old company (menus, options, data) stays
      window.location.replace(new URL(safe.slice(1), document.baseURI).href);
      return Promise.resolve(true);
    }
    return this.router.navigateByUrl(safe, { replaceUrl: true });
  }

  private message(err: unknown, fallback: string): string {
    return err instanceof Error && err.message ? err.message : fallback;
  }
}
