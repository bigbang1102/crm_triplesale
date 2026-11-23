import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { forgetGroupCode, rememberGroupCode, rememberedGroupCode } from '@core/auth/group-code.store';
import { ConfigService } from '@core/config/config.service';

/**
 * Login page when Keycloak is on and `keycloak.groupApi` is set: asks for the group code (รหัสกลุ่ม) instead of user / password.
 * The code is looked up (GET /auth/groups/{code}); a 200 sends the browser to Keycloak of that group, anything else is shown here.
 * The code that was accepted is remembered for the browser session (`group-code.store.ts`): the next visit of this page goes on to
 * Keycloak by itself and the code is not asked again, until the session ends or the user changes the group (`?changeGroup=1`).
 * Same look as the Java login page: it reuses the stylesheet generated for it (login.scss) — nothing of the generated page is edited.
 */
@Component({
  selector: 'ts-group-login',
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

          @if (resuming()) {
            <p class="org-hint" role="status">กำลังเข้าสู่ระบบของกลุ่ม <b>{{ resuming() }}</b> …</p>
            <a href="login?changeGroup=1" class="forgot-link" (click)="changeGroup($event)">เปลี่ยนรหัสกลุ่ม</a>
          } @else {
            <form autocomplete="off" (submit)="submit($event, group.value)">
              <div class="field">
                <label for="groupCode">รหัสกลุ่ม</label>
                <div class="control">
                  <input #group id="groupCode" type="text" placeholder="ระบุรหัสกลุ่มของคุณ" autocomplete="off" autofocus maxlength="50" [disabled]="busy()" />
                </div>
              </div>
              <button type="submit" class="login-btn" [disabled]="busy()">{{ busy() ? 'กำลังตรวจสอบ…' : 'ถัดไป' }}</button>
            </form>
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
export class GroupLogin implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly version = inject(ConfigService).value.branding.version;
  protected readonly art = `url("${new URL('assets/images/login-bg.jpg', document.baseURI).href}")`;
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  /** the remembered group code while the page goes on to Keycloak by itself ('' = the form is shown) */
  protected readonly resuming = signal('');

  ngOnInit(): void {
    if (this.auth.isAuthenticated()) {
      void this.router.navigateByUrl(this.returnUrl());
      return;
    }
    document.documentElement.classList.add('ts-login-page'); // styles/_login-page.scss: the html/body rule of the Java page
    if (this.route.snapshot.queryParamMap.has('changeGroup')) {
      forgetGroupCode();
      return;
    }
    const remembered = rememberedGroupCode();
    if (remembered) {
      this.resuming.set(remembered);
      void this.enter(remembered);
    }
  }

  ngOnDestroy(): void {
    document.documentElement.classList.remove('ts-login-page');
  }

  protected async submit(event: Event, value: string): Promise<void> {
    event.preventDefault();
    const code = value.trim();
    if (!code) {
      this.error.set('กรุณาระบุรหัสกลุ่ม');
      return;
    }
    await this.enter(code);
  }

  /** "เปลี่ยนรหัสกลุ่ม": forget the code and ask for it again */
  protected changeGroup(event: Event): void {
    event.preventDefault();
    forgetGroupCode();
    this.resuming.set('');
    this.error.set('');
    this.busy.set(false);
  }

  private async enter(code: string): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    rememberGroupCode(code); // before the browser leaves for Keycloak; an unknown group rejects below and is forgotten again
    try {
      await this.auth.startKeycloak(this.returnUrl(), code); // 200 → the browser leaves for Keycloak
    } catch (err) {
      forgetGroupCode(); // a code that no longer works is not asked of the user again as a "remembered" one
      this.resuming.set('');
      this.error.set(err instanceof Error && err.message ? err.message : 'เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่');
      this.busy.set(false);
    }
  }

  private returnUrl(): string {
    const r = this.route.snapshot.queryParamMap.get('returnUrl');
    return r && r.startsWith('/') && !r.startsWith('//') ? r : '/crm/home';
  }
}
