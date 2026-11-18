/**
 * A tiny UCI client for the Stockfish WASM build in /public/engine.
 *
 * The engine runs in a Web Worker, so it never blocks the UI thread. Everything
 * we need fits in four commands:
 *
 *   setoption name MultiPV value N     → return N best lines instead of 1
 *   setoption name Skill Level value N → weaken it on purpose (0 = random, 20 = full)
 *   position fen <fen>                 → load a position
 *   go movetime <ms>                   → search for that long, then answer
 *
 * The engine replies with a stream of `info ...` lines (one per depth per line)
 * followed by a single `bestmove ...`. We wait for `bestmove` and hand back the
 * deepest `info` seen for every MultiPV slot.
 */

export type EngineLine = {
  multipv: number;
  scoreCp: number | null; // centipawns, from the side-to-move's point of view
  mateIn: number | null; // positive = mate for the side to move
  pv: string[]; // principal variation in UCI coordinates
};

export type EngineResult = {
  bestmove: string | null;
  lines: EngineLine[];
  depth: number;
};

const ENGINE_PATH = "/engine/stockfish-19-lite-single.js";

export class Engine {
  private worker: Worker | null = null;
  private listener: ((line: string) => void) | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private currentMultiPv = 1;
  private currentSkill = 20;

  /** Lazily boots the worker — creating it downloads + compiles the 1.8 MB WASM. */
  private boot(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(ENGINE_PATH);
    worker.onmessage = (event: MessageEvent) => {
      const line = String(event.data);
      if (this.listener) this.listener(line);
    };
    worker.onerror = () => {
      // Surfacing this as a fake engine line keeps the promise chain honest:
      // the request in flight resolves instead of hanging forever.
      if (this.listener) this.listener("bestmove (none)");
    };

    worker.postMessage("uci");
    this.worker = worker;
    return worker;
  }

  /**
   * Search one position. Requests are serialized: the engine is a single state
   * machine, so two `go` commands in flight would interleave their output.
   */
  search(
    fen: string,
    options: { movetime?: number; multiPv?: number; skill?: number } = {},
  ): Promise<EngineResult> {
    const { movetime = 500, multiPv = 1, skill = 20 } = options;
    const next = this.queue.then(() => this.run(fen, movetime, multiPv, skill));
    // Keep the chain alive even if this request rejects.
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private run(
    fen: string,
    movetime: number,
    multiPv: number,
    skill: number,
  ): Promise<EngineResult> {
    const worker = this.boot();

    return new Promise<EngineResult>((resolve, reject) => {
      const lines = new Map<number, EngineLine>();
      let depth = 0;
      let settled = false;

      const settle = (result?: EngineResult, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.listener = null;
        if (error) reject(error);
        else resolve(result!);
      };

      const timer = setTimeout(
        () => settle(undefined, new Error("Engine timed out")),
        60000,
      );

      this.listener = (line: string) => {
        if (line.startsWith("info ")) {
          const multipvMatch = /multipv (\d+)/.exec(line);
          const scoreMatch = /score (cp|mate) (-?\d+)/.exec(line);
          const depthMatch = /depth (\d+)/.exec(line);
          const pvMatch = /\spv ((?:[a-h][1-8][a-h][1-8][qrbn]?\s?)+)/.exec(line);

          if (depthMatch) depth = Math.max(depth, Number(depthMatch[1]));
          if (!multipvMatch) return;

          const slot = Number(multipvMatch[1]);
          const existing = lines.get(slot);
          // Only overwrite a slot with a *deeper* line.
          if (existing && depthMatch && Number(depthMatch[1]) < depth) return;

          lines.set(slot, {
            multipv: slot,
            scoreCp:
              scoreMatch && scoreMatch[1] === "cp" ? Number(scoreMatch[2]) : null,
            mateIn:
              scoreMatch && scoreMatch[1] === "mate" ? Number(scoreMatch[2]) : null,
            pv: pvMatch ? pvMatch[1].trim().split(/\s+/) : [],
          });
          return;
        }

        if (line.startsWith("bestmove")) {
          settle({
            bestmove: line.split(" ")[1] ?? null,
            depth,
            lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv),
          });
        }
      };

      if (multiPv !== this.currentMultiPv) {
        worker.postMessage(`setoption name MultiPV value ${multiPv}`);
        this.currentMultiPv = multiPv;
      }
      if (skill !== this.currentSkill) {
        worker.postMessage(`setoption name Skill Level value ${skill}`);
        this.currentSkill = skill;
      }

      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go movetime ${movetime}`);
    });
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.listener = null;
  }
}

/** Convert an engine score to centipawns from a chosen point of view. */
export function scoreToCp(
  line: EngineLine | undefined,
  forSideToMove = true,
): number | null {
  if (!line) return null;
  const sign = forSideToMove ? 1 : -1;
  if (line.mateIn !== null) {
    // Mate in n → a large finite value that still ranks above any eval.
    const magnitude = 10000 - Math.abs(line.mateIn) * 10;
    const direction = line.mateIn > 0 ? 1 : -1;
    return sign * direction * magnitude;
  }
  return line.scoreCp === null ? null : sign * line.scoreCp;
}
