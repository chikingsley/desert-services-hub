/** SWR fetcher — throws on non-OK responses so SWR surfaces the error. */
export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const details = text ? ` — ${text.slice(0, 200)}` : "";
    throw new Error(
      `Failed to fetch ${url}: ${res.status} ${res.statusText}${details}`
    );
  }
  return res.json() as Promise<T>;
}
