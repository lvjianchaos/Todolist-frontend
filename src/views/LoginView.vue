<script lang="ts" setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { login } from '@/api/auth/authApi'
import type { LoginRequestDto } from '@/api/auth/types'
import { useTokenStore } from '@/stores/token'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const route = useRoute()
const tokenStore = useTokenStore()
const userStore = useUserStore()

const formRef = ref<FormInstance>()
const isSubmitting = ref(false)
const formModel = reactive<LoginRequestDto>({
  username: '',
  password: '',
})

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function handleSubmit(): Promise<void> {
  if (!formRef.value) return
  const isValid = await formRef.value.validate().catch(() => false)
  if (!isValid) return

  isSubmitting.value = true
  try {
    const response = await login({
      username: formModel.username,
      password: formModel.password,
    })

    tokenStore.setToken(response.token)
    userStore.setUser({
      userId: response.userId,
      username: response.username,
      nickname: response.nickname,
      avatar: response.avatar,
    })

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.push(redirect)
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '登录失败')
  } finally {
    isSubmitting.value = false
  }
}

async function handleToRegister(): Promise<void> {
  await router.push('/register')
}
</script>

<template>
  <div class="login-page">
    <el-card class="login-card">
      <template #header>
        <div class="login-title">登录</div>
      </template>

      <el-form ref="formRef" :model="formModel" :rules="rules" label-width="80px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="formModel.username"/>
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            v-model="formModel.password"
            type="password"
            show-password
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <el-form-item >
          <el-button type="primary" :loading="isSubmitting" @click="handleSubmit">登录</el-button>
        </el-form-item>

        <div class="register-link">
          <span>没有账户，前去</span>
          <el-link type="primary" :underline="false" @click="handleToRegister">注册</el-link>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<style lang="scss" scoped>
.login-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 16px;
}

.login-card {
  width: 420px;
  max-width: 100%;
  /* 确保表单内边距一致，不挤压输入框 */
  :deep(.el-card__body) {
    padding: 24px;
  }
  .el-form-item {
    width: 90%;
    .el-button {
      width: 100%;
    }
  }
}

.login-title {
  font-size: 24px;
  font-weight: 600;
}

.register-link {
  font-size: 12px;
  display: flex;
  justify-content: flex-end;
  // 行内高度一致
  align-items: center;
}
</style>
