import { GAME_CONFIG } from '../config/gameConfig'
import { randInt, randFloat, pickRandom, weightedPick, clamp, pairKey } from './random'

const CFG = GAME_CONFIG

export function createInitialGameState() {
  const names = [...CFG.names].sort(() => Math.random() - 0.5)
  const trainees = []
  for (let i = 0; i < CFG.initial.traineeCount; i++) {
    trainees.push(createTrainee(names[i], i))
  }
  return {
    day: 1,
    money: CFG.initial.money,
    fans: CFG.initial.fans,
    totalRevenue: 0,
    totalExpenses: 0,
    trainees,
    groups: [],
    relationships: initRelationships(trainees),
    schedule: {},
    logs: [{ day: 1, text: '事务所成立！五位练习生已就位，三年征途正式开始。' }],
    pendingEvent: null,
    pendingRating: false,
    gameStatus: 'playing',
    lastSingleDay: {},
    tours: [],
    groupReputation: {},
    lastTourDay: {},
  }
}

function createTrainee(name, index) {
  const stats = {}
  for (const key of CFG.stats) {
    stats[key] = randInt(CFG.initial.statMin, CFG.initial.statMax)
  }
  return {
    id: `t${index}_${Date.now()}`,
    name,
    stats,
    fatigue: CFG.initial.fatigue + randInt(-5, 5),
    stress: CFG.initial.stress + randInt(-3, 3),
    status: 'trainee',
    groupId: null,
    illnessDays: 0,
    poachResist: randInt(40, 70),
    fans: 0,
    singlesReleased: 0,
  }
}

function initRelationships(trainees) {
  const rel = {}
  for (let i = 0; i < trainees.length; i++) {
    for (let j = i + 1; j < trainees.length; j++) {
      rel[pairKey(trainees[i].id, trainees[j].id)] = randInt(
        CFG.relationships.initialRange[0],
        CFG.relationships.initialRange[1]
      )
    }
  }
  return rel
}

export function calcTraineeScore(trainee) {
  const w = CFG.rating.scoreWeights
  let score = 0
  for (const key of CFG.stats) {
    score += trainee.stats[key] * w[key]
  }
  const fatiguePenalty = trainee.fatigue > CFG.thresholds.fatigueExhausted ? 0.85 : 1
  const stressPenalty = trainee.stress > CFG.thresholds.stressHigh ? 0.9 : 1
  return Math.round(score * fatiguePenalty * stressPenalty)
}

export function getRelationship(relationships, idA, idB) {
  return relationships[pairKey(idA, idB)] ?? 0
}

export function setRelationship(relationships, idA, idB, value) {
  relationships[pairKey(idA, idB)] = clamp(
    value,
    CFG.relationships.min,
    CFG.relationships.max
  )
}

export function getActiveTrainees(state) {
  return state.trainees.filter((t) => t.status !== 'left')
}

export function getDebutedTrainees(state) {
  return state.trainees.filter((t) => t.status === 'debuted')
}

export function calcProfit(state) {
  return state.totalRevenue - state.totalExpenses
}

export function checkVictory(state) {
  const profit = calcProfit(state)
  const groups = state.groups.length
  const goalsMet =
    groups >= CFG.victory.targetGroups &&
    (!CFG.victory.requirePositiveProfit || profit > 0)

  if (goalsMet) return 'won'

  if (state.day > CFG.victory.totalDays) {
    if (groups < CFG.victory.targetGroups) return 'lost_groups'
    if (CFG.victory.requirePositiveProfit && profit <= 0) return 'lost_profit'
  }
  if (state.money < -20000) return 'lost_bankrupt'
  const active = getActiveTrainees(state)
  if (active.length === 0 && state.groups.length === 0) return 'lost_empty'
  return null
}

function applyRange(val, range, mult = 1) {
  if (!range || range.length < 2) return val
  return val + randInt(Math.round(range[0] * mult), Math.round(range[1] * mult))
}

function getTrainingMultiplier(trainee, partners, relationships) {
  let mult = 1
  if (trainee.fatigue >= CFG.thresholds.fatigueExhausted) mult *= 0.5
  if (trainee.stress >= CFG.thresholds.stressHigh) mult *= 0.8
  if (trainee.stress >= CFG.thresholds.stressBreakdown) mult *= 0

  let synergyCount = 0
  for (const p of partners) {
    const rel = getRelationship(relationships, trainee.id, p.id)
    if (rel >= CFG.relationships.synergyThreshold) synergyCount++
  }
  if (synergyCount > 0) {
    mult *= 1 + CFG.relationships.synergyBonus * Math.min(synergyCount, 2)
  }
  return mult
}

export function processDay(state) {
  let state_ = processTourDay(state)

  const logs = []
  let money = state_.money
  let fans = state_.fans
  let totalExpenses = state_.totalExpenses
  const relationships = { ...state_.relationships }
  const trainees = state_.trainees.map((t) => ({ ...t, stats: { ...t.stats } }))
  const schedule = state_.schedule

  const onTourIds = new Set()
  for (const tour of (state_.tours || [])) {
    if (tour.status !== 'ongoing') continue
    const group = state_.groups.find((g) => g.id === tour.groupId)
    if (group) {
      for (const mid of group.memberIds) onTourIds.add(mid)
    }
  }

  const activityGroups = {}
  for (const [traineeId, activity] of Object.entries(schedule)) {
    if (onTourIds.has(traineeId)) continue
    if (!activityGroups[activity]) activityGroups[activity] = []
    activityGroups[activity].push(traineeId)
  }

  for (const trainee of trainees) {
    if (trainee.status === 'left') continue
    if (onTourIds.has(trainee.id)) continue

    if (trainee.illnessDays > 0) {
      trainee.illnessDays--
      trainee.fatigue = clamp(trainee.fatigue - 5, 0, 100)
      logs.push({ day: state.day, text: `${trainee.name} 仍在休养中（剩余 ${trainee.illnessDays} 天）。` })
      continue
    }

    if (trainee.fatigue >= CFG.thresholds.fatigueCollapse) {
      trainee.fatigue = applyRange(trainee.fatigue, CFG.activities.rest.fatigue)
      trainee.stress = applyRange(trainee.stress, CFG.activities.rest.stress)
      logs.push({ day: state.day, text: `${trainee.name} 过度疲劳，被迫休息。` })
      continue
    }

    const activityKey = schedule[trainee.id]
    if (!activityKey) {
      logs.push({ day: state.day, text: `${trainee.name} 今日未安排日程。` })
      continue
    }

    const activity = CFG.activities[activityKey]
    if (!activity) continue

    money -= activity.moneyCost
    totalExpenses += activity.moneyCost

    const partners = (activityGroups[activityKey] || [])
      .filter((id) => id !== trainee.id)
      .map((id) => trainees.find((t) => t.id === id))
      .filter(Boolean)

    const mult = getTrainingMultiplier(trainee, partners, relationships)

    if (activity.requiresTraining && trainee.stress >= CFG.thresholds.stressBreakdown) {
      logs.push({ day: state.day, text: `${trainee.name} 压力过大，无法集中精力训练。` })
      trainee.stress = clamp(trainee.stress + randInt(2, 5), 0, 100)
      continue
    }

    for (const [stat, range] of Object.entries(activity.statGain || {})) {
      const gain = randInt(range[0], range[1])
      trainee.stats[stat] = clamp(
        trainee.stats[stat] + Math.round(gain * mult),
        0,
        CFG.thresholds.statCap
      )
    }

    trainee.fatigue = clamp(applyRange(trainee.fatigue, activity.fatigue), 0, 100)
    trainee.stress = clamp(applyRange(trainee.stress, activity.stress), 0, 100)

    if (activity.fansGain) {
      const gained = randInt(activity.fansGain[0], activity.fansGain[1])
      fans += gained
      trainee.fans += Math.round(gained * 0.3)
      logs.push({ day: state.day, text: `${trainee.name} 参与公关，粉丝 +${gained}。` })
    }

    for (const p of partners) {
      const cur = getRelationship(relationships, trainee.id, p.id)
      setRelationship(
        relationships,
        trainee.id,
        p.id,
        cur + randInt(CFG.relationships.trainingTogether[0], CFG.relationships.trainingTogether[1])
      )
    }
  }

  for (let i = 0; i < trainees.length; i++) {
    for (let j = i + 1; j < trainees.length; j++) {
      const a = trainees[i]
      const b = trainees[j]
      if (a.status === 'left' || b.status === 'left') continue

      const key = pairKey(a.id, b.id)
      let rel = relationships[key] ?? 0
      rel += randInt(CFG.relationships.dailyDrift[0], CFG.relationships.dailyDrift[1])
      rel = clamp(rel, CFG.relationships.min, CFG.relationships.max)

      const maxStat = (t) => Math.max(...CFG.stats.map((s) => t.stats[s]))
      const gap = Math.abs(maxStat(a) - maxStat(b))
      if (gap >= CFG.relationships.statGapCompetition) {
        rel -= randInt(2, 6)
        const weaker = maxStat(a) < maxStat(b) ? a : b
        weaker.stress = clamp(
          weaker.stress + randInt(CFG.relationships.competitionStress[0], CFG.relationships.competitionStress[1]),
          0,
          100
        )
        if (rel <= CFG.relationships.competitionThreshold) {
          logs.push({
            day: state.day,
            text: `${weaker.name} 感受到来自 ${weaker === a ? b.name : a.name} 的竞争压力！`,
          })
        }
      }

      relationships[key] = rel
    }
  }

  const dailyCost =
    CFG.dailyCosts.baseOperatingCost +
    trainees.filter((t) => t.status === 'trainee').length * CFG.dailyCosts.perTraineeCost +
    trainees.filter((t) => t.status === 'debuted').length * CFG.dailyCosts.perDebutedCost +
    state.groups.length * CFG.dailyCosts.perGroupCost

  money -= dailyCost
  totalExpenses += dailyCost

  const newDay = state.day + 1
  const pendingRating = state.day % CFG.rating.interval === 0

  let pendingEvent = null
  if (Math.random() < CFG.events.dailyChance) {
    pendingEvent = generateRandomEvent(trainees, state.day)
    if (pendingEvent.type === 'fan_surge') {
      fans += pendingEvent.fansGain
      logs.push({ day: state.day, text: `【${pendingEvent.label}】粉丝 +${pendingEvent.fansGain}！` })
      pendingEvent = null
    } else if (pendingEvent.type === 'inspiration') {
      const target = pendingEvent.target
      const stat = pickRandom(CFG.stats)
      target.stats[stat] = clamp(target.stats[stat] + pendingEvent.statBoost, 0, CFG.thresholds.statCap)
      logs.push({
        day: state.day,
        text: `【${pendingEvent.label}】${target.name} 的${CFG.statLabels[stat]} +${pendingEvent.statBoost}！`,
      })
      pendingEvent = null
    } else if (pendingEvent.type === 'negative_news') {
      fans = Math.max(0, fans - pendingEvent.fansLoss)
      for (const t of trainees) {
        if (t.status !== 'left') {
          t.stress = clamp(t.stress + pendingEvent.stressGain, 0, 100)
        }
      }
      logs.push({
        day: state.day,
        text: `【${pendingEvent.label}】粉丝 -${pendingEvent.fansLoss}，全员压力上升。`,
      })
      pendingEvent = null
    } else if (pendingEvent.type === 'illness') {
      pendingEvent.target.illnessDays = pendingEvent.duration
      pendingEvent.target.stress = clamp(
        pendingEvent.target.stress + pendingEvent.stressGain,
        0,
        100
      )
      logs.push({
        day: state.day,
        text: `【${pendingEvent.label}】${pendingEvent.target.name} 需要休养 ${pendingEvent.duration} 天。`,
      })
      pendingEvent = null
    }
  }

  const groupReputation = { ...state_.groupReputation }
  for (const g of state_.groups) {
    if (groupReputation[g.id] !== undefined) {
      groupReputation[g.id] = clamp(
        groupReputation[g.id] - CFG.tour.reputationDecay,
        0,
        CFG.tour.maxReputation
      )
    }
  }

  const nextState = {
    ...state_,
    day: newDay,
    money,
    fans,
    totalExpenses,
    trainees,
    relationships,
    groupReputation,
    schedule: {},
    logs: [...state_.logs, ...logs],
    pendingEvent,
    pendingRating,
  }

  const result = checkVictory(nextState)
  if (result) nextState.gameStatus = result

  return nextState
}

function generateRandomEvent(trainees, day) {
  const active = trainees.filter((t) => t.status !== 'left' && t.illnessDays === 0)
  if (active.length === 0) return null

  const types = Object.entries(CFG.events.types).map(([key, val]) => ({
    key,
    ...val,
  }))
  const picked = weightedPick(types)
  const target = pickRandom(active)

  const event = {
    type: picked.key,
    label: picked.label,
    description: picked.description,
    day,
    target,
    resolved: false,
  }

  switch (picked.key) {
    case 'poaching':
      event.successChance = picked.successChance
      break
    case 'illness':
      event.duration = randInt(picked.duration[0], picked.duration[1])
      event.stressGain = randInt(picked.stressGain[0], picked.stressGain[1])
      break
    case 'inspiration':
      event.statBoost = randInt(picked.statBoost[0], picked.statBoost[1])
      break
    case 'negative_news':
      event.fansLoss = randInt(picked.fansLoss[0], picked.fansLoss[1])
      event.stressGain = randInt(picked.stressGain[0], picked.stressGain[1])
      break
    case 'fan_surge':
      event.fansGain = randInt(picked.fansGain[0], picked.fansGain[1])
      break
  }

  return event
}

export function resolvePoachingEvent(state, keepTrainee) {
  const event = state.pendingEvent
  if (!event || event.type !== 'poaching') return state

  const logs = [...state.logs]
  const trainees = state.trainees.map((t) => ({ ...t, stats: { ...t.stats } }))
  const target = trainees.find((t) => t.id === event.target.id)

  if (keepTrainee) {
    const cost = randInt(8000, 15000)
    logs.push({
      day: state.day,
      text: `【挖角危机】你花费 ¥${cost} 成功挽留 ${target.name}！`,
    })
    target.stress = clamp(target.stress + randInt(5, 12), 0, 100)
    return {
      ...state,
      money: state.money - cost,
      totalExpenses: state.totalExpenses + cost,
      trainees,
      logs,
      pendingEvent: null,
    }
  }

  const roll = Math.random()
  const resist = target.poachResist / 100
  if (roll > event.successChance * (1 - resist * 0.5)) {
    logs.push({ day: state.day, text: `【挖角危机】${target.name} 决定留在事务所。` })
    return { ...state, trainees, logs, pendingEvent: null }
  }

  target.status = 'left'
  logs.push({ day: state.day, text: `【挖角危机】${target.name} 被竞争对手挖走，离开了事务所！` })
  const result = checkVictory({ ...state, trainees })
  return {
    ...state,
    trainees,
    logs,
    pendingEvent: null,
    gameStatus: result || state.gameStatus,
  }
}

export function debutGroup(state, memberIds, groupName) {
  const members = state.trainees.filter((t) => memberIds.includes(t.id))
  if (members.length < CFG.rating.minGroupSize || members.length > CFG.rating.maxGroupSize) {
    return { success: false, message: `出道人数需在 ${CFG.rating.minGroupSize}-${CFG.rating.maxGroupSize} 人之间` }
  }

  for (const m of members) {
    if (m.status !== 'trainee') return { success: false, message: `${m.name} 无法出道` }
    if (calcTraineeScore(m) < CFG.rating.debutScoreThreshold) {
      return { success: false, message: `${m.name} 综合评分未达标（需 ≥${CFG.rating.debutScoreThreshold}）` }
    }
  }

  const groupId = `g_${Date.now()}`
  const trainees = state.trainees.map((t) => {
    if (memberIds.includes(t.id)) {
      return { ...t, status: 'debuted', groupId }
    }
    return t
  })

  const avgStats = {}
  for (const key of CFG.stats) {
    avgStats[key] = Math.round(members.reduce((s, m) => s + m.stats[key], 0) / members.length)
  }

  const groups = [
    ...state.groups,
    {
      id: groupId,
      name: groupName || `${members.map((m) => m.name[0]).join('')}组`,
      memberIds: [...memberIds],
      debutedDay: state.day,
      avgStats,
      totalSales: 0,
      singles: [],
    },
  ]

  const logs = [
    ...state.logs,
    {
      day: state.day,
      text: `🎉 组合「${groupName || groups[groups.length - 1].name}」正式出道！成员：${members.map((m) => m.name).join('、')}`,
    },
  ]

  return {
    success: true,
    state: { ...state, trainees, groups, logs, pendingRating: false },
  }
}

export function releaseSingle(state, groupId) {
  const group = state.groups.find((g) => g.id === groupId)
  if (!group) return { success: false, message: '组合不存在' }

  const lastDay = state.lastSingleDay[groupId] || 0
  if (state.day - lastDay < CFG.single.cooldownDays) {
    return {
      success: false,
      message: `距上次发歌还需 ${CFG.single.cooldownDays - (state.day - lastDay)} 天`,
    }
  }

  if (state.money < CFG.single.creationCost) {
    return { success: false, message: '资金不足' }
  }

  const members = state.trainees.filter((t) => group.memberIds.includes(t.id))
  const statAvg =
    CFG.stats.reduce((s, k) => s + group.avgStats[k], 0) / CFG.stats.length
  const charmAvg = group.avgStats.charm
  const popularity = state.fans + members.reduce((s, m) => s + m.fans, 0)

  const sales = Math.round(
    CFG.single.baseSales +
      statAvg * CFG.single.statWeight * 50 +
      popularity * CFG.single.fansWeight * 0.08 +
      charmAvg * CFG.single.charmWeight * 30 +
      randInt(-200, 400)
  )

  const revenue = sales * CFG.single.revenuePerSale
  const groups = state.groups.map((g) => {
    if (g.id !== groupId) return g
    return {
      ...g,
      totalSales: g.totalSales + sales,
      singles: [
        ...g.singles,
        { day: state.day, sales, revenue, title: `单曲 Vol.${g.singles.length + 1}` },
      ],
    }
  })

  const trainees = state.trainees.map((t) => {
    if (!group.memberIds.includes(t.id)) return t
    return { ...t, singlesReleased: t.singlesReleased + 1, fans: t.fans + Math.round(sales * 0.05) }
  })

  const logs = [
    ...state.logs,
    {
      day: state.day,
      text: `💿 ${group.name} 发行新单曲，销量 ${sales.toLocaleString()}，收入 ¥${revenue.toLocaleString()}！`,
    },
  ]

  return {
    success: true,
    state: {
      ...state,
      money: state.money - CFG.single.creationCost + revenue,
      totalRevenue: state.totalRevenue + revenue,
      totalExpenses: state.totalExpenses + CFG.single.creationCost,
      fans: state.fans + Math.round(sales * 0.02),
      groups,
      trainees,
      logs,
      lastSingleDay: { ...state.lastSingleDay, [groupId]: state.day },
    },
    sales,
    revenue,
  }
}

export function getRatingResults(state) {
  return getActiveTrainees(state)
    .filter((t) => t.status === 'trainee')
    .map((t) => ({
      ...t,
      score: calcTraineeScore(t),
      canDebut: calcTraineeScore(t) >= CFG.rating.debutScoreThreshold,
    }))
    .sort((a, b) => b.score - a.score)
}

export function getGroupReputation(state, groupId) {
  return state.groupReputation[groupId] ?? 50
}

export function getActiveTours(state) {
  return (state.tours || []).filter((t) => t.status === 'ongoing')
}

export function isGroupOnTour(state, groupId) {
  return getActiveTours(state).some((t) => t.groupId === groupId)
}

export function isTraineeOnTour(state, traineeId) {
  const activeTours = getActiveTours(state)
  if (activeTours.length === 0) return false
  const onTourGroupIds = new Set(activeTours.map((t) => t.groupId))
  const trainee = state.trainees.find((t) => t.id === traineeId)
  return trainee && onTourGroupIds.has(trainee.groupId)
}

export function scheduleTour(state, groupId, cityNames) {
  const group = state.groups.find((g) => g.id === groupId)
  if (!group) return { success: false, message: '组合不存在' }

  if (cityNames.length < CFG.tour.minCities || cityNames.length > CFG.tour.maxCities) {
    return { success: false, message: `巡演城市数量需在 ${CFG.tour.minCities}-${CFG.tour.maxCities} 之间` }
  }

  if (isGroupOnTour(state, groupId)) {
    return { success: false, message: '该组合正在巡演中' }
  }

  const lastDay = state.lastTourDay[groupId]
  if (lastDay !== undefined && state.day - lastDay < CFG.tour.cooldownDays) {
    return {
      success: false,
      message: `距上次巡演还需 ${CFG.tour.cooldownDays - (state.day - lastDay)} 天冷却`,
    }
  }

  const logisticsCost =
    CFG.tour.baseLogisticsCost + cityNames.length * CFG.tour.perCityExtraCost

  if (state.money < logisticsCost) {
    return { success: false, message: '资金不足以支付巡演后勤费用' }
  }

  const members = state.trainees.filter((t) => group.memberIds.includes(t.id))
  const avgFatigue = members.reduce((s, m) => s + m.fatigue, 0) / members.length
  if (avgFatigue >= CFG.tour.fatiguePerformanceThreshold) {
    return { success: false, message: '成员平均体力过低，无法出发巡演' }
  }

  const cityConfigs = cityNames
    .map((name) => CFG.tour.cities.find((c) => c.name === name))
    .filter(Boolean)

  const tourId = `tour_${Date.now()}`
  const totalDays = cityNames.length * CFG.tour.daysPerCity

  const tour = {
    id: tourId,
    groupId,
    cities: cityConfigs.map((c) => ({ ...c })),
    startDay: state.day,
    totalDays,
    currentDay: 0,
    status: 'ongoing',
    revenue: 0,
    results: [],
  }

  const tours = [...(state.tours || []), tour]
  const groupReputation = { ...state.groupReputation }
  if (!(groupId in groupReputation)) {
    groupReputation[groupId] = 50
  }

  const logs = [
    ...state.logs,
    {
      day: state.day,
      text: `🎤 ${group.name} 出发巡演！途经 ${cityNames.join('→')}，共 ${totalDays} 天。`,
    },
  ]

  return {
    success: true,
    state: {
      ...state,
      money: state.money - logisticsCost,
      totalExpenses: state.totalExpenses + logisticsCost,
      tours,
      groupReputation,
      logs,
    },
    tourId,
  }
}

function calcPerformanceQuality(members) {
  if (members.length === 0) return 0
  const avgFatigue = members.reduce((s, m) => s + m.fatigue, 0) / members.length
  const avgStress = members.reduce((s, m) => s + m.stress, 0) / members.length

  let quality = 100
  if (avgFatigue > CFG.tour.fatiguePerformanceThreshold) {
    quality -= (avgFatigue - CFG.tour.fatiguePerformanceThreshold) * 1.2
  }
  if (avgStress > CFG.tour.stressPerformanceThreshold) {
    quality -= (avgStress - CFG.tour.stressPerformanceThreshold) * 0.8
  }

  const avgStat =
    CFG.stats.reduce((s, k) => {
      const groupAvg = members.reduce((ss, m) => ss + m.stats[k], 0) / members.length
      return s + groupAvg
    }, 0) / CFG.stats.length
  quality += (avgStat - 50) * 0.3

  return clamp(Math.round(quality), 10, 120)
}

export function processTourDay(state) {
  const tours = (state.tours || []).filter((t) => t.status === 'ongoing')
  if (tours.length === 0) return state

  const logs = [...state.logs]
  let money = state.money
  let fans = state.fans
  let totalRevenue = state.totalRevenue
  const trainees = state.trainees.map((t) => ({ ...t, stats: { ...t.stats } }))
  const groupReputation = { ...state.groupReputation }
  let lastTourDay = { ...state.lastTourDay }
  const updatedTours = state.tours.map((tour) => {
    if (tour.status !== 'ongoing') return tour
    const tour_ = { ...tour, currentDay: tour.currentDay + 1 }

    const cityIndex = Math.floor((tour_.currentDay - 1) / CFG.tour.daysPerCity)
    const dayInCity = ((tour_.currentDay - 1) % CFG.tour.daysPerCity) + 1
    const city = tour.cities[cityIndex]

    if (!city) return tour

    const group = state.groups.find((g) => g.id === tour.groupId)
    const members = trainees.filter((t) => group && group.memberIds.includes(t.id))

    if (dayInCity === 1) {
      const quality = calcPerformanceQuality(members)
      const reputation = groupReputation[tour.groupId] ?? 50

      const qualityFactor = quality / 100
      const repFactor = reputation / 100
      const fansFactor = Math.min(fans / 10000, 2)

      const revenue = Math.round(
        city.baseRevenue *
          (CFG.tour.qualityImpactOnRevenue * qualityFactor +
            CFG.tour.reputationImpactOnRevenue * repFactor +
            CFG.tour.fansImpactOnRevenue * fansFactor) +
          randInt(-2000, 3000)
      )

      const attendance = Math.round(
        city.baseAttendance * qualityFactor * (0.7 + repFactor * 0.3) + randInt(-500, 800)
      )

      const fanGain = randInt(city.fanGain[0], city.fanGain[1])
      const roundedFanGain = Math.round(fanGain * qualityFactor)

      money += revenue
      totalRevenue += revenue
      fans += roundedFanGain

      for (const m of members) {
        m.fatigue = clamp(
          m.fatigue + randInt(CFG.tour.performanceFatigueCost[0], CFG.tour.performanceFatigueCost[1]),
          0,
          100
        )
        m.stress = clamp(
          m.stress + randInt(CFG.tour.performanceStressCost[0], CFG.tour.performanceStressCost[1]),
          0,
          100
        )
        m.fans += Math.round(roundedFanGain / members.length)
      }

      const repGain = quality >= 80 ? randInt(3, 8) : quality >= 50 ? randInt(0, 3) : randInt(-5, -1)
      groupReputation[tour.groupId] = clamp(
        (groupReputation[tour.groupId] ?? 50) + repGain,
        0,
        CFG.tour.maxReputation
      )

      const result = {
        city: city.name,
        day: state.day,
        quality,
        attendance,
        revenue,
        fanGain: roundedFanGain,
        repGain,
      }

      tour_.revenue += revenue
      tour_.results = [...tour_.results, result]

      const qualityLabel = quality >= 80 ? '🔥 精彩' : quality >= 50 ? '👍 不错' : '😅 勉强'
      logs.push({
        day: state.day,
        text: `🎤 ${group?.name || '组合'} ${city.name}站演出 ${qualityLabel}（品质${quality}），上座${attendance.toLocaleString()}人，收入 ¥${revenue.toLocaleString()}`,
      })
    } else {
      for (const m of members) {
        m.fatigue = clamp(
          m.fatigue + randInt(CFG.tour.restDayFatigueRecovery[0], CFG.tour.restDayFatigueRecovery[1]),
          0,
          100
        )
        m.stress = clamp(
          m.stress + randInt(CFG.tour.restDayStressRecovery[0], CFG.tour.restDayStressRecovery[1]),
          0,
          100
        )
      }
      logs.push({
        day: state.day,
        text: `😴 ${group?.name || '组合'} 在${city.name}休整一天，恢复体力。`,
      })
    }

    if (tour_.currentDay >= tour_.totalDays) {
      tour_.status = 'completed'
      lastTourDay[tour.groupId] = state.day
      logs.push({
        day: state.day,
        text: `🎉 ${group?.name || '组合'} 巡演结束！总收入 ¥${tour_.revenue.toLocaleString()}。`,
      })
    }

    return tour_
  })

  return {
    ...state,
    money,
    fans,
    totalRevenue,
    trainees,
    tours: updatedTours,
    groupReputation,
    lastTourDay,
    logs,
  }
}
