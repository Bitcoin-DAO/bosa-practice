// Browser storage (IndexedDB). Everything here is per device; nothing is shared.
import { createStore, del, get, set } from 'idb-keyval';
import type { TestTreasuryKey, Wrapped } from '../core/identity';

const db = createStore('btc-dao', 'kv');

/** A founder's sign-up, kept in this browser until the DAO is founded (protocol 3.5 step 2). */
export interface PendingFounder {
  site: string;
  /** founder: before the genesis; candidate: joining later; rekey: a new key for an existing member. */
  role?: 'founder' | 'candidate' | 'rekey';
  name: string;
  secret: string;
  pubkey: string;
  credId?: string;
  prfSupported: boolean;
  council: boolean;
  treasury?: TestTreasuryKey;
  createdAt: number;
}

/** A member's identity for one DAO on this device. */
export interface LocalIdentity {
  daoId: string;
  pubkey: string;
  credId?: string;
  wrapped?: Wrapped; // passkey-protected copy
  plain?: string; // only where the phone has no PRF (protocol 1.5)
  treasury?: TestTreasuryKey; // council test key, trial only
}

export interface SetupFounder {
  name: string;
  key: string;
  verified: 'in_person' | 'remote';
}

export interface SetupCouncil {
  name: string;
  key: string;
  fingerprint: string;
  xpub: string;
}

export interface SetupState {
  site: string;
  name: string;
  description: string;
  council: SetupCouncil[];
  founders: SetupFounder[];
  threshold: number;
  genesisId?: string;
  daoId?: string;
  genesisJson?: string;
}

const k = {
  pending: (site: string) => `pending:${site}`,
  identity: (daoId: string) => `identity:${daoId}`,
  setup: (site: string) => `setup:${site}`,
};

export const store = {
  getPending: (site: string) => get<PendingFounder>(k.pending(site), db),
  setPending: (p: PendingFounder) => set(k.pending(p.site), p, db),
  clearPending: (site: string) => del(k.pending(site), db),
  getIdentity: (daoId: string) => get<LocalIdentity>(k.identity(daoId), db),
  setIdentity: (i: LocalIdentity) => set(k.identity(i.daoId), i, db),
  clearIdentity: (daoId: string) => del(k.identity(daoId), db),
  getSetup: (site: string) => get<SetupState>(k.setup(site), db),
  setSetup: (s: SetupState) => set(k.setup(s.site), s, db),
  clearSetup: (site: string) => del(k.setup(site), db),
};

/** The unlocked identity key lives only in this tab's session storage. */
export const session = {
  get: (daoId: string) => sessionStorage.getItem(`session:${daoId}`) ?? undefined,
  set: (daoId: string, secret: string) => sessionStorage.setItem(`session:${daoId}`, secret),
  clear: (daoId: string) => sessionStorage.removeItem(`session:${daoId}`),
};

/** The last treasury view read from the chain, per DAO, so a page shows it at once instead of waiting. */
export const treasuryCache = {
  get<T>(daoId: string): { at: number; view: T } | undefined {
    try {
      const v = localStorage.getItem(`treasury:${daoId}`);
      return v ? JSON.parse(v) : undefined;
    } catch {
      return undefined;
    }
  },
  set(daoId: string, view: unknown) {
    try {
      localStorage.setItem(`treasury:${daoId}`, JSON.stringify({ at: Date.now(), view }));
    } catch {
      /* ignore */
    }
  },
};

export const prefs = {
  lang(): 'it' | 'en' | undefined {
    try {
      const v = localStorage.getItem('lang');
      return v === 'it' || v === 'en' ? v : undefined;
    } catch {
      return undefined;
    }
  },
  setLang(v: 'it' | 'en') {
    try {
      localStorage.setItem('lang', v);
    } catch {
      /* ignore */
    }
  },
};
