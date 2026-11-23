/** a `FacesMessage` of the growl (jakarta.faces.application.FacesMessage: severity + summary + detail) */
export interface FacesMessage {
  severity: 'info' | 'warn' | 'error';
  summary: string;
  detail: string;
}
