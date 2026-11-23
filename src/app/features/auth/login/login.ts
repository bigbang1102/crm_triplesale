import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { startInputGuard } from '@core/dom/input-guard';
import { I18n } from '@core/i18n/i18n.service';
import { loginEntry, startLogin } from './login.engine';

/** `<meta name="viewport">` of web/index.xhtml: no pinch zoom on the sign-in page */
const VIEWPORT = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0';

/**
 * Login page — web/index.xhtml of the Java app, generated from it (`npm run login:sync`): markup, stylesheet and the two
 * scripts are the Java file's (login.html / login.scss / login.engine.ts — never edit them). This class is the host:
 *
 *   - gives the engine what Java had from the browser: the call to POST /login_proxy (AuthService.proxy), the way into the
 *     app once the sign-in is COMPLETE (the session is read, then Home — or the page the user came from, `?returnUrl=`),
 *     and "is this tab already signed in" for the arrival check;
 *   - the Java page does not use template.xhtml, so of the template's scripts only input_guard.js reaches it (it adds that one
 *     itself); the Shell (DomGuards, ODS, the FAB …) is not around the login page here either;
 *   - the sign-in page is always Thai in Java: a new session has no language, and LoginProxyServlet deliberately does not
 *     restore the one the user chose before ("ภาษาไทยเป็น default เสมอ ตอน login").
 */
@Component({
  selector: 'ts-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html',
  styleUrl: './login.scss',
  host: {
    '[style.--ts-login-art]': 'art',
    '[style.visibility]': "entry === 'redirect' ? 'hidden' : null",
  },
})
export class Login implements OnInit, AfterViewInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(I18n);

  /** "Version {{ version }}" of the footer (Java: commonBean.version) */
  protected readonly version = inject(ConfigService).value.branding.version;
  /** the picture of the right-hand panel; absolute so it resolves against <base href> from inside the stylesheet */
  protected readonly art = `url("${new URL('assets/images/login-bg.jpg', document.baseURI).href}")`;
  protected entry: 'show' | 'redirect' = 'show';

  private stops: Array<() => void> = [];
  private viewport: { meta: Element; content: string | null } | null = null;

  ngOnInit(): void {
    this.entry = loginEntry({ signedIn: () => this.auth.isAuthenticated(), redirectHome: () => void this.goHome() });
    if (this.entry === 'redirect') return;

    // Keycloak on: leave for its login page (the old form stays reachable at /login?local=1)
    if (this.auth.keycloakEnabled() && !this.auth.keycloakAsksGroup() && this.route.snapshot.queryParamMap.get('local') !== '1') {
      this.entry = 'redirect';
      this.auth.startKeycloak(this.returnUrl()).catch((err: unknown) => {
        // group unknown / Keycloak unreachable: show the old form instead of a blank page
        console.warn('[keycloak] could not start the sign-in', err);
        void this.router.navigate(['/login'], { queryParams: { local: '1', returnUrl: this.returnUrl() } });
      });
      return;
    }

    document.documentElement.classList.add('ts-login-page'); // styles/_login-page.scss: the html/body rule of the Java page
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      this.viewport = { meta, content: meta.getAttribute('content') };
      meta.setAttribute('content', VIEWPORT);
    }
    if (this.i18n.lang() !== 'th') void this.i18n.use('th');
  }

  ngAfterViewInit(): void {
    if (this.entry === 'redirect') return;
    this.stops.push(
      startLogin({
        root: this.el.nativeElement,
        post: (payload) => this.auth.proxy(payload),
        enter: async () => {
          await this.auth.completeSignIn();
          await this.goHome();
        },
      }),
      // window.INPUT_GUARD_I18N = { blocked: commonBean.msg['label.guard.special_char'] } + input_guard.js, as in index.xhtml
      startInputGuard({ message: () => this.i18n.t('label.guard.special_char'), pageNames: () => [] }),
    );
  }

  ngOnDestroy(): void {
    this.stops.splice(0).forEach((stop) => stop());
    document.documentElement.classList.remove('ts-login-page');
    if (this.viewport) {
      if (this.viewport.content === null) this.viewport.meta.removeAttribute('content');
      else this.viewport.meta.setAttribute('content', this.viewport.content);
      this.viewport = null;
    }
  }

  /** Java: DASHBOARD_URL = pages/index.face (Home). The SPA also returns to the page the route guard sent the user from. */
  private async goHome(): Promise<void> {
    await this.router.navigateByUrl(this.returnUrl());
  }

  private returnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    // only same-site absolute paths (prevents open redirects)
    return returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/crm/home';
  }
}
