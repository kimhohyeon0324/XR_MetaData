# XR_MetaData: WebXR 햅틱·오디오 메타데이터 저작 도구

> **WebXR 기반 3D 가상 공간에서 오브젝트에 연계된 햅틱 피드백 및 오디오 메타데이터를 직관적으로 저작하고 실시간으로 검증하는 풀스택 연구용 도구**  
> Three.js 및 Web Audio / WebXR Gamepad API를 기반으로, 외부 햅틱·사운드 에셋을 3D 오브젝트에 매핑하고 60ms 윈도우 슬라이싱과 프록시 히트박스를 통해 Meta Quest에서 안정적인 90fps 멀티모달 상호작용 보장.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r163-black.svg)](https://threejs.org/)
[![WebXR](https://img.shields.io/badge/WebXR-Meta%20Quest%202%2F3%2FPro-blue.svg)](https://immersiveweb.dev/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey.svg)](https://expressjs.com/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF.svg)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## 데모 미리보기

| 1. 메인 3D 가상 공간 화면 | 2. 메타데이터 관리자 UI (Admin) |
| :---: | :---: |
| ![메인 3D 가상 공간 화면](docs/images/1_main_scene.png) | ![메타데이터 관리자 UI](docs/images/2_admin_ui.png) |
| **3. VR 컨트롤러 인터랙션 화면** | **4. 메타데이터 상세 편집 화면 (모달)** |
| ![VR 컨트롤러 인터랙션 화면](docs/images/3_vr_interaction.png) | ![메타데이터 상세 편집 화면](docs/images/4_admin_modal.png) |

---

## 1. 프로젝트 개요

* **기술 스택**: 
  - **Frontend**: Three.js (r163), WebXR Device API, Web Audio API, Vite, `@vitejs/plugin-basic-ssl`
  - **Backend**: Node.js, Express.js (RESTful API Engine, 정적 에셋 서빙)
  - **Data Engine**: JSON 영속성 데이터베이스 (`metadata.json`)
  - **Target Device**: Meta Quest 2 / 3 / Pro (Oculus Browser), 데스크톱 브라우저 (Chrome/Edge)

---

## 2. 문제 의식

1. **앱 재빌드 및 재설치 반복에 따른 검증 지연**:
   - 기존 개발 환경에서는 3D 오브젝트에 소리와 진동을 연결하고 테스트할 때마다 앱 빌드와 기기 재설치를 반복해야 하여 검증에 많은 시간이 소모됨.
2. **사운드·진동·3D 저작 도구의 분절**:
   - 음향 편집기, 진동 에디터, 3D 모델링 도구가 제각각 분리되어 있어, 가상 공간 내에서 시각·청각·촉각의 타이밍과 위치를 실시간으로 맞추기 어려움.
   - 이에 따라 **별도 앱 설치나 빌드 과정 없이 웹 브라우저에서 오브젝트별 햅틱·오디오 메타데이터를 즉시 설정하고, VR 환경에서 실시간으로 조작·검증할 수 있는 저작 도구**를 구축하고자 함.

---

## 3. 시스템 아키텍처

```mermaid
flowchart TB
    subgraph AdminLayer["1. 저작 및 관리 레이어 (Admin Interface)"]
        UI["Admin Web UI\n(위치·구간·색상 실시간 편집)"]
        REST["REST API Engine (Express 3001)\n(GET / POST / PUT / DELETE)"]
        DB[("metadata.json\n(경량 영속성 데이터 저장소)")]
    end

    subgraph ServerBridge["2. 통신 및 프록시 (Server & Proxy)"]
        ViteDev["Vite HTTPS Server (5173)\n(SSL 터널링 & API 리버스 프록시)"]
    end

    subgraph RuntimeLayer["3. WebXR 런타임 레이어 (Meta Quest)"]
        XR["WebXR 6DoF Engine\n(Three.js r163 스테레오 렌더러)"]
        Audio["Web Audio Engine\n(저지연 메모리 캐싱 & 세그먼트 재생)"]
        Haptic["60ms Haptic Slicer\n(컨트롤러 진동 묶음 처리)"]
        Hitbox["Hitbox Proxy Raycaster\n(단순 박스 기반 빠른 충돌 판정)"]
    end

    UI <--> REST
    REST <--> DB
    REST <--> ViteDev
    ViteDev <--> XR
    XR --> Audio
    XR --> Haptic
    XR --> Hitbox
```

* **실시간 저작-검증 분리 루프**:
  Express REST API를 통한 메타데이터 JSON 영속화와 Vite 리버스 프록시를 거친 Three.js 런타임 씬 간의 실시간 분리 아키텍처 적용.
* **멀티모달 렌더 루프 및 햅틱 슬라이싱**:
  Web Audio 세그먼트 캐싱과 60ms 윈도우 슬라이서 펄스 전송을 WebXR 렌더 루프(`setAnimationLoop`)와 동기화하여 지연 없는 피드백 제공.

---

## 4. 핵심 문제 해결 및 성능 최적화

### 1) 60ms 묶음 전송(슬라이싱)으로 컨트롤러 진동 누락 및 모터 부하 해결
* **문제 현상**:
  - 외부 햅틱 에디터에서 추출한 1ms 단위 고주파 진동 데이터를 WebXR Gamepad API(`pulse()`)로 연속 호출하면, 브라우저 메인 루프 지연 및 컨트롤러 내부 진동 모터의 신호 중첩으로 인해 진동이 끊기거나 누락되는 현상 발생.
* **해결 방법**:
  - 진동 모터의 물리적 반응 시간(약 30~50ms)을 고려하여, 신호 중첩을 방지하는 **60ms 윈도우 슬라이싱** 기법을 적용.
  - 구간별 평균 진동 강도를 산출하여 단일 펄스로 압축 전달함으로써, 하드웨어 부하를 방지하면서도 원본 햅틱의 세밀한 질감과 강약을 부드럽게 재현.

### 2) 단순 박스형 히트박스(Hitbox Proxy)로 90 FPS 레이캐스팅 방어
* **문제 현상**:
  - 수십만 개 폴리곤의 고해상도 차량 모델(60MB+)에 대해 VR 컨트롤러 레이저 포인터가 매 프레임(90Hz) 광선-삼각형 교차 검사를 수행하면서 심각한 CPU 병목과 함께 45 FPS 이하로 프레임 급락.
* **해결 방법**:
  - 복잡한 차량 원본 메쉬 대신, 차량 외곽 바운딩 크기에 맞춘 경량 투명 박스(Hitbox Proxy)를 생성하여 씬에 배치.
  - 레이캐스터 충돌 판정 대상을 이 투명 박스 1개로 제한하여 충돌 검사 비용을 $O(N)$에서 $O(1)$로 단축, 고해상도 모델 환경에서도 안정적인 90 FPS 상호작용을 보장.

---

## 5. 조작 가이드

### 데스크톱 웹 환경
| 입력 | 동작 |
| :--- | :--- |
| **마우스 좌클릭 (3D 오브젝트 조준)** | 해당 오브젝트 선택, 오디오 재생 및 3D 정보창 표시 |
| **마우스 좌클릭 드래그** | 씬 360° 궤도 회전 |
| **마우스 우클릭 드래그** | 카메라 시점 이동 |
| **마우스 휠 스크롤** | 카메라 확대 / 축소 |
| **관리자 페이지 접속 (`/admin`)** | 3D 오브젝트 등록, 위치 좌표(X/Y/Z) 및 햅틱 재생 구간 실시간 편집 |

### Meta Quest 환경
| 컨트롤러 입력 | 동작 |
| :--- | :--- |
| **컨트롤러 레이저 포인팅** | 3D 오브젝트 겨냥 (타깃 커서 가이드 표시) |
| **컨트롤러 트리거 클릭** | 오브젝트 선택 및 인터랙션 실행 (소리 재생 + 60ms 햅틱 진동 피드백) |

---

## 6. 빠른 시작

### 사전 요구사항
* [Node.js](https://nodejs.org/) v20.0.0 이상
* [Git LFS](https://git-lfs.com/) (대용량 3D 에셋 클론 시 필수)

### 1) 저장소 클론 및 패키지 설치
```bash
# Git LFS 활성화 (대용량 3D 에셋 다운로드)
git lfs install

# 저장소 클론
git clone https://github.com/kimhohyeon0324/XR_MetaData.git
cd XR_MetaData

# 의존성 설치
npm install
```

### 2) 개발 서버 실행
```bash
npm run dev
```
> `npm run dev` 실행 시 백엔드 API 서버(포트 3001)와 Vite 프론트엔드 서버(포트 5173)가 동시 실행되며, 현재 PC의 실제 네트워크 IP가 콘솔에 자동 출력.

* **PC 3D 뷰어**: `https://localhost:5173/`
* **관리자 페이지 (Admin UI)**: `https://localhost:5173/admin`
* **REST API 엔드포인트**: `http://localhost:3001/api/metadata`

---

## 7. Meta Quest 접속 가이드

1. **동일한 로컬 네트워크(Wi-Fi) 연결**:
   - 서버를 구동 중인 PC와 Meta Quest 헤드셋이 **반드시 같은 공유기(Wi-Fi)** 에 연결되어 있어야 함.
2. **Quest 브라우저에서 접속**:
   - 헤드셋을 착용하고 오큘러스 브라우저 주소창에 터미널에 출력된 IP 주소 입력:
     ```
     https://<PC_로컬_IP>:5173
     ```
3. **자체 서명 SSL 인증서 승인 (최초 1회 필수)**:
   - 첫 접속 시 *"연결이 비공개로 설정되어 있지 않습니다"* 경고 표시 시, 화면 하단의 **[고급]** 클릭 후 **[<PC_IP> (안전하지 않음)으로 이동]** 선택하여 승인.
4. **VR 진입**:
   - 화면 중앙 하단의 **`ENTER VR`** 버튼 클릭하여 몰입형 3D 인터랙션 세션 진입.

---

## 8. 외부 에셋 라이선스

프로젝트에 활용된 외부 3D 에셋은 해당 라이선스 규정을 준수하여 사용:

* **1972 Datsun 240K GT 3D Model**:
  - **저작자**: Karol Miklas ([Sketchfab Profile](https://sketchfab.com/karolmiklas))
  - **출처**: [(FREE) 1972 Datsun 240k GT on Sketchfab](https://sketchfab.com/3d-models/free-1972-datsun-240k-gt-b2303a552b444e5b8637fdf5169b41cb)
  - **라이선스**: [CC-BY-SA 4.0 (Creative Commons Attribution-ShareAlike 4.0 International)](http://creativecommons.org/licenses/by-sa/4.0/)

---

## 9. 한계점 및 향후 과제

### 현재 한계점

> 아래 항목들은 현재 시스템이 의도적으로 단순화하거나 아직 해결하지 못한 제약사항.

| # | 한계 항목 | 상세 내용 |
| :--- | :--- | :--- |
| **1** | **단일 파일 기반 JSON 영속성** | 경량 구조를 위해 `metadata.json` 파일 직접 I/O 방식을 채택. 다중 사용자 동시 편집 시 파일 락(Lock) 충돌 방지 및 대규모 메타데이터 트랜잭션 처리에 한계 존재. |
| **2** | **단순 박스형 히트박스 프록시의 형상 오차** | 90 FPS 레이캐스팅 성능을 위해 직육면체 히트박스 프록시를 적용. 복잡한 차량 곡면 부품의 실제 외곽선과 박스 경계 간 판정 오차 발생 가능. |
| **3** | **햅틱 주파수 대역 분할 미지원** | 컨트롤러 진동 모터 부하를 막기 위해 60ms 평균 강도 단일 펄스 방식을 적용. 원본 햅틱 파일의 미세한 고주파 질감 및 주파수(Hz) 변화의 정밀 표현에 한계 존재. |
| **4** | **자동화 단위 테스트 및 CI 부재** | 수동 인터랙션 검증 중심으로 개발되어, 백엔드 Express REST API 엔드포인트 및 브라우저 단위 테스트 파이프라인 미구현. |
| **5** | **외부 상용 클라우드 배포 미연동** | PC와 HMD 간 동일 로컬 네트워크(Wi-Fi) 통신 기반으로 설계. 외부 접속을 위한 퍼블릭 클라우드 호스팅 및 SSL 도메인 배포 파이프라인 미구성. |

---

### 향후 과제

우선순위 기준 정렬:

1. **SQLite 또는 경량 RDBMS 기반 데이터 저장소 전환**
   - 동시 편집 무결성 보장 및 데이터 영속화 안정성 확보

2. **OBB(Oriented Bounding Box) 및 부품별 복합 프록시 도입**
   - 곡면 및 복잡 형상 오브젝트에 대한 레이캐스팅 판정 정밀도 향상

3. **주파수 대역별 멀티채널 햅틱 피드백 고도화**
   - 진동 세기뿐만 아니라 주파수 변조를 통한 다양한 표면 질감 표현 지원

4. **Vitest 및 Supertest 기반 단위/통합 테스트 파이프라인 구축**
   - REST API 및 햅틱 슬라이서 모듈에 대한 GitHub Actions CI 자동 검증 연동

5. **클라우드 호스팅 및 WebSockets 기반 실시간 동기화 지원**
   - 다중 사용자 원격 협업 저작 및 상시 라이브 데모 환경 구축

---

## 라이선스

본 프로젝트의 소스코드는 [MIT License](LICENSE) 준수.


