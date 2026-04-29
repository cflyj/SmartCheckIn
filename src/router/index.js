import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const BRAND = '智能签到'

const routes = [
  { path: '/', redirect: '/home' },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { guest: true, title: '登录' },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/RegisterView.vue'),
    meta: { guest: true, title: '注册' },
  },
  {
    path: '/home',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: { requiresAuth: true, title: '首页' },
  },
  {
    path: '/participant/sessions',
    name: 'participant-sessions',
    component: () => import('../views/participant/SessionListView.vue'),
    meta: { requiresAuth: true, title: '活动' },
  },
  {
    path: '/participant/sessions/:id',
    name: 'participant-session',
    component: () => import('../views/participant/SessionDetailView.vue'),
    meta: { requiresAuth: true, title: '活动详情' },
  },
  {
    path: '/participant/face-enroll',
    name: 'participant-face-enroll',
    component: () => import('../views/participant/FaceEnrollmentView.vue'),
    meta: { requiresAuth: true, title: '人脸录入' },
  },
  {
    path: '/admin',
    name: 'admin-console',
    component: () => import('../views/admin/AdminConsoleView.vue'),
    meta: { requiresAuth: true, requiresSuperAdmin: true, title: '平台治理' },
  },
  {
    path: '/orgs/join',
    name: 'org-join',
    component: () => import('../views/orgs/OrgJoinView.vue'),
    meta: { requiresAuth: true, title: '加入组织' },
  },
  {
    path: '/orgs/new',
    name: 'org-new',
    component: () => import('../views/orgs/OrgCreateView.vue'),
    meta: { requiresAuth: true, title: '新建组织' },
  },
  {
    path: '/orgs',
    name: 'orgs',
    component: () => import('../views/orgs/OrgListView.vue'),
    meta: { requiresAuth: true, title: '组织' },
  },
  {
    path: '/orgs/:id',
    name: 'org-detail',
    component: () => import('../views/orgs/OrgDetailView.vue'),
    meta: { requiresAuth: true, title: '组织详情' },
  },
  {
    path: '/organizer',
    name: 'organizer',
    component: () => import('../views/organizer/OrganizerDashboard.vue'),
    meta: { requiresAuth: true, title: '我发起的活动' },
  },
  {
    path: '/organizer/sessions/new',
    name: 'organizer-session-new',
    component: () => import('../views/organizer/SessionFormView.vue'),
    meta: { requiresAuth: true, title: '新建活动' },
  },
  {
    path: '/organizer/sessions/:id/edit',
    name: 'organizer-session-edit',
    component: () => import('../views/organizer/SessionFormView.vue'),
    meta: { requiresAuth: true, title: '编辑活动' },
  },
  {
    path: '/organizer/sessions/:id/qr',
    name: 'organizer-qr',
    component: () => import('../views/organizer/QrDisplayView.vue'),
    meta: { requiresAuth: true, title: '活动二维码' },
  },
  {
    path: '/organizer/sessions/:id/stats',
    name: 'organizer-stats',
    component: () => import('../views/organizer/StatsView.vue'),
    meta: { requiresAuth: true, title: '活动统计' },
  },
  {
    path: '/organizer/sessions/:id/records',
    name: 'organizer-records',
    component: () => import('../views/organizer/RecordsView.vue'),
    meta: { requiresAuth: true, title: '签到记录' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresSuperAdmin) {
    if (!auth.isLoggedIn) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    await auth.refreshProfile()
    if (!auth.user?.is_super_admin) {
      return { name: 'home' }
    }
  }
  if (to.meta.guest && auth.isLoggedIn) {
    return { name: 'home' }
  }
  return true
})

router.afterEach((to) => {
  const t = typeof to.meta?.title === 'string' ? to.meta.title.trim() : ''
  document.title = t ? `${t} · ${BRAND}` : BRAND
})

export default router
