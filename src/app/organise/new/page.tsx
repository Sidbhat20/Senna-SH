import type { Metadata } from "next";
import { Wizard } from "./Wizard";

export const metadata: Metadata = { title: "Create a tournament" };

export default function NewTournament() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-10">
      <h1 className="font-display text-5xl font-bold">Create a tournament</h1>
      <p className="mt-2 text-muted">Takes about two minutes. You can edit everything until the fixtures are drawn.</p>
      <div className="mt-8">
        <Wizard />
      </div>
    </div>
  );
}
