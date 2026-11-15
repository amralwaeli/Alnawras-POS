const PAGE = 1000; // PostgREST's default max rows per request

/** Pages through a query so large result sets are not silently truncated at
 *  1000 rows. `build` must return a fresh, ORDERED query each call. */
export async function fetchAll<T = any>(build: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
