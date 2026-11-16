import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 pt-20">
      <h1 className="font-display text-6xl font-bold">Out of bounds</h1>
      <p className="mt-3 text-lg text-muted">That page doesn&apos;t exist. The tournament may have been renamed or removed.</p>
      <Link href="/tournaments" className="mt-6 inline-block rounded-md bg-ink px-5 py-3 font-semibold text-chalk hover:bg-pitch">
        Browse tournaments
      </Link>
    </div>
  );
}
