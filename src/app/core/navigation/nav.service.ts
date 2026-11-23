import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { ConfigService } from '../config/config.service';
import { PermissionService } from '../permissions/permission.service';
import { MenuLink, NavGroup, RAIL_ITEMS, RailItem, TOP_TAB_GROUPS, TabDef } from './nav.config';

export interface RailView extends RailItem {
  /** false → shown but not clickable (logo without FEATURE_CRM_Dashboard) */
  enabled: boolean;
}

/**
 * Turns nav.config.ts + the signed-in user's roles + the active route into what the shell renders.
 *
 *  group()      the active NavGroup (old `navbar_menu`); remembered when a page has none
 *  railItems()  visible left-rail items
 *  tabs()       visible top-bar tabs of the active group
 */
@Injectable({ providedIn: 'root' })
export class NavService {
  private readonly router = inject(Router);
  private readonly perm = inject(PermissionService);
  private readonly config = inject(ConfigService);

  private readonly url = signal(path(this.router.url));
  readonly group = signal<NavGroup>('home');

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.url.set(path(this.router.url));
        const group = deepest(this.router.routerState.snapshot.root).data['navGroup'] as NavGroup | null | undefined;
        if (group) this.group.set(group);
      });
  }

  readonly railItems = computed<RailView[]>(() =>
    RAIL_ITEMS.filter((item) => item.logo || this.itemVisible(item)).map((item) => ({
      ...item,
      enabled: this.perm.has(item.requires),
    })),
  );

  readonly tabs = computed<TabDef[]>(() => this.filterLinks(TOP_TAB_GROUPS[this.group()]) as TabDef[]);

  isRailActive(item: RailItem): boolean {
    return item.group === this.group();
  }

  /** A link is active when the current URL is its route or lies below it. */
  isActive(link: MenuLink): boolean {
    const url = this.url();
    for (const r of [link.route, ...(link.alsoActive ?? [])]) {
      if (r && (url === r || url.startsWith(`${r}/`))) return true;
    }
    return (link.children ?? []).some((child) => this.isActive(child));
  }

  private itemVisible(item: RailItem): boolean {
    if (item.hidden) return false;
    if (item.flag && !this.perm.flag(item.flag)) return false;
    return this.perm.has(item.requires);
  }

  private filterLinks(links: readonly MenuLink[]): MenuLink[] {
    const out: MenuLink[] = [];
    for (const link of links) {
      if (link.hidden || !this.perm.has(link.requires)) continue;
      if (link.children) {
        const children = this.filterLinks(link.children);
        if (!children.length && !link.route) continue; // empty dropdown
        out.push({ ...link, children });
      } else {
        out.push(link);
      }
    }
    return out;
  }
}

const path = (url: string) => url.split('?')[0].split('#')[0];

function deepest(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  let current = route;
  while (current.firstChild) current = current.firstChild;
  return current;
}
