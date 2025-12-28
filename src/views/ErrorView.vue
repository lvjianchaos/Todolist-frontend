<script lang="ts" setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const router = useRouter()
const route = useRoute()

const title = computed(() => {
  const code = typeof route.query.code === 'string' ? route.query.code : '404'
  return code === '404' ? '页面未找到' : '出错了'
})

const codeText = computed(() => {
  const code = typeof route.query.code === 'string' ? route.query.code : '404'
  return code
})

const description = computed(() => {
  const fromQuery = typeof route.query.message === 'string' ? route.query.message : ''
  if (fromQuery) return fromQuery
  return '你要访问的页面可能已被移动、删除，或路径输入有误。'
})

async function goHome(): Promise<void> {
  await router.push('/')
}

function goBack(): void {
  if (window.history.length > 1) {
    router.back()
    return
  }
  void goHome()
}
</script>

<template>
  <div class="error-page">
    <div class="error-bg" aria-hidden="true"></div>

    <el-card class="error-card">
      <div class="error-code">{{ codeText }}</div>
      <div class="error-title">{{ title }}</div>
      <div class="error-desc">{{ description }}</div>

      <div class="error-actions">
        <el-button type="primary" @click="goHome">返回首页</el-button>
        <el-button @click="goBack">返回上一页</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.error-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  position: relative;
  overflow: hidden;
}

.error-bg {
  position: absolute;
  inset: -40px;
  background:
    radial-gradient(
      420px 260px at 20% 30%,
      color-mix(in srgb, var(--el-color-primary) 22%, transparent),
      transparent 60%
    ),
    radial-gradient(
      520px 320px at 80% 70%,
      color-mix(in srgb, var(--el-color-primary) 16%, transparent),
      transparent 62%
    ),
    radial-gradient(
      520px 420px at 50% 120%,
      color-mix(in srgb, var(--el-color-primary) 10%, transparent),
      transparent 60%
    );
  filter: blur(2px);
  opacity: 0.9;
}

.error-card {
  width: min(520px, calc(100vw - 32px));
  position: relative;
  background: color-mix(in srgb, var(--el-bg-color) 80%, transparent);
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 22%, var(--el-border-color));
  backdrop-filter: blur(10px);
}

.error-code {
  font-size: 64px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 2px;
  color: var(--el-text-color-primary);
  text-shadow:
    0 0 10px color-mix(in srgb, var(--el-color-primary) 35%, transparent),
    0 0 26px color-mix(in srgb, var(--el-color-primary) 22%, transparent);
}

.error-title {
  margin-top: 12px;
  font-size: 18px;
  font-weight: 600;
}

.error-desc {
  margin-top: 10px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.error-actions {
  margin-top: 18px;
  display: flex;
  gap: 10px;
}
</style>
