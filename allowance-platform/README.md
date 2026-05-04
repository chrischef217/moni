# 수당 지급 관리 플랫폼

소스 제조 공장 내부용 프리랜서 수당 지급 관리 시스템입니다.

## 기술 스택
- 백엔드: Node.js + Express + Sequelize
- DB: PostgreSQL / SQLite(기본)
- 프론트엔드: React(Vite) + Tailwind CSS
- 인증: express-session (30분 미사용 시 자동 만료)
- PDF 생성: Puppeteer

## 프로젝트 구조
- `server`: REST API, 인증/권한, DB 모델, 정산 계산, PDF 생성
- `client`: 관리자/프리랜서 화면, 정산서 렌더링, 인쇄/다운로드

## 설치 방법
```bash
cd allowance-platform
npm install
npm install --prefix server
npm install --prefix client
```

## 환경변수 설정
1. 프로젝트 루트의 `.env.example`을 참고하여 `server/.env`, `client/.env`를 생성해 주세요.
2. 최소 필수값:
- `SESSION_SECRET`
- `ENCRYPTION_KEY`
- `VITE_API_URL`

PostgreSQL 사용 시 `DATABASE_URL`을 설정하면 자동으로 PostgreSQL 연결을 사용합니다.
설정하지 않으면 `SQLITE_PATH` 기준 SQLite 파일을 사용합니다.

## 실행 방법
### 개발 실행(서버+클라이언트 동시)
```bash
npm run dev
```

### 개별 실행
```bash
npm run dev:server
npm run dev:client
```

- 서버: `http://localhost:4000`
- 클라이언트: `http://localhost:5173`

## 자동 배포
이 프로젝트는 단일 컨테이너(백엔드+프론트 빌드 결과 포함)로 배포할 수 있도록 구성되어 있습니다.

### 1) Railway 자동 배포 (권장)
- 준비 파일:
  - `Dockerfile`
  - `railway.json`
  - `.github/workflows/deploy-allowance-railway.yml` (repo 루트 기준)
- GitHub Secrets 설정:
  - `RAILWAY_TOKEN`
  - `RAILWAY_SERVICE`
- 동작:
  - `main` 브랜치에 `allowance-platform/**` 변경사항이 푸시되면 자동 배포됩니다.

### 2) Render 배포
- 준비 파일: `render.yaml`
- Render Blueprint로 배포 시 앱 서비스 + PostgreSQL 서비스를 함께 생성할 수 있습니다.

### 배포 환경변수 필수값
- `SESSION_SECRET`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `DATABASE_URL` (PostgreSQL 연결 문자열)
- `CLIENT_URL` (same-origin이면 비워도 무방)

## 초기 관리자 계정
- 아이디: `admin`
- 비밀번호: `1111`

## 주요 구현 사항
- 공통 로그인 페이지(관리자/프리랜서)
- 역할 기반 접근 제어(서버 권한 검증 포함)
- 프리랜서 주민등록번호 AES-256 암호화 저장
- 비밀번호 bcrypt 해시 저장
- 수당 자동 계산:
  - 제품별 수당 = `수량(kg) × 단가`
  - 총 수당 = `Σ 제품별 수당`
  - 원천징수 = `총 수당 × 0.033`
  - 차인지급액 = `총 수당 - 원천징수`
- 관리자 기능:
  - 프리랜서 CRUD
  - 거래처/제품 CRUD
  - 수당 입력/저장/삭제
  - 회사정보, 지급일, 관리자 계정, 프리랜서 계정 설정
- 프리랜서 기능:
  - 연월별 정산서 조회
  - 인쇄(`@media print`)
  - PDF 저장(Puppeteer)

## 데이터베이스 테이블
아래 테이블이 Sequelize 모델로 생성됩니다.
- `CompanyInfo`
- `AdminAccount`
- `Freelancer`
- `Client`
- `Product`
- `PayRecord`
- `PayDetail`
- `SystemConfig`

## 주의
- 운영 환경에서는 `express-session` 메모리 스토어 대신 Redis/DB 스토어 사용을 권장합니다.
- Puppeteer 실행 환경에 따라 Chromium 관련 라이브러리 설치가 필요할 수 있습니다.
