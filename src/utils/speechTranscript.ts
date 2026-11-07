/**
 * Utilities to prevent word and phrase repetition in Web Speech API (SpeechRecognition / webkitSpeechRecognition),
 * especially on Android Chrome / Mobile WebKit where `event.results` emits cumulative transcripts
 * when `continuous` or `interimResults` is enabled.
 */

function normalizeArabicToken(word: string): string {
  return word
    .trim()
    .replace(/[،,.؛:!؟"']/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة$/g, 'ه')
    .replace(/ى$/g, 'ي')
    .toLowerCase();
}

function normalizePhraseForComparison(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .map(normalizeArabicToken)
    .filter(Boolean)
    .join(' ');
}

/**
 * Removes consecutive repeated words AND consecutive repeated multi-word phrases (1 to 6 words).
 * Example: "سند جديد سند جديد للمريض صالح صالح" -> "سند جديد للمريض صالح"
 */
export function deduplicateSpeechText(rawText: string): string {
  const rawWords = rawText
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (rawWords.length <= 1) return rawWords.join(' ');

  let words = [...rawWords];

  // Collapse repeated n-grams from largest window (6 words) down to 1 word
  for (let n = 6; n >= 1; n--) {
    let i = 0;
    const nextWords: string[] = [];
    while (i < words.length) {
      if (nextWords.length >= n && i + n <= words.length) {
        let isMatch = true;
        for (let k = 0; k < n; k++) {
          const prevWord = normalizeArabicToken(nextWords[nextWords.length - n + k]);
          const currWord = normalizeArabicToken(words[i + k]);
          if (!prevWord || prevWord !== currWord) {
            isMatch = false;
            break;
          }
        }
        if (isMatch) {
          i += n;
          continue;
        }
      }
      nextWords.push(words[i]);
      i += 1;
    }
    words = nextWords;
  }

  return words.join(' ');
}

/**
 * Merges two speech transcript segments without duplicating overlapping prefixes or suffixes.
 * Handles Android Chrome's cumulative `event.results` bug where `nextSegment` contains the
 * entire `accumulated` string plus the newly spoken words.
 */
export function mergeTranscriptSegments(accumulated: string, nextSegment: string): string {
  const acc = accumulated.replace(/\s+/g, ' ').trim();
  const seg = nextSegment.replace(/\s+/g, ' ').trim();

  if (!acc) return seg;
  if (!seg) return acc;

  const normAcc = normalizePhraseForComparison(acc);
  const normSeg = normalizePhraseForComparison(seg);

  if (!normAcc) return seg;
  if (!normSeg) return acc;

  // 1. Exact match or `acc` already ends with `seg` -> no new words to add
  if (normAcc === normSeg || normAcc.endsWith(' ' + normSeg)) {
    return acc;
  }

  // 2. Android Chrome cumulative behavior: `seg` starts with `acc` -> `seg` is a superset replacement
  if (normSeg.startsWith(normAcc + ' ') || normSeg.startsWith(normAcc)) {
    return seg;
  }

  // 3. `acc` starts with `seg` (older partial segment re-emitted) -> keep `acc`
  if (normAcc.startsWith(normSeg + ' ')) {
    return acc;
  }

  // 4. Suffix-prefix word overlap check (up to 10 words)
  const accWords = acc.split(' ');
  const segWords = seg.split(' ');
  const maxOverlap = Math.min(accWords.length, segWords.length, 10);

  for (let overlapLen = maxOverlap; overlapLen >= 1; overlapLen--) {
    let matches = true;
    for (let j = 0; j < overlapLen; j++) {
      const aWord = normalizeArabicToken(accWords[accWords.length - overlapLen + j]);
      const sWord = normalizeArabicToken(segWords[j]);
      if (!aWord || aWord !== sWord) {
        matches = false;
        break;
      }
    }
    if (matches) {
      const remainingSegWords = segWords.slice(overlapLen);
      if (remainingSegWords.length === 0) return acc;
      return `${acc} ${remainingSegWords.join(' ')}`;
    }
  }

  return `${acc} ${seg}`;
}

/**
 * Extracts a clean, non-duplicated transcript from a SpeechRecognitionEvent `results` list
 * and combines it safely with any text that was already in the input box before dictation started.
 */
export function buildCleanSpeechTranscript(
  initialBaseText: string,
  results: ArrayLike<{
    isFinal?: boolean;
    0: { transcript: string };
  }>
): string {
  let sessionTranscript = '';

  for (let i = 0; i < results.length; i += 1) {
    const res = results[i];
    const piece = res?.[0]?.transcript?.trim() || '';
    if (!piece) continue;
    sessionTranscript = mergeTranscriptSegments(sessionTranscript, piece);
  }

  const combined = mergeTranscriptSegments(initialBaseText, sessionTranscript);
  return deduplicateSpeechText(combined);
}
