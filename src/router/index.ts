import { createRouter, createWebHistory } from 'vue-router'
import IndexLayout from '@/layouts/IndexLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue')
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue')
    },
    {
      path: '/',
      component: IndexLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('@/views/home/HomeLayout.vue')
        },
        {
          path: 'all-task',
          component: () => import('@/views/all-task/AllTaskLayout.vue')
        },
        {
          path: 'activity-record',
          component: () => import('@/views/activity-record/ActivityRecordLayout.vue')
        },
        {
          path: 'task-list/:id',
          component: () => import('@/views/task-list/TaskListLayout.vue')
        }
      ]
    },
  ],
})

router.beforeEach((to) => {
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth === true)
  if (!requiresAuth) return true

  const token = localStorage.getItem('token')
  if (token) return true

  return {
    path: '/login',
    query: { redirect: to.fullPath },
  }
})

export default router
