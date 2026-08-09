import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 300000,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('bjj_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 표준 응답 형식 `{success, data}` 자동 언래핑 (기존 API는 데이터 그대로 반환하므로 양쪽 호환)
client.interceptors.response.use(
  (res) => {
    if (res.data && typeof res.data === 'object' && 'success' in res.data) {
      if (res.data.success === false) {
        return Promise.reject(new Error(res.data.message || '요청 실패'));
      }
      return { ...res, data: res.data.data ?? res.data };
    }
    return res;
  },
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('bjj_token');
      window.location.href = '/login';
    }
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    return Promise.reject(new Error(msg));
  }
);

export default client;
