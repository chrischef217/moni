'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AllowanceLogin() {
  const router = useRouter()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!loginId.trim() || !password.trim()) {
      setError('아이디와 비밀번호를 입력해 주세요.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/allowance/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; user?: { role: 'admin' | 'freelancer' } }
        | null

      if (!response.ok || !payload?.ok || !payload.user) {
        throw new Error(payload?.error || '로그인에 실패했습니다.')
      }

      if (payload.user.role === 'admin') {
        router.replace('/')
      } else {
        router.replace('/freelancer')
      }
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : '로그인 처리 중 오류가 발생했습니다.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main data-moni-login className="moni-login-root">
      <section className="moni-login-card" aria-labelledby="moni-login-title">
        <div className="moni-login-character" aria-hidden="true">
          <span className="moni-login-antenna-stem" />
          <span className="moni-login-antenna-dot" />
          <span className="moni-login-face-glow" />
          <span className="moni-login-eye moni-login-eye-left" />
          <span className="moni-login-eye moni-login-eye-right" />
          <span className="moni-login-mouth" />
          <span className="moni-login-ear moni-login-ear-left" />
          <span className="moni-login-ear moni-login-ear-right" />
        </div>

        <h1 id="moni-login-title" className="moni-login-title">
          <span>MONI</span> 두배 공장 관리시스템
        </h1>

        <div className="moni-login-form">
          <label className="moni-login-field">
            <span>아이디</span>
            <input
              autoComplete="username"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              disabled={loading}
            />
          </label>

          <label className="moni-login-field">
            <span>비밀번호</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit()
              }}
              disabled={loading}
            />
          </label>
        </div>

        {error ? <p className="moni-login-error" role="alert">{error}</p> : null}

        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="moni-login-submit"
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </section>

      <style jsx global>{`
        .moni-login-root {
          position: relative;
          display: flex;
          min-height: 100dvh;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          padding: 24px;
          color: rgb(var(--moni-glass-text));
          background:
            radial-gradient(circle at 84% 0%, rgb(134 207 255 / 0.24), transparent 30%),
            radial-gradient(circle at 9% 100%, rgb(171 216 246 / 0.22), transparent 34%),
            linear-gradient(145deg, rgb(246 251 255 / 0.98), rgb(231 242 252 / 0.96));
        }

        .moni-login-root::before,
        .moni-login-root::after {
          content: '';
          position: absolute;
          pointer-events: none;
          border-radius: 999px;
          filter: blur(2px);
        }

        .moni-login-root::before {
          width: 420px;
          height: 420px;
          top: -250px;
          left: -130px;
          border: 1px solid rgb(var(--moni-glass-blue) / 0.13);
          box-shadow: 0 0 90px rgb(var(--moni-glass-blue) / 0.05);
        }

        .moni-login-root::after {
          width: 520px;
          height: 520px;
          right: -250px;
          bottom: -330px;
          border: 1px solid rgb(var(--moni-glass-border) / 0.30);
        }

        .moni-login-card {
          position: relative;
          z-index: 1;
          width: min(100%, 440px);
          border: 1px solid rgb(var(--moni-glass-border) / 0.62);
          border-radius: 32px;
          background: rgb(255 255 255 / 0.80);
          padding: 40px 38px 36px;
          box-shadow: 0 26px 70px rgb(var(--moni-glass-shadow) / 0.14), inset 0 1px 0 rgb(255 255 255 / 0.92);
          backdrop-filter: blur(10px) saturate(110%);
          -webkit-backdrop-filter: blur(10px) saturate(110%);
        }

        .moni-login-character {
          position: relative;
          width: 82px;
          height: 82px;
          margin: 0 auto 24px;
          border: 1px solid rgb(255 255 255 / 0.25);
          border-radius: 28px;
          background: #0c2337;
          box-shadow: 0 16px 36px rgb(2 6 23 / 0.22);
          animation: moniLoginFloat 2.7s ease-in-out infinite;
          transform-origin: center;
        }

        .moni-login-antenna-stem {
          position: absolute;
          top: -9px;
          left: 50%;
          width: 4px;
          height: 12px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: rgb(110 231 183 / 0.80);
        }

        .moni-login-antenna-dot {
          position: absolute;
          top: -16px;
          left: 50%;
          width: 11px;
          height: 11px;
          transform: translateX(-50%);
          border: 1px solid rgb(209 250 229 / 0.42);
          border-radius: 999px;
          background: rgb(52 211 153);
          box-shadow: 0 0 16px rgb(110 231 183 / 0.65);
        }

        .moni-login-face-glow {
          position: absolute;
          inset: 4px;
          border-radius: 24px;
          background: linear-gradient(135deg, rgb(110 231 183 / 0.20), rgb(103 232 249 / 0.10) 52%, rgb(59 130 246 / 0.20));
        }

        .moni-login-eye {
          position: absolute;
          top: 28px;
          width: 11px;
          height: 11px;
          border-radius: 999px;
          background: rgb(236 253 245);
          animation: moniLoginBlink 2.15s ease-in-out infinite;
          transform-origin: center;
        }

        .moni-login-eye-left { left: 22px; }
        .moni-login-eye-right { right: 22px; }

        .moni-login-mouth {
          position: absolute;
          left: 50%;
          bottom: 19px;
          width: 20px;
          height: 10px;
          transform: translateX(-50%);
          border-bottom: 3px solid rgb(209 250 229 / 0.92);
          border-radius: 0 0 18px 18px;
          animation: moniLoginSmile 1.55s ease-in-out infinite;
          transform-origin: center bottom;
        }

        .moni-login-ear {
          position: absolute;
          top: 38px;
          width: 6px;
          height: 18px;
          border-radius: 999px;
          background: rgb(103 232 249 / 0.50);
        }

        .moni-login-ear-left { left: -5px; }
        .moni-login-ear-right { right: -5px; }

        .moni-login-title {
          margin: 0;
          color: rgb(var(--moni-glass-text));
          font-size: clamp(24px, 5vw, 29px);
          font-weight: 800;
          line-height: 1.28;
          letter-spacing: -0.035em;
          text-align: center;
        }

        .moni-login-title > span {
          color: rgb(var(--moni-glass-blue));
          font-weight: 900;
          letter-spacing: -0.02em;
        }

        .moni-login-form {
          display: grid;
          gap: 16px;
          margin-top: 32px;
        }

        .moni-login-field {
          display: grid;
          gap: 8px;
          color: rgb(var(--moni-glass-text-secondary));
          font-size: 13px;
          font-weight: 700;
        }

        .moni-login-field input {
          width: 100%;
          height: 50px;
          border: 1px solid rgb(var(--moni-glass-border) / 0.72);
          border-radius: 14px;
          outline: none;
          background: rgb(255 255 255 / 0.88);
          padding: 0 15px;
          color: rgb(var(--moni-glass-text));
          font-family: inherit;
          font-size: 15px;
          box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.82);
          transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }

        .moni-login-field input:focus {
          border-color: rgb(var(--moni-glass-blue) / 0.82);
          background: rgb(255 255 255 / 0.96);
          box-shadow: 0 0 0 3px rgb(var(--moni-glass-blue) / 0.10), inset 0 1px 0 rgb(255 255 255 / 0.9);
        }

        .moni-login-field input:disabled {
          cursor: not-allowed;
          opacity: 0.62;
        }

        .moni-login-error {
          margin: 14px 0 0;
          border: 1px solid rgb(var(--moni-danger) / 0.28);
          border-radius: 12px;
          background: rgb(var(--moni-danger) / 0.08);
          padding: 10px 12px;
          color: rgb(190 55 55);
          font-size: 13px;
          font-weight: 650;
          line-height: 1.45;
        }

        .moni-login-submit {
          width: 100%;
          min-height: 52px;
          margin-top: 24px;
          border: 0;
          border-radius: 14px;
          background: linear-gradient(135deg, rgb(var(--moni-glass-blue)), rgb(var(--moni-glass-blue-dark)));
          color: white;
          cursor: pointer;
          font-family: inherit;
          font-size: 15px;
          font-weight: 800;
          box-shadow: 0 12px 28px rgb(var(--moni-glass-blue) / 0.22);
          transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
        }

        .moni-login-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: saturate(1.05);
          box-shadow: 0 15px 32px rgb(var(--moni-glass-blue) / 0.26);
        }

        .moni-login-submit:active:not(:disabled) {
          transform: translateY(0);
        }

        .moni-login-submit:disabled {
          cursor: not-allowed;
          opacity: 0.56;
        }

        @keyframes moniLoginFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-5px) scale(1.018); }
        }

        @keyframes moniLoginBlink {
          0%, 34%, 42%, 100% { transform: scaleY(1); }
          38% { transform: scaleY(0.08); }
        }

        @keyframes moniLoginSmile {
          0%, 100% { transform: translateX(-50%) scaleX(0.92) scaleY(0.88); }
          50% { transform: translateX(-50%) scaleX(1.08) scaleY(1.08); }
        }

        @media (max-width: 520px) {
          .moni-login-root { padding: 16px; }
          .moni-login-card {
            border-radius: 26px;
            padding: 34px 22px 28px;
          }
          .moni-login-character {
            width: 76px;
            height: 76px;
            border-radius: 26px;
          }
          .moni-login-eye { top: 26px; }
          .moni-login-eye-left { left: 20px; }
          .moni-login-eye-right { right: 20px; }
          .moni-login-mouth { bottom: 17px; }
          .moni-login-ear { top: 35px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .moni-login-character,
          .moni-login-eye,
          .moni-login-mouth {
            animation: none !important;
          }
          .moni-login-submit {
            transition: none;
          }
        }
      `}</style>
    </main>
  )
}
