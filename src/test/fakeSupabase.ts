/**
 * Minimal in-memory stand-in for the Supabase query builder, for controller
 * integration tests. Supports the subset the HR / performance controllers use:
 * select / insert / update / upsert / delete, eq / neq / gte / lte / is,
 * order (no-op), limit, range, single / maybeSingle, the `orders(table_id)`
 * embed, and `{ count: 'exact', head: true }`.
 *
 * Every operation is recorded in `log`, so tests can assert which tables were
 * read and — more importantly — which were written.
 */
type Row = Record<string, any>;
export interface OpLog { table: string; op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' }

export function createFakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  const log: OpLog[] = [];
  const failures: Record<string, string> = {}; // "table:op" -> error message

  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let op: OpLog['op'] = 'select';
    let payload: any;
    let upsertKeys: string[] = [];
    let selectStr = '*';
    let single = false;
    let range: [number, number] | null = null;
    let limitN: number | null = null;
    let head = false;

    const embed = (r: Row): Row => {
      if (!/orders\(/.test(selectStr)) return { ...r };
      const parent = (tables.orders ?? []).find(o => o.id === r.order_id);
      return { ...r, orders: parent ? { table_id: parent.table_id ?? null } : null };
    };

    const exec = () => {
      const fail = failures[`${table}:${op}`];
      if (fail) return { data: null, error: { message: fail }, count: null };
      tables[table] ??= [];
      log.push({ table, op });
      const rows = tables[table];
      const match = rows.filter(r => filters.every(f => f(r)));

      if (op === 'insert' || op === 'upsert') {
        const items = (Array.isArray(payload) ? payload : [payload]).map(p => ({ ...p }));
        for (const item of items) {
          const idx = op === 'upsert'
            ? rows.findIndex(r => upsertKeys.every(k => r[k] === item[k]))
            : -1;
          if (idx >= 0) rows[idx] = { ...rows[idx], ...item };
          else rows.push(item);
        }
        return { data: single ? items[0] : items, error: null };
      }
      if (op === 'update') {
        match.forEach(r => Object.assign(r, payload));
        const out = match.map(r => ({ ...r }));
        return { data: single ? out[0] ?? null : out, error: null };
      }
      if (op === 'delete') {
        tables[table] = rows.filter(r => !match.includes(r));
        return { data: null, error: null };
      }
      // select
      if (head) return { data: null, error: null, count: match.length };
      let out = match.map(embed);
      if (range) out = out.slice(range[0], range[1] + 1);
      if (limitN !== null) out = out.slice(0, limitN);
      return { data: single ? out[0] ?? null : out, error: null, count: match.length };
    };

    const b: any = {
      select(s = '*', opts?: { head?: boolean }) { selectStr = s; if (opts?.head) head = true; return b; },
      insert(p: any) { op = 'insert'; payload = p; return b; },
      upsert(p: any, opts?: { onConflict?: string }) {
        op = 'upsert'; payload = p; upsertKeys = (opts?.onConflict ?? 'id').split(','); return b;
      },
      update(p: any) { op = 'update'; payload = p; return b; },
      delete() { op = 'delete'; return b; },
      eq(c: string, v: any) { filters.push(r => r[c] === v); return b; },
      neq(c: string, v: any) { filters.push(r => r[c] !== v); return b; },
      gte(c: string, v: any) { filters.push(r => r[c] != null && r[c] >= v); return b; },
      lte(c: string, v: any) { filters.push(r => r[c] != null && r[c] <= v); return b; },
      is(c: string, v: any) { filters.push(r => (r[c] ?? null) === v); return b; },
      order() { return b; },
      limit(n: number) { limitN = n; return b; },
      range(a: number, z: number) { range = [a, z]; return b; },
      single() { single = true; return b; },
      maybeSingle() { single = true; return b; },
      then(res: any, rej: any) { return Promise.resolve(exec()).then(res, rej); },
    };
    return b;
  }

  return {
    client: { from },
    tables,
    log,
    failOn(table: string, op: OpLog['op'], message: string) { failures[`${table}:${op}`] = message; },
    writes: () => log.filter(l => l.op !== 'select'),
  };
}

export type FakeDb = ReturnType<typeof createFakeDb>;
