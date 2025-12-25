<script lang="ts" setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

type DropdownCommand = 'logout'

const router = useRouter()
const userStore = useUserStore()

const avatarUrl = computed(() => {
	const v = userStore.avatar
	if (v === null) return ''
	const trimmed = v.trim()
	return trimmed
})

const username = computed(() => userStore.username ?? '')
const nickname = computed(() => userStore.nickname ?? '')

const fallbackChar = computed(() => {
	const u = username.value.trim()
	return u ? u.slice(0, 1).toUpperCase() : '?'
})

async function handleCommand(command: DropdownCommand): Promise<void> {
	if (command === 'logout') {
		userStore.logout()
		await router.replace('/login')
	}
}
</script>

<template>
	<el-dropdown trigger="click" placement="bottom-end" @command="handleCommand">
		<el-avatar
			class="user-avatar"
			:size="40"
			:src="avatarUrl || undefined"
		>
			{{ fallbackChar }}
		</el-avatar>

		<template #dropdown>
			<el-dropdown-menu class="user-dropdown">
				<el-dropdown-item class="user-row" disabled>
					<div class="user-row__inner">
						<el-avatar :size="40" :src="avatarUrl || undefined">
							{{ fallbackChar }}
						</el-avatar>
						<div class="user-row__text">
							<div class="user-row__nickname">{{ nickname || username }}</div>
							<div class="user-row__username">@{{ username }}</div>
						</div>
					</div>
				</el-dropdown-item>
				<el-dropdown-item divided command="logout" class="logout-item">
					<el-icon class="logout-item__icon"><IEpSwitchButton /></el-icon>
					<span>退出登录</span>
				</el-dropdown-item>
			</el-dropdown-menu>
		</template>
	</el-dropdown>
</template>

<style lang="scss" scoped>
.user-avatar {
	cursor: pointer;
	transition:
		transform 180ms ease,
		box-shadow 180ms ease;
	will-change: transform, box-shadow;
	transform-origin: center;
	border-radius: 9999px;
}

.user-avatar:hover {
	transform: scale(1.12) rotate(18deg);
	box-shadow:
		0 0 0 2px var(--el-color-primary-light-5),
		0 0 14px var(--el-color-primary);
}

@media (prefers-reduced-motion: reduce) {
	.user-avatar {
		transition: none;
	}
	.user-avatar:hover {
		transform: none;
	}
}

.user-dropdown {
	min-width: 180px;
}

.user-row {
	cursor: default;
}

.user-row__inner {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 4px 0;
}

.user-row__text {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.user-row__nickname {
	font-weight: 600;
	color: var(--el-text-color-primary);
	line-height: 18px;
	max-width: 150px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.user-row__username {
	font-size: 12px;
	color: var(--el-text-color-secondary);
	line-height: 16px;
	max-width: 150px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.logout-item {
	display: inline-flex;
	align-items: center;
	gap: 12px;
}

.logout-item__icon {
	color: var(--el-color-danger);
}
</style>
