// ============================================================
// audio.js — Web Audio API MP3 구간 재생 및 사전 로딩
// ============================================================

const bufferCache = new Map();

/**
 * 오디오 파일을 메모리에 버퍼로 사전 적재
 */
export async function preloadAudio(ctx, url) {
  if (bufferCache.has(url)) return bufferCache.get(url);
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`사운드 파일 다운로드 실패 [${resp.status}]:`, url);
      return null;
    }
    const arrayBuf = await resp.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuf);
    bufferCache.set(url, buffer);
    return buffer;
  } catch (e) {
    console.warn('오디오 디코딩 오류:', url, e);
    return null;
  }
}

/**
 * 지정 구간의 오디오를 즉시 재생합니다.
 *
 * @param {AudioContext} ctx
 * @param {string} url - '/sounds/explosion.mp3' 형태
 * @param {number} startSec - 시작 시간(초)
 * @param {number|null} endSec - 종료 시간(초)
 */
export async function playAudioSegment(ctx, url, startSec = 0, endSec = null) {
  try {
    // 서스펜드 해제
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    let buffer = bufferCache.get(url);
    if (!buffer) {
      buffer = await preloadAudio(ctx, url);
      if (!buffer) return;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    const offset = Math.max(0, startSec);
    if (endSec != null && endSec > offset) {
      const duration = endSec - offset;
      source.start(0, offset, duration);
      console.log(`🔊 사운드 재생 (구간): ${url} [${offset}s ~ ${endSec}s (${duration.toFixed(2)}초간)]`);
    } else {
      source.start(0, offset);
      console.log(`🔊 사운드 재생 (끝까지): ${url} [${offset}s ~ 끝]`);
    }
  } catch (e) {
    console.error('오디오 재생 오류:', e);
  }
}
