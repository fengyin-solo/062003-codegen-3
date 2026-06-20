<template>
  <div class="tour-panel card">
    <h3>🎤 巡演管理</h3>
    <div v-if="groups.length === 0" class="empty">暂无出道组合</div>

    <div v-for="group in groups" :key="group.id" class="tour-group">
      <div class="group-head">
        <strong>{{ group.name }}</strong>
        <span class="rep-badge" :class="repClass(group.id)">
          口碑 {{ getReputation(group.id) }}
        </span>
      </div>

      <div v-if="isOnTour(group.id)" class="tour-status">
        <div class="tour-progress">
          <span>巡演进行中 ({{ activeTour(group.id).currentDay }}/{{ activeTour(group.id).totalDays }}天)</span>
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: tourProgress(group.id) + '%' }"
            ></div>
          </div>
        </div>
        <div class="tour-route">
          <span
            v-for="(city, ci) in activeTour(group.id).cities"
            :key="ci"
            class="city-dot"
            :class="{ done: isCityDone(group.id, ci), current: isCityCurrent(group.id, ci) }"
          >
            {{ city.icon }} {{ city.name }}
          </span>
        </div>
        <div class="tour-revenue">已获收入 ¥{{ activeTour(group.id).revenue.toLocaleString() }}</div>
      </div>

      <div v-else class="tour-idle">
        <button
          class="btn primary sm"
          :disabled="!canStartTour(group.id)"
          @click="$emit('schedule', group.id)"
        >
          安排巡演
        </button>
        <span v-if="cooldownLeft(group.id) > 0" class="cooldown">
          冷却中 ({{ cooldownLeft(group.id) }}天)
        </span>
      </div>
    </div>

    <div v-if="completedTours.length > 0" class="tour-history">
      <h4>巡演记录</h4>
      <div v-for="tour in completedTours" :key="tour.id" class="history-item">
        <span>{{ groupName(tour.groupId) }}</span>
        <span>{{ tour.cities.map(c => c.name).join('→') }}</span>
        <span>收入 ¥{{ tour.revenue.toLocaleString() }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { GAME_CONFIG } from '../config/gameConfig'

const props = defineProps({
  groups: Array,
  trainees: Array,
  money: Number,
  tours: { type: Array, default: () => [] },
  groupReputation: { type: Object, default: () => ({}) },
  lastTourDay: { type: Object, default: () => ({}) },
  day: Number,
})

defineEmits(['schedule'])

function getReputation(groupId) {
  return props.groupReputation[groupId] ?? 50
}

function repClass(groupId) {
  const r = getReputation(groupId)
  if (r >= 75) return 'high'
  if (r >= 40) return 'mid'
  return 'low'
}

function isOnTour(groupId) {
  return props.tours.some(t => t.groupId === groupId && t.status === 'ongoing')
}

function activeTour(groupId) {
  return props.tours.find(t => t.groupId === groupId && t.status === 'ongoing')
}

function tourProgress(groupId) {
  const t = activeTour(groupId)
  if (!t) return 0
  return Math.round((t.currentDay / t.totalDays) * 100)
}

function isCityDone(groupId, cityIndex) {
  const t = activeTour(groupId)
  if (!t) return false
  const currentCityIndex = Math.floor((t.currentDay - 1) / GAME_CONFIG.tour.daysPerCity)
  return cityIndex < currentCityIndex
}

function isCityCurrent(groupId, cityIndex) {
  const t = activeTour(groupId)
  if (!t) return false
  const currentCityIndex = Math.floor((t.currentDay - 1) / GAME_CONFIG.tour.daysPerCity)
  return cityIndex === currentCityIndex
}

function canStartTour(groupId) {
  if (isOnTour(groupId)) return false
  if (cooldownLeft(groupId) > 0) return false
  const group = props.groups.find(g => g.id === groupId)
  if (!group) return false
  const members = props.trainees.filter(t => group.memberIds.includes(t.id))
  const avgFatigue = members.reduce((s, m) => s + m.fatigue, 0) / members.length
  if (avgFatigue >= GAME_CONFIG.tour.fatiguePerformanceThreshold) return false
  const cost = GAME_CONFIG.tour.baseLogisticsCost + GAME_CONFIG.tour.minCities * GAME_CONFIG.tour.perCityExtraCost
  return props.money >= cost
}

function cooldownLeft(groupId) {
  const last = props.lastTourDay[groupId] || 0
  return Math.max(0, GAME_CONFIG.tour.cooldownDays - (props.day - last))
}

function groupName(groupId) {
  return props.groups.find(g => g.id === groupId)?.name || '未知'
}

const completedTours = computed(() =>
  props.tours.filter(t => t.status === 'completed').slice(-3)
)
</script>

<style scoped>
.tour-panel h3 { margin-bottom: 0.75rem; }
.tour-panel h4 { margin: 0.75rem 0 0.5rem; font-size: 0.85rem; color: var(--text-muted); }

.empty { color: var(--text-muted); font-size: 0.9rem; }

.tour-group {
  padding: 0.75rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  margin-bottom: 0.75rem;
}

.group-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.rep-badge {
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
  font-weight: 600;
}
.rep-badge.high { background: var(--success-soft); color: var(--success); }
.rep-badge.mid { background: var(--accent-soft); color: var(--accent); }
.rep-badge.low { background: var(--danger-soft); color: var(--danger); }

.tour-progress {
  margin-bottom: 0.5rem;
}
.tour-progress span {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.progress-bar {
  height: 6px;
  background: var(--bg-primary);
  border-radius: 3px;
  margin-top: 0.25rem;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
  transition: width 0.3s;
}

.tour-route {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.5rem;
}

.city-dot {
  font-size: 0.75rem;
  padding: 0.1rem 0.4rem;
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-muted);
}
.city-dot.done { background: var(--success-soft); color: var(--success); }
.city-dot.current { background: var(--accent-soft); color: var(--accent); font-weight: 600; }

.tour-revenue {
  font-size: 0.8rem;
  color: var(--success);
}

.tour-idle {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.cooldown {
  font-size: 0.8rem;
  color: var(--warning);
}

.tour-history {
  border-top: 1px solid var(--border);
  padding-top: 0.5rem;
}

.history-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--text-muted);
  padding: 0.25rem 0;
}
</style>
