/**
 * The four run-sheet modules (stream, media, MC, merch). Pure; the server checks `needs` with `canAny`
 * from lib/roles.ts, and a test pins that these match the portal menu so the two can't drift.
 */
export const MODULE_IDS = ['stream', 'media', 'mc', 'merch'] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export const MODULE_STATUSES = ['todo', 'doing', 'done'] as const;
export type ModuleStatus = (typeof MODULE_STATUSES)[number];

export interface ModuleDef {
  label: string;
  blurb: string;
  /** Anyone holding one of these can read and edit the sheet (admin holds all) */
  needs: readonly string[];
  /** What an item is called on screen */
  item: string;
  useQty?: boolean;
  useLink?: boolean;
}

export const MODULES: Record<ModuleId, ModuleDef> = {
  stream: {
    label: 'Stream',
    blurb: 'Run of show and tech checklist for the livestream: scenes, cameras, audio, overlays.',
    needs: ['stream.control', 'stream.tech'],
    item: 'Step',
  },
  media: {
    label: 'Video & pictures',
    blurb: 'Shot list and delivery: who is shooting what, and where the files end up.',
    needs: ['media.upload', 'media.publish'],
    item: 'Shot',
    useLink: true,
  },
  mc: {
    label: 'MC',
    blurb: 'The announcer\'s script: openers, sponsor reads, shout-outs and reminders.',
    needs: ['mc.script'],
    item: 'Line',
  },
  merch: {
    label: 'Merch',
    blurb: 'What is on the table and how many are left.',
    needs: ['merch.manage'],
    item: 'Item',
    useQty: true,
  },
};

export const isModuleId = (v: unknown): v is ModuleId => typeof v === 'string' && (MODULE_IDS as readonly string[]).includes(v);
