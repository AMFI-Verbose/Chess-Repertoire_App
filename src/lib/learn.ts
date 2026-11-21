/**
 * The Learn curriculum: chapters of short, interactive lessons with a coach
 * who talks you through every position.
 *
 * Every step is either a move the coach plays for you (`play`) or a move you
 * have to find yourself (`ask`, with extra accepted answers in `accept`).
 * Because the steps are written in SAN and replayed by chess.js, the whole
 * curriculum is verified before it ships (`scripts/check-lessons.mts`):
 * illegal moves, a mate that is not mate, or an accepted answer that is not
 * legal all fail the build.
 */

export type LearnStep = {
  /** SAN the coach plays on entering this step. */
  play?: string;
  /** The move the student has to find. */
  ask?: string;
  /** Other moves that solve the same task, so a student is not punished for
   *  finding an equally good move. */
  accept?: string[];
  /** What the coach says as this step opens. */
  say: string;
  /** What the coach says once the student finds the move. */
  praise?: string;
  /** A nudge, only shown when asked for. */
  hint?: string;
};

export type LessonTier = "free" | "pro";

export type Lesson = {
  id: string;
  title: string;
  blurb: string;
  /** Roughly how long it takes, including reading. */
  minutes: number;
  tier: LessonTier;
  /** Some lessons start from a composed position rather than move one. */
  startFen?: string;
  /** Side the student is playing. */
  side: "w" | "b";
  /** Puzzle theme to drill afterwards. */
  theme?: string;
  steps: LearnStep[];
};

export type Chapter = {
  id: string;
  title: string;
  blurb: string;
  lessons: Lesson[];
};

export const CHAPTERS: Chapter[] = [
  {
    id: "foundations",
    title: "Foundations",
    blurb:
      "The five patterns that decide most club games: opening principles, and the four tactics you will meet every week.",
    lessons: [
      {
        id: "opening-principles",
        title: "Three rules, four moves",
        blurb:
          "Occupy the centre, develop a piece, castle. The Ruy Lopez is what happens when you do all three.",
        minutes: 6,
        tier: "free",
        side: "w",
        theme: "opening",
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
        minutes: 5,
        tier: "free",
        side: "w",
        startFen: "r3k3/8/8/1N6/8/8/8/6K1 w - - 0 1",
        theme: "fork",
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
        minutes: 5,
        tier: "free",
        side: "w",
        theme: "pin",
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
        id: "the-skewer",
        title: "The skewer",
        blurb:
          "The fork's mirror image: the valuable piece is in front and has to move, leaving what was hiding behind it.",
        minutes: 5,
        tier: "free",
        side: "w",
        startFen: "q7/8/8/8/8/k7/8/1R4K1 w - - 0 1",
        theme: "skewer",
        steps: [
          {
            say:
              "A skewer lines up a king and a queen on the same line, with the king in front. The king must move, and the queen behind it is exposed.",
          },
          {
            ask: "Ra1+",
            hint: "Slide the rook onto the a-file — the queen is already on it, behind the king.",
            say:
              "The rook is on b1, the black king on a3, the queen far behind it on a8. One move puts all three on one line.",
            praise:
              "Ra1+ — check down the a-file. The king must come off it, and the queen on a8 is left standing in front of your rook.",
          },
          {
            play: "Kb3",
            say: "The king steps off the a-file. Now look at what is standing on it.",
          },
          {
            play: "Rxa8",
            say:
              "The queen falls. Notice the difference from a fork: nothing attacked two pieces at once — the line itself did the work.",
          },
          {
            say:
              "Scan for skewers whenever two enemy pieces share a rank, file or diagonal with the king in the middle: Kf8–Qd8 on the eighth rank is the classic one.",
          },
        ],
      },
      {
        id: "back-rank",
        title: "The back rank",
        blurb:
          "Three pawns in front of the king are a cage, not a shield. One rook ends it.",
        minutes: 4,
        tier: "free",
        side: "w",
        startFen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
        theme: "backRankMate",
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
    ],
  },
  {
    id: "tactics",
    title: "Tactics",
    blurb:
      "Three more patterns that win material without a plan: the discovered attack, free material, and the queen's double attack.",
    lessons: [
      {
        id: "discovered-check",
        title: "The discovered attack",
        blurb:
          "Move one piece out of the way and let the one behind it fire — with check, the opponent gets no time to answer.",
        minutes: 5,
        tier: "free",
        side: "w",
        startFen: "4k3/5p2/8/8/8/8/4B3/4R1K1 w - - 0 1",
        theme: "discoveredAttack",
        steps: [
          {
            say:
              "A discovered attack is a move that gets one piece out of the way so another fires through the square it just left. When the piece behind gives check, the opponent has no tempo to fix anything.",
          },
          {
            ask: "Bc4+",
            hint: "The bishop is standing directly in front of your rook on the e-file.",
            say:
              "The bishop on e2 is blocking your own rook on e1. Where can it go that does something useful?",
            praise:
              "Bc4+ — the bishop steps aside, the rook checks down the now-empty e-file, and the bishop lands on a diagonal pointing at f7.",
          },
          {
            play: "Kd8",
            say:
              "The king walks off the file. Black had to answer the check; nothing else on the board got a move.",
          },
          {
            play: "Bxf7",
            say:
              "And the bishop collects the pawn it was aiming at. One move produced a check and a target — that is why discovery is so strong.",
          },
          {
            say:
              "The same geometry works with a queen behind a knight, or a rook behind a bishop. Look for your own pieces standing on the same line as their king.",
          },
        ],
      },
      {
        id: "hanging-piece",
        title: "Counting",
        blurb:
          "Free material is arithmetic, not magic: count the attackers, count the defenders, take when you have more.",
        minutes: 4,
        tier: "free",
        side: "w",
        startFen: "4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1",
        theme: "hangingPiece",
        steps: [
          {
            say:
              "Most games below 1500 are decided by one habit: after every opponent move, look for pieces that nothing defends. Today it is a pawn; later it will be a rook.",
          },
          {
            ask: "Nxe5",
            hint: "The pawn on e5 has no defender anywhere on the board.",
            say:
              "Count the pawn on e5: how many black pieces defend it? How many white pieces attack it?",
            praise:
              "Nxe5. One attacker, zero defenders — a free pawn. That is the whole calculation.",
          },
          {
            say:
              "The discipline is the point, not the pawn. Before you move, count once; after they move, count again. A free pawn every ten moves is a won game every twenty.",
          },
        ],
      },
      {
        id: "queen-double-attack",
        title: "The queen's double attack",
        blurb:
          "One queen move, two targets. The queen has eight directions, which makes her the best double-attacker on the board.",
        minutes: 5,
        tier: "free",
        side: "w",
        startFen: "6k1/8/2n5/8/8/8/8/6KQ w - - 0 1",
        theme: "fork",
        steps: [
          {
            say:
              "A fork does not have to be a knight. The queen attacks along files, ranks and diagonals, so one move can hit a king and a loose piece — and with check, the opponent gets no time to save it.",
          },
          {
            ask: "Qd5+",
            hint: "One diagonal runs from that square to the king on g8, and the same square sits one diagonal below the knight on c6.",
            say:
              "The king is on g8, the knight on c6. Find the square from which your queen attacks both — and note that the knight cannot jump backwards to take her.",
            praise:
              "Qd5+ — check on the d5–g8 diagonal, and the knight on c6 is attacked on the d5–c6 diagonal. The knight cannot reach d5, so it is simply lost.",
          },
          {
            play: "Kh8",
            say: "The king has to move. The knight stays exactly where it is, which is the problem.",
          },
          {
            play: "Qxc6",
            say:
              "One knight, no compensation. Every double attack is the same trade: one move, two problems, one answer.",
          },
          {
            say:
              "Check first, material second. A double attack that includes check is almost always winning, because the opponent's reply is forced.",
          },
        ],
      },
    ],
  },
  {
    id: "mates",
    title: "Checkmate patterns",
    blurb:
      "Four mates worth recognising instantly: the corridor, the ladder, the smothered king, and Anastasia in the corner.",
    lessons: [
      {
        id: "legal-mate",
        title: "Légal's mate",
        blurb:
          "A queen sacrifice that is not a sacrifice. Three moves of pure geometry from a 1750 game.",
        minutes: 7,
        tier: "free",
        side: "w",
        theme: "sacrifice",
        steps: [
          {
            say:
              "Légal played this in 1750 and people still fall for it. Black grabs the queen, and then the king never gets out of the middle. You will find the last three moves.",
          },
          { play: "e4", say: "1.e4 — the classic first move, taking the centre." },
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
      {
        id: "ladder-mate",
        title: "The ladder",
        blurb:
          "Two rooks cut the board in half, then push the king one rank at a time to the edge.",
        minutes: 4,
        tier: "free",
        side: "w",
        startFen: "6k1/1R6/8/8/8/8/8/R5K1 w - - 0 1",
        theme: "mateIn2",
        steps: [
          {
            say:
              "Two rooks are a machine: one cuts the king off along a rank, the other pushes it back, and the edge of the board finishes the job. It is the easiest mate to learn and the easiest to forget in a real game.",
          },
          {
            ask: "Ra8#",
            hint: "One rook already owns the seventh rank. Send the other to the eighth.",
            say:
              "The rook on b7 has taken the seventh rank away. What is left for the king on g8?",
            praise:
              "Ra8# — the rook on b7 covers g7 and h7, the rook on a8 covers f8 and h8. The king has no square at all.",
          },
          {
            say:
              "The recipe is always the same: cut, push, cut, mate. With a rook and a king it also works — the king does the cutting instead of a second rook.",
          },
        ],
      },
      {
        id: "smothered-mate",
        title: "The smothered mate",
        blurb:
          "A knight checkmate to a king buried alive in its own pieces. Nothing can block a knight.",
        minutes: 5,
        tier: "pro",
        side: "w",
        startFen: "6rk/6pp/8/6N1/8/8/5PPP/6K1 w - - 0 1",
        theme: "mateIn2",
        steps: [
          {
            say:
              "A smothered mate is checkmate delivered by a knight to a king that is buried in its own pieces. Every other piece can be blocked; a knight cannot.",
          },
          {
            ask: "Nf7#",
            hint: "The knight on g5 has one jump that reaches the corner of the king's box.",
            say:
              "The king is on h8. Its own rook on g8 and pawns on g7 and h7 are the walls. Find the knight move that attacks h8.",
            praise:
              "Nf7# — the knight attacks h8, and the king cannot move: g8 is its own rook, g7 and h7 its own pawns. Checkmate with a piece that cannot be taken.",
          },
          {
            say:
              "This is the finish of Philidor's legacy: Qg8+!, Rxg8, Nf7#. Whenever a king is boxed in the corner by its own pieces, look for a queen sacrifice on g8 and a knight on f7.",
          },
        ],
      },
      {
        id: "anastasia-mate",
        title: "Anastasia's mate",
        blurb:
          "A rook on the h-file and a knight on e7: one delivers, the other takes away every escape square.",
        minutes: 5,
        tier: "pro",
        side: "w",
        startFen: "8/4N1pk/8/8/8/6R1/5PPP/6K1 w - - 0 1",
        theme: "mateIn1",
        steps: [
          {
            say:
              "Anastasia's mate is the cleanest rook mate in the book: the rook checks down the h-file, and the knight on e7 removes g8 and g6, so the king's own pawn on g7 is the last wall.",
          },
          {
            ask: "Rh3#",
            hint: "The rook on g3 can reach the h-file in one move, and the file is open.",
            say:
              "The king is on h7. Its pawn on g7 blocks the only flight square on that side. Where does the rook belong?",
            praise:
              "Rh3# — check down the h-file. g8 and g6 are covered by the knight on e7, h8 by the rook, g7 by Black's own pawn. Mate.",
          },
          {
            say:
              "The knight on e7 is doing the quiet work. In your own games, before you look for a check, look at which squares the enemy king would need — then take them away.",
          },
        ],
      },
    ],
  },
  {
    id: "endgames",
    title: "Endgames you must win",
    blurb:
      "Two mates that decide tournaments: queen and king, rook and king. Both are technique, not talent.",
    lessons: [
      {
        id: "kq-mate",
        title: "Queen and king",
        blurb:
          "The first mate everyone should own: the queen cuts a box, the king shrinks it, until there is no box left.",
        minutes: 6,
        tier: "pro",
        side: "w",
        startFen: "6k1/8/6K1/8/8/8/8/Q7 w - - 0 1",
        theme: "endgame",
        steps: [
          {
            say:
              "Queen and king is the mate that separates players who can finish from players who draw. The method: the queen cuts a box, the king walks up, the box shrinks, and the mate appears on its own.",
          },
          {
            ask: "Qa8#",
            hint: "The queen goes to the far rank. Your king on g6 already covers g7.",
            say:
              "Your king on g6 is doing the work that matters — it takes g7, f7 and h7 away. What does the queen need to take?",
            praise:
              "Qa8# — the queen owns the eighth rank, the king owns the seventh. The black king has no square, and the queen never even touched it.",
          },
          {
            say:
              "Two dangers to respect: stalemate (giving the king no legal move while it is not in check) and losing the queen to a careless check next to the king. Keep the queen a knight's move away until the mate is ready.",
          },
        ],
      },
      {
        id: "kr-mate",
        title: "Rook and king",
        blurb:
          "The same box, one rank at a time — and the mate that teaches you why stalemate is the real opponent.",
        minutes: 6,
        tier: "pro",
        side: "w",
        startFen: "6k1/8/6K1/8/8/8/8/R7 w - - 0 1",
        theme: "endgame",
        steps: [
          {
            say:
              "Rook and king is slower than queen and king and teaches more: the rook cuts, the king pushes, and you must keep leaving the enemy king one square so it is never stalemated too early.",
          },
          {
            ask: "Ra8#",
            hint: "Same square the queen used: the eighth rank.",
            say:
              "The rook on a1, the king on g6, the black king on g8. Which rank does the rook need?",
            praise:
              "Ra8# — the rook takes the whole back rank, the king takes the seventh. Mate, with no stalemate risk because the king was already in check.",
          },
          {
            say:
              "Drill the technique: rook on the fourth rank (or wherever) to cut, king walks to the opposition, then the rook drops to the back rank. Five moves, every time.",
          },
        ],
      },
    ],
  },
  {
    id: "openings",
    title: "Openings you can actually play",
    blurb:
      "Two openings with a plan instead of a memory test: the Italian Game and the Najdorf Sicilian.",
    lessons: [
      {
        id: "italian-game",
        title: "The Italian Game",
        blurb:
          "The oldest opening in the book, and still a plan: bishop on c4, pawns in the centre, castle, then press f7.",
        minutes: 7,
        tier: "pro",
        side: "w",
        theme: "opening",
        steps: [
          {
            say:
              "The Italian Game is 500 years old because it is a plan, not a line: develop, take the centre with c3 and d4, castle, and press the square f7.",
          },
          { play: "e4", say: "1.e4 — White takes the centre, as always." },
          { play: "e5", say: "Black takes the centre too." },
          { play: "Nf3", say: "2.Nf3 hits e5 and develops." },
          { play: "Nc6", say: "Black defends with a knight." },
          {
            ask: "Bc4",
            hint: "The bishop wants the diagonal that ends on f7.",
            say:
              "Develop the bishop onto the diagonal that points at Black's weakest square.",
            praise:
              "3.Bc4 — the Italian bishop. It eyes f7, the square defended only by the king.",
          },
          { play: "Bc5", say: "Black mirrors it, aiming at your f2. Symmetry: the first real plan wins." },
          {
            ask: "c3",
            hint: "You want d4, and d4 needs support.",
            say:
              "The centre is the next job. You want a pawn on d4, but the knight on c6 would take it if it were alone.",
            praise:
              "4.c3 — a quiet move with two jobs: it supports d4 and gives the bishop on c4 a retreat on c2 if it is ever attacked.",
          },
          { play: "Nf6", say: "Black develops and hits e4. Now the centre has to be settled." },
          {
            ask: "d4",
            hint: "The pawn you prepared: two squares forward, supported by c3.",
            say:
              "Everything is ready. Take the centre.",
            praise:
              "5.d4 — the point of c3. White has pawns on d4 and e4, and the position plays itself from here.",
          },
          { play: "exd4", say: "Black takes, because otherwise White gets a big centre for free." },
          {
            ask: "cxd4",
            hint: "Recapture with the pawn that did the supporting — not the queen.",
            say:
              "Recapture. With which pawn?",
            praise:
              "6.cxd4 — and the centre is yours. From here: castle, put a rook on e1, and the plan is a slow build against f7 and the kingside.",
          },
          {
            say:
              "That is the Italian Game in six moves: bishop on c4, pawns on d4 and e4, and a target on f7. No memorisation, one plan.",
          },
        ],
      },
      {
        id: "sicilian-najdorf",
        title: "The Najdorf Sicilian",
        blurb:
          "The sharpest answer to 1.e4 — a pawn on a6, a bishop coming to b7, and play on the queenside.",
        minutes: 8,
        tier: "pro",
        side: "b",
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        theme: "opening",
        steps: [
          {
            say:
              "In this lesson you are Black in the Najdorf, the sharpest Sicilian. The idea: trade the c-pawn for White's d-pawn, develop with a6 and b5, and attack on the queenside while White attacks on the kingside.",
          },
          { play: "e4", say: "White starts in the centre." },
          { play: "c5", say: "1...c5 — the Sicilian. Black refuses symmetry and fights for the centre from the side." },
          { play: "Nf3", say: "White develops and prepares d4." },
          { play: "d6", say: "2...d6 controls e5 and prepares ...Nf6." },
          { play: "d4", say: "White strikes: 3.d4." },
          {
            ask: "cxd4",
            hint: "The c-pawn has been waiting for exactly this pawn.",
            say:
              "White has offered the d-pawn. The Sicilian's whole idea is to take it and open the c-file.",
            praise:
              "3...cxd4 — the trade that defines the opening. Black gets a half-open c-file and a majority in the centre.",
          },
          { play: "Nxd4", say: "White recaptures with the knight." },
          { play: "Nf6", say: "4...Nf6 develops and hits e4 — the standard Najdorf move order." },
          { play: "Nc3", say: "5.Nc3 defends e4 and develops another piece." },
          {
            ask: "a6",
            hint: "A small pawn move that takes b5 away from White's pieces.",
            say:
              "The move that names the variation. What does a pawn on a6 do for Black?",
            praise:
              "5...a6 — the Najdorf. It stops White's knights and bishops using b5, and it prepares ...b5 and ...Bb7, the queenside plan.",
          },
          {
            say:
              "From here Black's plan is fixed: ...e5 or ...e6, ...Be7, ...O-O, ...b5, ...Bb7. White will attack on the kingside; you attack on the queenside. That is a real opening, not a memory test.",
          },
        ],
      },
    ],
  },
];

export const LESSONS: Lesson[] = CHAPTERS.flatMap((chapter) => chapter.lessons);

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.id === id);
}

export function chapterOf(lessonId: string): Chapter | undefined {
  return CHAPTERS.find((chapter) =>
    chapter.lessons.some((lesson) => lesson.id === lessonId),
  );
}

/** Previous / next lesson across the whole curriculum, chapters included. */
export function neighbours(lessonId: string): { prev?: Lesson; next?: Lesson } {
  const index = LESSONS.findIndex((lesson) => lesson.id === lessonId);
  if (index < 0) return {};
  return {
    prev: index > 0 ? LESSONS[index - 1] : undefined,
    next: index < LESSONS.length - 1 ? LESSONS[index + 1] : undefined,
  };
}

export function totalMinutes(): number {
  return LESSONS.reduce((sum, lesson) => sum + lesson.minutes, 0);
}
