/** Skeleton while a workspace section loads: the shape of a section, not a lone "Loading…". */
export default function Loading() {
  const bar = "animate-pulse rounded-lg bg-line/70 motion-reduce:animate-none";
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6">
      <div className={`${bar} h-9 w-56`} />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className={`${bar} h-24`} />)}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className={`${bar} h-11`} />)}
      </div>
    </div>
  );
}
