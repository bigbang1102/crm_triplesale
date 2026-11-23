import { FeatureFlag } from '../permissions/roles';
import registry from './page-registry.json';
import { NavGroup } from './nav.config';

export type PageStatus = 'live' | 'live-ui' | 'mock' | 'system';
export type PageSize = 'S' | 'M' | 'L' | 'XL';

/** One screen of the migration. Edit page-registry.json, not this file. */
export interface PageDef {
  id: string;
  /** Angular route path (relative to the shell), may contain :params */
  route: string;
  title: { th: string; en: string };
  navGroup: NavGroup | null;
  /** tab id inside TOP_TAB_GROUPS[navGroup] (documentation + consistency test) */
  navTab: string | null;
  /** OR-list of role keys; null = any signed-in user */
  requires: string | null;
  flag?: FeatureFlag;
  /** folder under src/app/features */
  feature: string;
  /** source files in triple_sale_main */
  legacy: string[];
  status: PageStatus;
  phase: number;
  size: PageSize;
  /** true once the real screen exists; false → the migration placeholder is shown */
  implemented: boolean;
  apis: string[];
  notes: string;
}

export interface PhaseDef {
  id: number;
  name: string;
  goal: string;
}

export const PAGES = registry.pages as unknown as PageDef[];
export const PHASES = registry.phases as PhaseDef[];

export function pageById(id: string): PageDef {
  const page = PAGES.find((p) => p.id === id);
  if (!page) throw new Error(`Unknown page id "${id}" — add it to page-registry.json`);
  return page;
}
