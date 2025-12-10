<script setup lang="ts">
const handleClick = () => {
  ElMessage.error('fuck')
}
</script>

<template>
  <el-button type="primary" @click="handleClick">Yes</el-button>
  <el-icon>
    <IEpSetting />
  </el-icon>
</template>

<style scoped></style>
