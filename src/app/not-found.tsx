import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { PHOTOS } from "@/components/Photo";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <section className="relative isolate overflow-hidden text-chalk">
      <Image src={PHOTOS.stadium} alt="" fill sizes="100vw" className="photo -z-10 object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-black/75" />
      <div className="mx-auto flex min-h-[70vh] max-w-7xl flex-col justify-end px-4 pb-16 md:px-6">
        <p className="font-score text-[12px] uppercase tracking-[0.2em] text-[#D7FF3A]">404 · Out</p>
        <h1 className="mt-3 font-display text-[clamp(4rem,12vw,10rem)] leading-[0.85]">Out of bounds</h1>
        <p className="mt-5 max-w-md text-lg text-chalk/85">That page doesn&apos;t exist. The tournament may have been renamed or removed.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/tournaments" className="inline-flex h-12 items-center rounded-full bg-[#D7FF3A] px-7 text-[13px] font-semibold uppercase tracking-[0.1em] text-[#0B0B0C] press">Browse tournaments</Link>
          <Link href="/" className="inline-flex h-12 items-center rounded-full border border-chalk/40 px-7 text-[13px] font-semibold uppercase tracking-[0.1em] hover:border-chalk">Home</Link>
        </div>
      </div>
    </section>
  );
}
