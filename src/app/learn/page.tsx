import LearnPanel from "@/components/LearnPanel";

export const metadata = { title: "Learn · Chess Repertoire" };

export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<{ lesson?: string }>;
}) {
  const { lesson } = await searchParams;
  return <LearnPanel initialId={lesson} />;
}
