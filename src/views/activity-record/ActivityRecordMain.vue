<script lang="ts" setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getActivityLogs } from '@/api/activity/activityApi'
import UserAvatar from '@/components/UserAvatar.vue'

type RecordItem = {
  id: number
  entityType: number
  action: number
  listId?: number | null
  listName?: string | null
  listGroupId?: number | null
  lgName?: string | null
  tgId?: number | null
  tgName?: string | null
  taskId?: number | null
  taskName?: string | null
  summary?: string | null
  extraData?: string | null
  createdAt: string
}

const router = useRouter()
const page = ref(1)
const size = ref(20)
const loading = ref(false)
const finished = ref(false)
const records = ref<RecordItem[]>([])
const pages = ref(1)

async function loadPage() {
  if (loading.value || finished.value) return
  loading.value = true
  try {
    const data = await getActivityLogs({ page: page.value, size: size.value })
    const list: RecordItem[] = data?.records ?? []
    if (page.value === 1) records.value = []
    records.value.push(...list)
    pages.value = data?.pages ?? page.value
    if (page.value >= pages.value || list.length === 0) finished.value = true
    else page.value += 1
  } catch {
    // ignore for now
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadPage()

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadPage()
        }
      })
    },
    { root: null, rootMargin: '200px' }
  )

  // observe sentinel after next tick
  const sentinel = document.querySelector('#activity-sentinel')
  if (sentinel) observer.observe(sentinel)
})

const grouped = computed(() => {
  const map = new Map<string, RecordItem[]>()
  records.value.forEach((r) => {
    const d = new Date(r.createdAt)
    const key = d.toLocaleDateString()
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  })

  return Array.from(map.entries())
    .sort((a, b) => {
      const da = new Date(a[0])
      const db = new Date(b[0])
      return db.getTime() - da.getTime()
    })
    .map(([date, items]) => ({ date, items: items.sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()) }))
})

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function goToList(listId?: number | null) {
  if (!listId) return
  router.push(`/task-list/${listId}`)
}

function getActionLabel(action?: number) {
  switch (action) {
    case 0:
      return '创建'
    case 1:
      return '删除'
    case 2:
      return '完成'
    case 3:
      return '重命名'
    default:
      return ''
  }
}

function getEntityLabel(entityType?: number) {
  switch (entityType) {
    case 0:
      return '清单分组'
    case 1:
      return '清单'
    case 2:
      return '任务组'
    case 3:
      return '任务'
    default:
      return ''
  }
}

function tryParseExtra(extra?: string | null) {
  if (!extra) return null
  try { return JSON.parse(extra) } catch { return null }
}
</script>

<template>
  <el-main class="activity-record-main">
    <el-scrollbar>
      <div class="groups">
        <template v-for="group in grouped" :key="group.date">
          <div class="group">
            <div class="group__date">{{ group.date }}</div>
            <div class="group__items">
              <div class="item" v-for="item in group.items" :key="item.id">
                <div class="item__time">{{ formatTime(item.createdAt) }}</div>
                <div class="item__body">
                  <div class="avatar"><UserAvatar /></div>
                  <div class="content">
                    <div class="summary">
                      <span class="summary-text">{{ item.summary }}</span>
                      <template v-if="item.listId && item.listName">
                        &nbsp;—&nbsp;<a href="#" @click.prevent="goToList(item.listId)" class="entity-name">{{ item.listName }}</a>
                      </template>
                      <template v-else-if="item.taskId && item.taskName">
                        &nbsp;—&nbsp;<span class="entity-name">{{ item.taskName }}</span>
                      </template>
                      <template v-else>
                        <!-- fallback shows original summary -->
                      </template>
                      <template v-if="item.action === 3 && tryParseExtra(item.extraData)">
                        <div class="rename-detail">重命名：{{ tryParseExtra(item.extraData)?.oldName }} → {{ tryParseExtra(item.extraData)?.newName }}</div>
                      </template>
                    </div>
                    <div class="meta">
                      <span class="badge action">{{ getActionLabel(item.action) }}</span>
                      <span class="badge entity">{{ getEntityLabel(item.entityType) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div id="activity-sentinel" class="sentinel">
        <div v-if="loading">加载中...</div>
        <div v-else-if="finished">没有更多了</div>
        <div v-else>上滑以加载更多</div>
      </div>
    </el-scrollbar>
  </el-main>
</template>

<style lang="scss" scoped>
.activity-record-main {
  padding: 12px 16px;
  overflow: auto;
  flex: 1 1 auto;

  .group {
    margin-bottom: 18px;

    &__date {
      font-weight: 800;
      color: var(--el-text-color-regular);
      margin: 10px 0 6px;
      font-size: 18px;
      font-weight: 800;
      font-family:'Courier New', Courier, monospace;
      // 文本发光呼吸
      text-shadow: 0 0 12px var(--el-color-primary);
      animation: glow 2s infinite alternate;
    }

    .item {
      display: flex;
      gap: 12px;
      padding: 10px 8px;
      align-items: flex-start;
      border-radius: 6px;
      transition: background-color .12s;

      &:hover {
        background: color-mix(in srgb, var(--el-color-primary) 4%, transparent);
      }

      &__time {
        width: 72px;
        color: var(--el-text-color-secondary);
        font-size: 13px;
        flex: 0 0 72px;
      }

      &__body {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        flex: 1 1 auto;

        .avatar {
          width: 36px;
          height: 36px;
          padding-right: 1em;
        }

        .content {
          display: flex;
          flex-direction: column;

          .badge {
            display: inline-block;
            margin-right: 6px;
            padding: 2px 6px;
            border-radius: 12px;
            font-size: 12px;
            color: var(--el-text-color-primary);
            background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
          }

          .badge.entity {
            background: color-mix(in srgb, var(--el-color-success) 8%, transparent);
          }

          .summary {
            color: var(--el-text-color-regular);

            .summary-text {
              font-size: 15px;
              font-weight: 600;
              font-family: 'Courier New', Courier, monospace;
              margin-right: 6px;
            }

            a, .entity-name {
              color: var(--el-color-primary);
              text-decoration: none;
              font-weight: 600;
              font-size: 15px;
              font-family: 'Courier New', Courier, monospace;
              cursor: pointer;
              // 鼠标悬浮
              &:hover {
                text-decoration: underline;
                // 发光
                text-shadow: 0 0 6px var(--el-color-primary);
                // 轻微放大
                transform: scale(1.2);
                // 动画过渡
                transition: all 0.2s ease-in-out;
              }
            }

            .rename-detail {
              margin-top: 6px;
              color: var(--el-text-color-secondary);
              font-size: 12px;
            }
          }

          .meta {
            margin-top: 6px;
            color: var(--el-text-color-secondary);
            font-size: 12px;
            display: flex;
            gap: 8px;
            align-items: center;
            justify-content: left;
          }
        }
      }
    }
  }

  .sentinel {
    text-align: center;
    padding: 14px 0;
    color: var(--el-text-color-secondary);
  }
}
</style>
