/**
 * What each opponent says, and when.
 *
 * The bot is not a language model: it reacts to a fixed set of game events
 * plus a handful of things you might type. That is deliberate — canned lines
 * that are clearly in character beat a generic chatbot that answers every
 * message with the same sentence.
 */

import type { BotPersonality, BotProfile } from "@/lib/bots";

export type ChatEvent =
  | "start"
  | "you-captured"
  | "i-captured"
  | "you-checked"
  | "i-checked"
  | "you-promoted"
  | "you-blundered"
  | "i-blundered"
  | "you-winning"
  | "i-winning"
  | "you-win"
  | "you-lose"
  | "draw"
  | "resign";

type Bank = Partial<Record<ChatEvent, string[]>>;

const BANKS: Record<BotPersonality, Bank> = {
  sunny: {
    start: ["Hi! I'm Pip. I only know how the pieces move, so be nice.", "Hello! I have played four games. This is five."],
    "you-captured": ["Oh! You took my piece. That's allowed, right?"],
    "i-captured": ["I got one! Wait, was that a good one?"],
    "you-checked": ["Check? Check? I don't like that."],
    "i-checked": ["I'm attacking your king! That's the point, I think."],
    "you-promoted": ["A queen! Nobody told me about that."],
    "you-blundered": ["Oh no, that looks sad. Should I take it?", "I think I see something. Maybe."],
    "i-blundered": ["Oops. That was my piece going the wrong way."],
    "you-winning": ["You're very good. I'm going to keep trying anyway."],
    "i-winning": ["Wait, am I winning? I think I'm winning!"],
    "you-win": ["Good game! You're really good at this. Can we play again?"],
    "you-lose": ["I won?! I won! Sorry — I won!"],
    draw: ["A draw! Nobody lost. That's nice."],
    resign: ["You stopped? That's okay. Thank you for playing!"],
  },
  cocky: {
    start: ["I've studied every opening. All of them. Probably.", "Ready? I've been warming up. Mentally."],
    "you-captured": ["Fine. Take that piece, see if I care."],
    "i-captured": ["Mine now. I'll be needing that."],
    "you-checked": ["Rude. That's a rude move."],
    "i-checked": ["Yes, yes, I know where your king lives."],
    "you-promoted": ["Whatever. Queens are overrated."],
    "you-blundered": ["Oh. Oh no. That's a free piece and I'm taking it.", "Bold move. Bad move, but bold."],
    "i-blundered": ["That was a gift. A deliberate gift. Tactics."],
    "you-winning": ["You're ahead. I'm not saying you're better, but you're ahead."],
    "i-winning": ["Comfortable. This is comfortable."],
    "you-win": ["Rematch. Right now. I was distracted."],
    "you-lose": ["Told you. I'm basically a grandmaster with a busy schedule."],
    draw: ["A draw. We're clearly equals. Obviously."],
    resign: ["Wise. Painful, but wise."],
  },
  wild: {
    start: ["Let's make it interesting. No quiet moves.", "I'm giving you a pawn. Don't make it weird."],
    "you-captured": ["Take it. I have three more where that came from."],
    "i-captured": ["Mine. Everything is mine eventually."],
    "you-checked": ["Keep coming. I like the noise."],
    "i-checked": ["Your king is very exposed. I love exposed kings."],
    "you-promoted": ["A queen? On this board? Finally, a real fight."],
    "you-blundered": ["Oh, that's a snack. Thank you.", "You just handed me a piece. I accept."],
    "i-blundered": ["That's the price of excitement. Worth it."],
    "you-winning": ["You're winning, which means you're about to get careless."],
    "i-winning": ["Chaos is working. Chaos always works eventually."],
    "you-win": ["Beautiful. Terrible for me. Beautiful. Again?"],
    "you-lose": ["The gambit worked. I'm as surprised as you are."],
    draw: ["A draw. We both survived the fireworks."],
    resign: ["Sensible. My position was about to get loud."],
  },
  calm: {
    start: ["No rush. Good positions come from good moves.", "I'll play the position, not the clock."],
    "you-captured": ["Material is just part of the position.", "I'll take compensation elsewhere."],
    "i-captured": ["That square was always going to be mine."],
    "you-checked": ["A check. Not a plan, but noted."],
    "i-checked": ["Your king can move. Mine can stay."],
    "you-promoted": ["A new queen. The endgame just changed."],
    "you-blundered": ["That weakens a square. I'll be there in a few moves.", "I don't need to rush. That square is gone."],
    "i-blundered": ["Not my best. The position is still playable."],
    "you-winning": ["You have the better structure. That may not be enough."],
    "i-winning": ["The position is pleasant. I'll keep improving it."],
    "you-win": ["Well played. You outplayed the structure.", "Good game. I misjudged the queenside."],
    "you-lose": ["The position was always leaning my way. Good game."],
    draw: ["A draw feels correct. Neither of us deserved to lose."],
    resign: ["Understood. The position was getting worse, not better."],
  },
  sharp: {
    start: ["Keep your pieces defended. All of them.", "I'm looking for one loose piece. Just one."],
    "you-captured": ["A capture. Let's see if it's poisoned."],
    "i-captured": ["That's the fork. You can resign it or defend it."],
    "you-checked": ["A check without a follow-up is a wasted tempo."],
    "i-checked": ["Now you have to solve something."],
    "you-promoted": ["A queen comes with a weakness. Show me."],
    "you-blundered": ["There it is. The loose piece.", "You left it defended by nothing. I noticed instantly."],
    "i-blundered": ["I missed the tactic. That won't happen twice."],
    "you-winning": ["You're winning. Stay sharp — I'm still hunting."],
    "i-winning": ["One more inaccuracy and this is over."],
    "you-win": ["You saw more than I did. Respect."],
    "you-lose": ["That's the tactic. There's always one."],
    draw: ["A draw. No loose pieces left to punish."],
    resign: ["Correct. The tactic was coming whether you moved or not."],
  },
  cold: {
    start: ["I don't need to win quickly. I need to win eventually."],
    "you-captured": ["Acceptable. The endgame still favours me."],
    "i-captured": ["Simplifying is not the same as being simple."],
    "you-checked": ["Your king is walking into my structure."],
    "i-checked": ["Precision. You'll see why in eight moves."],
    "you-promoted": ["Two queens. My endgame calculation assumed that."],
    "you-blundered": ["That loses by force. I'll show you the line.", "Inaccurate. The evaluation moved 1.4 pawns."],
    "i-blundered": ["A miscalculation. It costs time, not the game."],
    "you-winning": ["You're ahead. Enjoy it while the board is full."],
    "i-winning": ["The result is not in doubt. The technique is the interesting part."],
    "you-win": ["Precise play. I'll recalculate my assessment of you."],
    "you-lose": ["The endgame was decided before you noticed it."],
    draw: ["A draw. Both calculations were sound."],
    resign: ["Correct decision. The position was lost technically."],
  },
  tricky: {
    start: ["I have prepared something strange. You'll like it.", "Play the obvious move. I dare you."],
    "you-captured": ["That piece was bait. Possibly. Let's find out."],
    "i-captured": ["Unexpected? No. Inevitable."],
    "you-checked": ["A check. How conventional."],
    "i-checked": ["The king is the least interesting target. But it works."],
    "you-promoted": ["A second queen. Now the board is interesting."],
    "you-blundered": ["Oh, I like this position now.", "That move had one problem. I'm about to show it."],
    "i-blundered": ["A calculated risk. The calculation was wrong."],
    "you-winning": ["You're winning. Which is exactly when I get dangerous."],
    "i-winning": ["Everyone defends the obvious threat. Nobody defends the odd one."],
    "you-win": ["You survived the weirdness. Impressive."],
    "you-lose": ["The strange move worked. It usually does against patience."],
    draw: ["A draw. Neither of us blinked. Annoying."],
    resign: ["Wise. The position was about to become a puzzle."],
  },
  titan: {
    start: ["Full strength. No handicap, no mercy.", "I don't need warming up. Begin when ready."],
    "you-captured": ["Material is secondary. Space is not."],
    "i-captured": ["That was always mine. You just held it for me."],
    "you-checked": ["A check. Calculated. Refuted."],
    "i-checked": ["The mate is not forced yet. It doesn't need to be."],
    "you-promoted": ["Promotion. Noted. Still losing."],
    "you-blundered": ["That is a blunder. The evaluation is now decisive.", "Inaccurate. The advantage is mine and it is permanent."],
    "i-blundered": ["An error. Small. It changes nothing."],
    "you-winning": ["You're ahead. Statistically, this is where players crack."],
    "i-winning": ["The position is won. The rest is technique."],
    "you-win": ["You beat me. Genuinely. That is rare."],
    "you-lose": ["Full strength means full strength. Good game."],
    draw: ["A draw at maximum strength. You defended accurately."],
    resign: ["Correct. There was nothing left to calculate."],
  },
};

const FALLBACK: Record<string, string[]> = {
  sunny: ["That's nice! Let's keep playing.", "I don't understand, but I agree!"],
  cocky: ["Sure. Whatever you say.", "I'd argue, but I'm busy winning."],
  wild: ["Bold words. Let's see the board.", "Talk is cheap. Sacrifices are not."],
  calm: ["The position will answer that.", "Let's let the moves decide."],
  sharp: ["Keep your pieces defended and we'll talk.", "Noted. Now watch the tactics."],
  cold: ["That's irrelevant to the evaluation.", "The board doesn't care what we say."],
  tricky: ["Interesting. Wrong, but interesting.", "You're thinking like everyone else."],
  titan: ["Focus on the board.", "Say it with a move."],
};

const REPLIES: { match: RegExp; lines: string[] }[] = [
  {
    match: /^(hi|hey|hello|yo|sup|hallo)\b/i,
    lines: ["Hello. Let's play.", "Hi! Good luck — you'll need it.", "Hey. Ready when you are."],
  },
  {
    match: /(gg|good game|well played|wp)\b/i,
    lines: ["Good game. Rematch whenever.", "Well played. I'll remember that.", "Good game — you made it interesting."],
  },
  {
    match: /(nice|good move|well done|great move|clever)\b/i,
    lines: ["Thank you. I liked it too.", "It was the only move. Mostly.", "Flattery won't save your king."],
  },
  {
    match: /(why|what|huh|really)\b/i,
    lines: ["Because the evaluation says so.", "Look at the loose piece. That's why.", "Because the alternative was worse."],
  },
  {
    match: /(again|rematch|next|another)\b/i,
    lines: ["Again. Same level, new game.", "Rematch accepted. This time I'm ready.", "Press Rematch — I'll be here."],
  },
  {
    match: /(easy|lucky|bad|terrible|stupid)\b/i,
    lines: ["Lucky? I've been calculating since move one.", "Bad? The board disagrees.", "Say that with a move next time."],
  },
  {
    match: /(help|hint|teach|advice)\b/i,
    lines: ["After the game, open the review. The arrows are honest.", "Watch what I do with your loose pieces.", "Count material, then count tempo."],
  },
  {
    match: /(resign|stop|quit|done)\b/i,
    lines: ["Resigning is a skill too.", "Fine. The review will explain it.", "Understood. Good game."],
  },
];

export function botChatLine(
  bot: BotProfile,
  event: ChatEvent,
  context: { detail?: string } = {},
): string | null {
  const bank = BANKS[bot.personality][event];
  if (!bank || bank.length === 0) return null;
  const base = bank[Math.floor(Math.random() * bank.length)];
  return context.detail ? `${base} ${context.detail}` : base;
}

export function botReply(bot: BotProfile, message: string): string {
  const text = message.trim();
  for (const rule of REPLIES) {
    if (rule.match.test(text)) {
      const line = rule.lines[Math.floor(Math.random() * rule.lines.length)];
      // Give the canned answer a little of the character's own voice.
      const colour = FALLBACK[bot.personality][0];
      return bot.personality === "sunny" ? `${line} ${colour}` : line;
    }
  }
  const pool = FALLBACK[bot.personality];
  return pool[Math.floor(Math.random() * pool.length)];
}
