export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch {
    throw new Error('서버에 연결할 수 없습니다. 백엔드 서버 실행 상태를 확인해 주세요.');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));

    if (response.status === 401) {
      throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
    }

    const message = body.message || '요청 처리 중 오류가 발생했습니다.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
