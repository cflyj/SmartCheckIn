import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const routes = [
  { path: '/', redirect: '/home' },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { guest: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/RegisterView.vue'),
    meta: { guest: true },
  },
  {
    path: '/home',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/participant/sessions',
    name: 'participant-sessions',
    component: () => import('../views/participant/SessionListView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/participant/sessions/:id',
    name: 'participant-session',
    component: () => import('../views/participant/SessionDetailView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/orgs/join',
    name: 'org-join',
    component: () => import('../views/orgs/OrgJoinView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/orgs/new',
    name: 'org-new',
    component: () => import('../views/orgs/OrgCreateView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/orgs',
    name: 'orgs',
    component: () => import('../views/orgs/OrgListView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/orgs/:id',
    name: 'org-detail',
    component: () => import('../views/orgs/OrgDetailView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/organizer',
    name: 'organizer',
    component: () => import('../views/organizer/OrganizerDashboard.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/organizer/sessions/new',
    name: 'organizer-session-new',
    component: () => import('../views/organizer/SessionFormView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/organizer/sessions/:id/edit',
    name: 'organizer-session-edit',
    component: () => import('../views/organizer/SessionFormView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/organizer/sessions/:id/qr',
    name: 'organizer-qr',
    component: () => import('../views/organizer/QrDisplayView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/organizer/sessions/:id/stats',
    name: 'organizer-stats',
    component: () => import('../views/organizer/StatsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/organizer/sessions/:id/records',
    name: 'organizer-records',
    component: () => import('../views/organizer/RecordsView.vue'),
    meta: { requiresAuth: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guest && auth.isLoggedIn) {
    return { name: 'home' }
  }
  return true
})

export default router
