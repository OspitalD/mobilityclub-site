// Blobs simulé partagé par les tests de l'espace Kit App Sexy. Importé AVANT le module testé :
// mock.module doit être posé avant le premier import de @netlify/blobs.
import { mock } from 'node:test';

export const stores = new Map();
export const magasin = (nom) => { if (!stores.has(nom)) stores.set(nom, new Map()); return stores.get(nom); };

mock.module('@netlify/blobs', {
  namedExports: {
    connectLambda: () => {},
    getStore: (opt) => {
      const M = magasin(typeof opt === 'string' ? opt : opt?.name);
      return {
        get: async (key, { type } = {}) => {
          if (!M.has(key)) return null;
          const e = M.get(key);
          if (type === 'json') return e.kind === 'json' ? structuredClone(e.v) : JSON.parse(Buffer.from(e.v).toString('utf8'));
          if (type === 'arrayBuffer') {
            const b = Buffer.from(e.kind === 'json' ? JSON.stringify(e.v) : e.v);
            return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
          }
          return e.kind === 'json' ? JSON.stringify(e.v) : Buffer.from(e.v).toString('utf8');
        },
        set: async (key, value, { onlyIfNew } = {}) => {
          if (onlyIfNew && M.has(key)) return { modified: false };
          M.set(key, { kind: 'raw', v: typeof value === 'string' ? value : Buffer.from(value) });
          return { modified: true };
        },
        setJSON: async (key, value, { onlyIfNew } = {}) => {
          if (onlyIfNew && M.has(key)) return { modified: false };
          M.set(key, { kind: 'json', v: structuredClone(value) });
          return { modified: true };
        },
        delete: async (key) => { M.delete(key); },
        list: async ({ prefix = '' } = {}) => ({ blobs: [...M.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
      };
    },
  },
});
