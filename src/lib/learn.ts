/**
 * The Learn curriculum: short, interactive lessons with a coach who talks you
 * through the position.
 *
 * Every step is either a move the coach plays for you (`play`) or a move you
 * have to find yourself (`ask`). Because the steps are written in SAN and replayed
 * by chess.js, the whole curriculum is verified by a script (`scripts/
 * check-lessons.mts`): illegal moves, or a claim of mate that is not mate, break
 * the build before they ever reach a student.
 */

export type LearnStep = {
  /** SAN the coach plays on entering this step. */
  play?: string;
  /** SAN the student has to find. */
  ask?: string;
  /** What the coach says as this step opens. */
  say: string;
  /** What the coach says once the student finds the move. */
  praise?: string;
  /** A nudge, only shown when asked for. */
  hint?: string;
};

export type Lesson = {
  id: string;
  title: string;
  blurb: string;
  level: "first steps" | "club";
  /** Some lessons start from a composed position rather than move one. */
  startFen?: string;
  /** Side the student is playing. */
  side: "w" | "b";
  steps: LearnStep[];
};

export const LESSONS: Lesson[] = [
  {
    id: "opening-principles",
    title: "Three rules, four moves",
    blurb:
      "Occupy the centre, develop a piece, castle. The Ruy Lopez is what happens when you do all three.",
    level: "first steps",
    side: "w",
    steps: [
      {
        say:
          "Every opening is the same argument: centre, development, king safety. We are going to play the Ruy Lopez and you will make the three moves that matter.",
      },
      {
        play: "e4",
        say:
          "1.e4. It takes a central square and opens a diagonal for the bishop and a file for the queen — two pieces awake with one pawn.",
      },
      {
        play: "e5",
        say:
          "Black copies it. The position is symmetrical now, which means the first player to develop gets the initiative. That is your job.",
      },
      {
        ask: "Nf3",
        hint: "A knight that moves towards the centre can attack e5 on its first move.",
        say:
          "Develop a piece. Ideally one that does something — not a knight to the rim, please.",
        praise:
          "2.Nf3. The knight is out and e5 is under attack, so Black has to answer it. Same move, two jobs.",
      },
      {
        play: "Nc6",
        say:
          "Black defends e5 with a knight — developing while defending. Notice how every good move here does two things at once.",
      },
      {
        ask: "Bb5",
        hint: "The bishop belongs on the diagonal that stares at c6, the knight defending e5.",
        say:
          "Now the bishop. It wants a diagonal with a target on it, not a safe square.",
        praise:
          "3.Bb5 — the Ruy Lopez. The bishop pressures c6, and c6 is the piece holding e5 together.",
      },
      {
        play: "a6",
        say:
          "Black asks the bishop a question with a pawn: “are you staying, or was that a bluff?”",
      },
      {
        ask: "Ba4",
        hint: "Retreating to b3 gives up the diagonal you came for. Keep the bishop pointed at the kingside.",
        say:
          "Two retreat squares: b3, where the bishop is quiet, and a4, where it still eyes f7. Pick the one that keeps the pressure.",
        praise:
          "4.Ba4. The bishop is still on the c2–g8 diagonal, still aimed at the black king's future home.",
      },
      {
        play: "Nf6",
        say:
          "Black develops and hits e4 at the same time. Your centre piece is now under attack — and your king is still sitting in the middle.",
      },
      {
        ask: "O-O",
        hint: "The king is the only piece that has not moved. Put it somewhere it cannot be attacked.",
        say:
          "Everything is developed except one piece. The king is not a piece to develop — it is a piece to hide.",
        praise:
          "5.O-O. Safe king, active rook, centre held. That is the entire opening, and you just did it without memorising a single variation.",
      },
      {
        say:
          "From here the middlegame is yours to plan: the rook is on f1, the bishop aims at f7, and the centre is stable. Nothing fancy was required — three ideas, five moves.",
      },
    ],
  },
  {
    id: "the-fork",
    title: "The fork",
    blurb:
      "One move, two targets. The most profitable tactic in chess, and knights are the best at it.",
    level: "first steps",
    side: "w",
    startFen: "r3k3/8/8/1N6/8/8/8/6K1 w - - 0 1",
    steps: [
      {
        say:
          "A fork attacks two things at once, and your opponent can only save one. Knights fork best because nothing they attack can see them coming.",
      },
      {
        ask: "Nc7+",
        hint: "You need a square that touches both the king on e8 and the rook on a8.",
        say:
          "Look at the knight on b5 and the two black pieces. Is there a square that attacks both?",
        praise:
          "Nc7+ — check, and the rook on a8 is attacked at the same time. The king must move, and then the rook is simply yours.",
      },
      {
        play: "Kd8",
        say: "The king steps aside. It has to — check comes first.",
      },
      {
        play: "Nxa8",
        say:
          "And the rook falls. A fork does not win a piece by force; it wins a piece because one move created two problems and the opponent only had one answer.",
      },
      {
        say:
          "That is the whole pattern: before every move, ask whether two of their pieces sit a knight's jump apart from one square.",
      },
    ],
  },
  {
    id: "the-pin",
    title: "The pin",
    blurb:
      "A piece that cannot move is a piece you can attack for free. Pin the knight to the queen and watch it freeze.",
    level: "first steps",
    side: "w",
    steps: [
      {
        say:
          "A pin is an attack on a piece that dare not move, because something more valuable sits behind it. We will build one in the Queen's Gambit.",
      },
      { play: "d4", say: "1.d4 — the other central pawn, and the queen's bishop gets a diagonal." },
      { play: "d5", say: "Black blocks it, the classical answer in the centre." },
      { play: "c4", say: "2.c4, the Queen's Gambit: offer a pawn to deflect the d5 pawn and take the centre." },
      { play: "e6", say: "Black declines politely and opens a line for the bishop on f8." },
      { play: "Nc3", say: "3.Nc3 — a developing move that also piles up on d5." },
      { play: "Nf6", say: "Black develops and defends d5. Watch that knight very carefully." },
      {
        ask: "Bg5",
        hint: "The c1–h6 diagonal runs through f6 and ends on d8, where the queen sits.",
        say:
          "The knight on f6 defends d5. If it could not move, the whole black centre would sag. Is there a way to nail it down?",
        praise:
          "4.Bg5. The bishop looks straight through the knight at the queen on d8 — the knight is pinned. It cannot leave f6 without losing the queen.",
      },
      {
        say:
          "Now count the pressure on d5: pawn c4, knight c3, and a knight on f6 that is not really defending anything any more. That is how a pin turns into a winning position — quietly.",
      },
    ],
  },
  {
    id: "back-rank",
    title: "The back rank",
    blurb:
      "Three pawns in front of the king are a cage, not a shield. One rook ends it.",
    level: "first steps",
    side: "w",
    startFen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    steps: [
      {
        say:
          "The black king looks safe behind f7, g7 and h7. Look again: those pawns have not moved, so every square on the eighth rank is a corridor.",
      },
      {
        ask: "Re8#",
        hint: "The rook already owns the e-file. Take it all the way to the eighth rank.",
        say:
          "Your rook is on e1 with nothing in the way. Where does a rook go when the enemy king has no escape squares?",
        praise:
          "Re8#. The pawns that were supposed to protect the king are the reason it cannot escape. That is a back-rank mate — the most common mate in club chess.",
      },
      {
        say:
          "Remember the shape: king on g8, pawns on f7-g7-h7, a rook landing on the eighth rank. Once you have seen it a few times you start making luft — one pawn move — before it is too late.",
      },
    ],
  },
  {
    id: "legal-mate",
    title: "Légal's mate",
    blurb:
      "A queen sacrifice that is not a sacrifice. Three moves of pure geometry from a 1750 game.",
    level: "club",
    side: "w",
    steps: [
      {
        say:
          "Légal played this in 1750 and people still fall for it. Black grabs the queen, and then the king never gets out of the middle. You will find the last three moves.",
      },
      { play: "e4", say: "1.e4." },
      { play: "e5", say: "Black answers in the centre." },
      { play: "Nf3", say: "2.Nf3, attacking e5." },
      { play: "d6", say: "Black defends with a pawn — solid, but it leaves the bishop on f8 boxed in." },
      { play: "Bc4", say: "3.Bc4 aims at f7, the weakest square in Black's camp." },
      {
        play: "Bg4",
        say:
          "Black develops and pins your knight on f3 to the queen on d1. It looks annoying. It is the trap.",
      },
      { play: "Nc3", say: "4.Nc3, calmly developing. Black now decides the queen is free to take." },
      { play: "g6", say: "Black plays a pawn move instead of castling. The king stays in the middle — remember that." },
      {
        ask: "Nxe5",
        hint: "The pinned knight can still take a pawn. What is the knight on f3 actually attacking?",
        say:
          "Your knight is “pinned” — the bishop on g4 would take your queen. But a pin only matters if the piece behind it is worth more than what you are about to win. Count the material after the capture.",
        praise:
          "5.Nxe5! The knight takes the pawn and hits f7. The queen on d1 is hanging — and it does not matter, because the attack lands first.",
      },
      { play: "Bxd1", say: "Black takes the queen. It is the most natural move in the position, and it loses by force." },
      {
        play: "Bxf7+",
        say: "6.Bxf7+ — the bishop joins in. The king is dragged out of the corner.",
      },
      { play: "Ke7", say: "The only square. The king walks into the middle of its own pieces." },
      {
        ask: "Nd5#",
        hint: "The knight on c3 has one perfect square — it covers every escape the king has left.",
        say:
          "Every black piece is on the wrong side of the board. Find the knight move that closes the box.",
        praise:
          "7.Nd5#. The king has no square, the bishop covers e6 and e8, and the knight covers e7, f6 and c7. A queen down and checkmate — the oldest swindle in the book.",
      },
      {
        say:
          "The lesson under the lesson: material only matters if your opponent survives to count it. When the king is trapped, look for moves that ignore the score.",
      },
    ],
  },
];

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.id === id);
}
