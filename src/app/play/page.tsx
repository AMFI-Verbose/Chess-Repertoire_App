import PlayHub from "@/components/PlayHub";
import { getViewer } from "@/lib/auth";
import { listDuelsForUser, listFinishedDuelsForUser, listOpenDuels } from "@/lib/duels";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = { title: "Play · Chess Repertoire" };

export default async function PlayPage() {
  const viewer = await getViewer();

  const [openDuels, myDuels, recentDuels, members, engineGames, finishedDuels, playingCount] =
    await Promise.all([
      listOpenDuels(),
      viewer ? listDuelsForUser(viewer.id) : Promise.resolve([]),
      viewer ? listFinishedDuelsForUser(viewer.id) : Promise.resolve([]),
      prisma.user.count(),
      prisma.game.count(),
      prisma.duel.count({ where: { status: "finished" } }),
      prisma.duel.count({ where: { status: "playing" } }),
    ]);

  return (
    <PlayHub
      openDuels={openDuels}
      myDuels={myDuels}
      recentDuels={recentDuels}
      viewerHandle={viewer?.handle ?? null}
      verified={viewer?.emailVerified ?? false}
      members={members}
      gamesPlayed={engineGames + finishedDuels}
      playingCount={playingCount}
    />
  );
}
