import axios, { type AxiosError, type AxiosRequestHeaders } from "axios";
import { ElMessage } from "element-plus";
import router from "@/router";
import { useTokenStore } from "@/stores/token";
import { useUserStore } from "@/stores/user";

let isHandlingUnauthorized = false;

function handleUnauthorized(): void {
  if (isHandlingUnauthorized) return;
  isHandlingUnauthorized = true;

  ElMessage.error("登录已过期，请重新登录");

  const userStore = useUserStore();
  userStore.logout();

  const currentPath = router.currentRoute.value.fullPath;
  const isAuthPage =
    router.currentRoute.value.path === "/login" ||
    router.currentRoute.value.path === "/register";

  const query = isAuthPage ? undefined : { redirect: currentPath };

  router
    .replace({ path: "/login", query })
    .catch(() => {
      // ignore duplicated navigation errors
    })
    .finally(() => {
      // allow subsequent 401 handling after a short delay to avoid message spam
      setTimeout(() => {
        isHandlingUnauthorized = false;
      }, 300);
    });
}

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 5000,
})

// 请求拦截器
request.interceptors.request.use((config) => {
  if (!config.headers) {
    config.headers = {} as AxiosRequestHeaders
  }

  const store = useTokenStore()
  if (store.token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${store.token}`
  }

  return config
}, (error) => {
  return Promise.reject(error)
})

// 响应拦截器
request.interceptors.response.use((response) => {
  return response
}, (error) => {
  const axiosError = error as AxiosError | undefined
  const status = axiosError?.response?.status

  if (status === 401) {
    handleUnauthorized()
  }

  return Promise.reject(error)
})

export default request
