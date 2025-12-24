<script lang="ts" setup>
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'

import { register } from '@/api/auth/authApi'
import type { RegisterRequestDto } from '@/api/auth/types'

const router = useRouter()

const formRef = ref<FormInstance>()
const isSubmitting = ref(false)
const formModel = reactive<RegisterRequestDto>({
  username: '',
  password: '',
  nickname: '',
})

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
}

async function handleSubmit(): Promise<void> {
  if (!formRef.value) return
  const isValid = await formRef.value.validate().catch(() => false)
  if (!isValid) return

  isSubmitting.value = true
  try {
    await register({
      username: formModel.username,
      password: formModel.password,
      nickname: formModel.nickname,
    })

    ElMessage.success('注册成功，请登录!')
    await router.push('/login')
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : '注册失败'
    ElMessage.error(message)
  } finally {
    isSubmitting.value = false
  }
}

async function handleToLogin(): Promise<void> {
  await router.push('/login')
}
</script>

<template>
  <div class="register-page">
    <el-card class="register-card">
      <template #header>
        <div class="register-title">注册</div>
      </template>

      <el-form ref="formRef" :model="formModel" :rules="rules" label-width="80px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="formModel.username" />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            v-model="formModel.password"
            type="password"
            show-password
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="formModel.nickname" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="isSubmitting" @click="handleSubmit">注册</el-button>
        </el-form-item>

        <div class="login-link">
          <span>已有账户，前去</span>
          <el-link type="primary" :underline="false" @click="handleToLogin">登录</el-link>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<style lang="scss" scoped>
.register-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 16px;
}

.register-card {
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

.register-title {
  font-size: 24px;
  font-weight: 600;
}

.login-link {
  font-size: 12px;
  display: flex;
  justify-content: flex-end;
  // 行内高度一致
  align-items: center;
}
</style>
