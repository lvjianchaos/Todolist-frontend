<script lang="ts" setup>
import HomeHeader from '@/views/home/HomeHeader.vue';
import HomeMain from '@/views/home/HomeMain.vue';
</script>

<template>
  <el-container class="common-layout">
    <HomeHeader />
    <HomeMain />
  </el-container>
</template>

<style lang="scss" scoped>
.common-layout {
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
}
</style>
