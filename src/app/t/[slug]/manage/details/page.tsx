import { getEvent } from "@/lib/data";
import { DetailsForm, Frozen, PosterSection } from "../../EditPanel";

export default async function DetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const ev = (await getEvent((await params).slug))!; // the layout already 404s for non-managers
  if (ev.status === "completed" || ev.status === "cancelled") return <Frozen ev={ev} />;
  return (
    <div className="space-y-10">
      <DetailsForm ev={ev} />
      <PosterSection ev={ev} />
    </div>
  );
}
