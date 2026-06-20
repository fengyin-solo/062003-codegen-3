<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content tour-modal">
      <h2>🎤 安排巡演 — {{ groupName }}</h2>

      <div class="section">
        <h4>选择城市（{{ selectedCities.length }}/{{ maxCities }}，最少 {{ minCities }} 个）</h4>
        <div class="city-grid">
          <button
            v-for="city in cities"
            :key="city.name"
            class="city-btn"
            :class="{
              selected: isSelected(city.name),
              disabled: !isSelected(city.name) && selectedCities.length >= maxCities
            }"
            @click="toggleCity(city.name)"
          >
            <span class="city-icon">{{ city.icon }}</span>
            <span class="city-name">{{ city.name }}</span>
            <span class="city-tier" :class="'tier-' + city.tier">
              {{ tierLabel(city.tier) }}
            </span>
          </button>
        </div>
      </div>

      <div v-if="selectedCities.length > 0" class="preview">
        <h4>巡演预览</h4>
        <div class="route">
          {{ selectedCities.join(' → ') }}
        </div>
        <div class="preview-grid">
          <div class="preview-item">
            <span class="label">总天数</span>
            <span class="value">{{ totalDays }} 天</span>
          </div>
          <div class="preview-item">
            <span class="label">后勤费用</span>
            <span class="value expense">¥{{ logisticsCost.toLocaleString() }}</span>
          </div>
          <div class="preview-item">
            <span class="label">预估单城收入</span>
            <span class="value">{{ estimatedRevenueRange }}</span>
          </div>
          <div class="preview-item">
            <span class="label">成员体力消耗</span>
            <span class="value warn">每站 +8~14</span>
          </div>
          <div class="preview-item">
            <span class="label">成员压力消耗</span>
            <span class="value warn">每站 +3~8</span>
          </div>
          <div class="preview-item">
            <span class="label">当前口碑</span>
            <span class="value">{{ reputation }}</span>
          </div>
        </div>

        <div class="tradeoff-hint">
          ⚖️ 体力 vs 口碑取舍：更多城市 = 更多收入，但体力下降影响演出品质，品质差则口碑受损、收入缩水。
        </div>
      </div>

      <div class="actions">
        <button class="btn ghost" @click="$emit('close')">取消</button>
        <button
          class="btn primary"
          :disabled="!canConfirm"
          @click="confirm"
        >
          确认出发 (¥{{ logisticsCost.toLocaleString() }})
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { GAME_CONFIG } from '../config/gameConfig'

const props = defineProps({
  groupId: String,
  groups: Array,
  trainees: Array,
  money: Number,
  groupReputation: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['close', 'confirm'])

const cities = GAME_CONFIG.tour.cities
const minCities = GAME_CONFIG.tour.minCities
const maxCities = GAME_CONFIG.tour.maxCities

const selectedCities = ref([])

const groupName = computed(() => {
  return props.groups.find(g => g.id === props.groupId)?.name || '组合'
})

const reputation = computed(() => {
  return props.groupReputation[props.groupId] ?? 50
})

const totalDays = computed(() => selectedCities.value.length * GAME_CONFIG.tour.daysPerCity)

const logisticsCost = computed(() =>
  GAME_CONFIG.tour.baseLogisticsCost + selectedCities.value.length * GAME_CONFIG.tour.perCityExtraCost
)

const estimatedRevenueRange = computed(() => {
  if (selectedCities.value.length === 0) return '—'
  const selected = cities.filter(c => selectedCities.value.includes(c.name))
  const minRev = selected.reduce((s, c) => s + Math.round(c.baseRevenue * 0.5), 0)
  const maxRev = selected.reduce((s, c) => s + Math.round(c.baseRevenue * 1.3), 0)
  return `¥${minRev.toLocaleString()} ~ ¥${maxRev.toLocaleString()}`
})

const canConfirm = computed(() =>
  selectedCities.value.length >= minCities &&
  selectedCities.value.length <= maxCities &&
  props.money >= logisticsCost.value
)

function isSelected(name) {
  return selectedCities.value.includes(name)
}

function toggleCity(name) {
  const idx = selectedCities.value.indexOf(name)
  if (idx >= 0) {
    selectedCities.value = selectedCities.value.filter(n => n !== name)
  } else if (selectedCities.value.length < maxCities) {
    selectedCities.value = [...selectedCities.value, name]
  }
}

function tierLabel(tier) {
  return tier === 3 ? '一线' : tier === 2 ? '二线' : '三线'
}

function confirm() {
  if (!canConfirm.value) return
  emit('confirm', props.groupId, [...selectedCities.value])
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.tour-modal {
  width: 520px;
  max-width: 92vw;
  max-height: 85vh;
  overflow-y: auto;
}

.tour-modal h2 {
  margin-bottom: 1rem;
}

.section h4,
.preview h4 {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.city-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 0.5rem;
}

.city-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.6rem 0.4rem;
  border: 2px solid var(--border);
  border-radius: 10px;
  background: var(--bg-secondary);
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.city-btn:hover:not(.disabled) { border-color: var(--accent); }
.city-btn.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.city-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.city-icon { font-size: 1.4rem; }
.city-name { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); }

.city-tier {
  font-size: 0.65rem;
  padding: 0.05rem 0.4rem;
  border-radius: 6px;
}
.tier-3 { background: var(--accent-soft); color: var(--accent); }
.tier-2 { background: var(--success-soft); color: var(--success); }
.tier-1 { background: var(--bg-primary); color: var(--text-muted); }

.preview {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}

.route {
  font-size: 0.9rem;
  color: var(--accent);
  margin-bottom: 0.75rem;
  font-weight: 600;
}

.preview-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem 1.5rem;
}

.preview-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
}
.preview-item .label { color: var(--text-muted); }
.preview-item .value { font-weight: 600; }
.preview-item .value.expense { color: var(--danger); }
.preview-item .value.warn { color: var(--warning); }

.tradeoff-hint {
  margin-top: 0.75rem;
  padding: 0.6rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  font-size: 0.78rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 1.25rem;
}
</style>
