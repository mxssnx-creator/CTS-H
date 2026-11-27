import { BOOK, type Floors } from "./constants.ts";
import { simulateSessions, type Bar, type ReplayOpts } from "./process.ts";

self.onmessage = (
  event: MessageEvent<{
    books: { symbol: string; bars: Bar[] }[];
    floors: Floors;
    opts: ReplayOpts;
  }>,
) => {
  try {
    const { books, floors, opts } = event.data;
    self.postMessage({ result: simulateSessions(books, BOOK, floors, opts) });
  } catch {
    self.postMessage({ error: "Replay calculation failed." });
  }
};
