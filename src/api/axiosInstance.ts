import axios from "axios";


// Use Vite's import.meta.env in the browser. Fall back to process.env if available (node).
const devBase = (import.meta.env.VITE_API_DEVELOPMENT as string) || (typeof process !== 'undefined' ? process.env.REACT_APP_API_DEVELOPMENT : undefined) || '';
const prodBase = (import.meta.env.VITE_API_PRODUCTION as string) || (typeof process !== 'undefined' ? process.env.REACT_APP_API_PRODUCTION : undefined) || '';
const baseURL = (import.meta.env.MODE === 'production') ? prodBase : devBase;

const axiosInstance = axios.create({
  baseURL,
  timeout: 60000, // Increase timeout to 60 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosInstance.interceptors.request.use((config) => {
  // Support both legacy 'token' key and new 'auth.token' key
  const token = localStorage.getItem('token') || localStorage.getItem('auth.token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default axiosInstance;