import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { I18n } from '@core/i18n/i18n.service';
import { DialogHost } from '@shared/ui/notify/dialog-host';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { ToastHost } from '@shared/ui/notify/toast-host';

/** Root: router outlet + the global overlays (dialogs, toasts) + the session-expired handler. */
@Component({
  selector: 'ts-root',
  imports: [RouterOutlet, DialogHost, ToastHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <ts-dialog-host />
    <ts-toast-host />
  `,
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(DialogService);
  private readonly router = inject(Router);
  private readonly t = inject(I18n).t;

  constructor() {
    // A signed-in user's session ended (401 {authRequired}) → tell them, then go to /login.
    effect(() => {
      const code = this.auth.expiredCode();
      if (!code) return;
      untracked(() => {
        this.auth.clearExpired();
        // the code of the 401 says why the session ended (SESSION_REPLACED / EMPLOYEE_INACTIVE have their own words)
        const why = code === 'SESSION_REPLACED' ? 'replaced' : code === 'EMPLOYEE_INACTIVE' ? 'inactive' : 'expired';
        void this.dialog
          .alert({ title: this.t(`app.session.${why}Title`), text: this.t(`app.session.${why}Text`) })
          .then(() => this.router.navigate(['/login'], { queryParams: { auth: code } }));
      });
    });

    // 409 COMPANY_CHANGED: another tab changed the company → tell the user, then load the page again with the new one
    effect(() => {
      if (!this.auth.companyChanged()) return;
      untracked(() => {
        void this.dialog
          .alert({ title: this.t('app.company.changedTitle'), text: this.t('app.company.changedText') })
          .then(() => {
            this.auth.clearCompanyChanged();
            window.location.reload();
          });
      });
    });
  }
}
