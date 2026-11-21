import { notFound } from "next/navigation";

import LearnPlayer from "@/components/LearnPlayer";
import { chapterOf, lessonById } from "@/lib/learn";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lesson = lessonById(id);
  return { title: lesson ? `${lesson.title} · Learn` : "Learn · Chess Repertoire" };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lesson = lessonById(id);
  const chapter = chapterOf(id);
  if (!lesson || !chapter) notFound();

  return (
    <LearnPlayer
      lesson={lesson}
      chapterTitle={chapter.title}
      lessonNumber={chapter.lessons.findIndex((item) => item.id === id) + 1}
      lessonTotal={chapter.lessons.length}
    />
  );
}
