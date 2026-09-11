// ============================================================
// haptic.js — .haptic JSON 파싱 → WebXR 컨트롤러 진동 재생
// 60ms 윈도우 슬라이싱으로 LRA 햅틱 모터 완벽 구동
// ============================================================

let activeHapticTimers = [];

/**
 * 진행 중인 진동 스케줄을 즉시 중단합니다.
 */
export function stopHaptic() {
  activeHapticTimers.forEach(id => clearTimeout(id));
  activeHapticTimers = [];
}

/**
 * .haptic 파일의 진폭 포락선(envelope)을 분석하여 메타 퀘스트 컨트롤러에 진동을 출력합니다.
 *
 * @param {XRSession} session - 활성 WebXR 세션
 * @param {object}    hapticData - .haptic 파싱 객체
 * @param {number}    startSec - 재생 시작 시간(초)
 * @param {number|null} endSec - 재생 종료 시간(초)
 * @param {XRInputSource|null} inputSource - 이벤트를 발생시킨 컨트롤러
 */
export function playHaptic(session, hapticData, startSec = 0, endSec = null, inputSource = null) {
  stopHaptic();

  try {
    const amplitudeEnvelope = hapticData?.signals?.continuous?.envelopes?.amplitude ?? [];
    if (amplitudeEnvelope.length === 0) {
      console.warn('햅틱 데이터가 비어 있습니다.');
      return;
    }

    // 진동을 재생할 Gamepad 액추에이터 탐색
    let targetActuator = null;

    // 1순위: 트리거를 당긴 컨트롤러의 액추에이터
    if (inputSource?.gamepad?.hapticActuators?.length > 0) {
      targetActuator = inputSource.gamepad.hapticActuators[0];
    }

    // 2순위: 세션에 등록된 입력 장치 중 햅틱 액추에이터가 있는 컨트롤러
    if (!targetActuator && session?.inputSources) {
      for (const source of session.inputSources) {
        if (source.gamepad?.hapticActuators?.length > 0) {
          targetActuator = source.gamepad.hapticActuators[0];
          break;
        } else if (source.gamepad?.vibrationActuator) {
          targetActuator = source.gamepad.vibrationActuator;
          break;
        }
      }
    }

    if (!targetActuator) {
      console.warn('사용 가능한 햅틱 액추에이터(컨트롤러)를 찾지 못했습니다.');
      return;
    }

    // 진동 실행 함수
    function pulse(intensity, durationMs) {
      const safeAmp = Math.max(0.08, Math.min(1.0, intensity));
      const safeDuration = Math.max(20, Math.min(300, durationMs));

      if (typeof targetActuator.pulse === 'function') {
        try {
          targetActuator.pulse(safeAmp, safeDuration);
        } catch (e) {
          console.warn('pulse 실행 오류:', e);
        }
      } else if (typeof targetActuator.playEffect === 'function') {
        try {
          targetActuator.playEffect('dual-rumble', {
            duration: safeDuration,
            strongMagnitude: safeAmp,
            weakMagnitude: safeAmp * 0.7
          }).catch(() => {});
        } catch (_) {}
      }
    }

    // 트리거 클릭 즉시 반응 (100% 즉각 햅틱 피드백 70ms)
    pulse(0.9, 70);

    // 해당 구간의 포인트만 필터링
    const fromTime = Math.max(0, startSec);
    const toTime = endSec != null && endSec > fromTime ? endSec : (startSec + 5.0);

    const segmentPoints = amplitudeEnvelope.filter(p => p.time >= fromTime && p.time <= toTime);
    if (segmentPoints.length === 0) return;

    // 60ms 윈도우 슬라이싱: 모터 반응 속도에 맞춰 연속 진동 합성
    const windowStep = 0.06; // 60ms
    const totalDuration = toTime - fromTime;

    for (let t = 0; t <= totalDuration; t += windowStep) {
      const windowStart = fromTime + t;
      const windowEnd = windowStart + windowStep;

      const slice = segmentPoints.filter(p => p.time >= windowStart && p.time < windowEnd);
      if (slice.length === 0) continue;

      // 해당 60ms 구간 내 최대 진폭 추출
      const maxAmp = Math.max(...slice.map(p => (p.emphasis ? p.emphasis.amplitude : p.amplitude)));

      if (maxAmp > 0.03) {
        const delayMs = Math.round(t * 1000);
        const timerId = setTimeout(() => {
          pulse(maxAmp, 75); // 75ms 지속 (자연스러운 오버랩)
        }, delayMs);
        activeHapticTimers.push(timerId);
      }
    }

    console.log(`📳 햅틱 실행 완료: ${fromTime}s ~ ${toTime}s 구간`);
  } catch (err) {
    console.error('햅틱 처리 오류:', err);
  }
}
