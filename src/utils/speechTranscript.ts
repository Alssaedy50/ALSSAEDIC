/**
 * Utilities to prevent word and sentence repetition in Web Speech API (SpeechRecognition / webkitSpeechRecognition),
 * across both continuous desktop sessions and auto-restarted mobile sessions (Android Chrome / Mobile WebKit).
 */

function normalizeArabicToken(word: string): string {
  return word
    .trim()
    .replace(/[،,.؛:!؟"'()[\]{}]/g, '')
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
 * Checks whether `candidateWords` is a cumulative revision/extension of `baseWords`
 * (e.g., when SpeechRecognition revises 1 word in an earlier interim result and adds more words).
 */
function isCumulativeRevision(baseWords: string[], candidateWords: string[]): boolean {
  if (baseWords.length < 2 || candidateWords.length < baseWords.length) {
    return false;
  }

  // Must start with the same first word (or second word if first word was adjusted)
  const firstMatch =
    normalizeArabicToken(baseWords[0]) === normalizeArabicToken(candidateWords[0]);
  const secondMatch =
    baseWords.length >= 2 &&
    candidateWords.length >= 2 &&
    normalizeArabicToken(baseWords[1]) === normalizeArabicToken(candidateWords[1]);

  if (!firstMatch && !secondMatch) {
    return false;
  }

  // Count how many tokens of baseWords match candidateWords in approximate position
  let matchedCount = 0;
  let searchStart = 0;
  const maxCheckIdx = Math.min(candidateWords.length, baseWords.length + 3);

  for (let i = 0; i < baseWords.length; i++) {
    const bNorm = normalizeArabicToken(baseWords[i]);
    if (!bNorm) continue;
    for (let j = searchStart; j < maxCheckIdx; j++) {
      if (normalizeArabicToken(candidateWords[j]) === bNorm) {
        matchedCount += 1;
        searchStart = j + 1;
        break;
      }
    }
  }

  return matchedCount / baseWords.length >= 0.7;
}

/**
 * Removes consecutive repeated words, phrases, AND full sentences (1 to 24 words),
 * including near-duplicate consecutive sentences where the recognizer slightly revised 1 word.
 */
export function deduplicateSpeechText(rawText: string): string {
  const rawWords = rawText
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (rawWords.length <= 1) return rawWords.join(' ');

  let words = [...rawWords];
  const maxWindow = Math.min(24, Math.floor(words.length / 2));

  // 1. Exact normalized n-gram deduplication from largest sentence window down to 1 word
  for (let n = maxWindow; n >= 1; n--) {
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
          // Replace previous chunk with the newer chunk (preserves latest spelling/punctuation)
          for (let k = 0; k < n; k++) {
            nextWords[nextWords.length - n + k] = words[i + k];
          }
          i += n;
          continue;
        }
      }
      nextWords.push(words[i]);
      i += 1;
    }
    words = nextWords;
  }

  // 2. Near-duplicate consecutive clause deduplication (4 to 16 words where >=80% tokens match and start/end match)
  const maxFuzzyWindow = Math.min(16, Math.floor(words.length / 2));
  for (let n = maxFuzzyWindow; n >= 4; n--) {
    let i = 0;
    const nextWords: string[] = [];
    while (i < words.length) {
      if (nextWords.length >= n && i + n <= words.length) {
        const prevStart = normalizeArabicToken(nextWords[nextWords.length - n]);
        const currStart = normalizeArabicToken(words[i]);
        const prevEnd = normalizeArabicToken(nextWords[nextWords.length - 1]);
        const currEnd = normalizeArabicToken(words[i + n - 1]);

        if (prevStart && prevStart === currStart && prevEnd && prevEnd === currEnd) {
          let matchCount = 0;
          for (let k = 0; k < n; k++) {
            if (
              normalizeArabicToken(nextWords[nextWords.length - n + k]) ===
              normalizeArabicToken(words[i + k])
            ) {
              matchCount += 1;
            }
          }
          if (matchCount >= n - 1) {
            for (let k = 0; k < n; k++) {
              nextWords[nextWords.length - n + k] = words[i + k];
            }
            i += n;
            continue;
          }
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
 * Merges two speech transcript segments without duplicating overlapping prefixes, suffixes,
 * or cumulative speech revisions.
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

  // 2. Cumulative behavior: `seg` starts with `acc` -> `seg` is a superset replacement
  if (normSeg.startsWith(normAcc + ' ') || normSeg.startsWith(normAcc)) {
    return seg;
  }

  // 3. `acc` starts with `seg` (older partial segment re-emitted) -> keep `acc`
  if (normAcc.startsWith(normSeg + ' ')) {
    return acc;
  }

  const accWords = acc.split(' ');
  const segWords = seg.split(' ');

  // 4. Fuzzy cumulative revision of entire `acc` (when recognizer corrected 1 word inside `acc`)
  if (isCumulativeRevision(accWords, segWords)) {
    return seg;
  }

  // 5. Fuzzy cumulative revision of a suffix clause of `acc`
  const maxTailLen = Math.min(accWords.length, segWords.length);
  for (let tailLen = maxTailLen; tailLen >= 2; tailLen--) {
    const startIdx = accWords.length - tailLen;
    const accTail = accWords.slice(startIdx);
    if (isCumulativeRevision(accTail, segWords)) {
      const prefix = accWords.slice(0, startIdx);
      return [...prefix, ...segWords].join(' ');
    }
  }

  // 6. Suffix-prefix exact word overlap check (up to 16 words)
  const maxOverlap = Math.min(accWords.length, segWords.length, 16);
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
 * Extracts a clean, non-duplicated transcript from the current SpeechRecognition session's `results`.
 */
export function extractSessionSpeechTranscript(
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

  return deduplicateSpeechText(sessionTranscript);
}

/**
 * Extracts a clean, non-duplicated transcript from a SpeechRecognitionEvent `results` list
 * and combines it safely with any text that was already committed before the current recognition session started.
 */
export function buildCleanSpeechTranscript(
  committedBaseText: string,
  results: ArrayLike<{
    isFinal?: boolean;
    0: { transcript: string };
  }>
): string {
  const sessionTranscript = extractSessionSpeechTranscript(results);
  const combined = mergeTranscriptSegments(committedBaseText, sessionTranscript);
  return deduplicateSpeechText(combined);
}
