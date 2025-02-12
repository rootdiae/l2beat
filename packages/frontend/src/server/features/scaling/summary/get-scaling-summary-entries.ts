import {
  type Layer2,
  type Layer3,
  type ProjectDataAvailability,
  type ScalingProjectCategory,
  type ScalingProjectDisplay,
  type ScalingProjectStack,
  type StageConfig,
  type WarningWithSentiment,
  layer2s,
  layer3s,
} from '@l2beat/config'
import { type ReasonForBeingInOther } from '@l2beat/config/build/src/common/ReasonForBeingInOther'
import { compact } from 'lodash'
import { getL2Risks } from '~/app/(side-nav)/scaling/_utils/get-l2-risks'
import { type RosetteValue } from '~/components/rosette/types'
import { groupByTabs } from '~/utils/group-by-tabs'
import {
  type ProjectChanges,
  getProjectsChangeReport,
} from '../../projects-change-report/get-projects-change-report'
import {
  type ActivityLatestUopsData,
  getActivityLatestUops,
} from '../activity/get-activity-latest-tps'
import {
  type CommonScalingEntry,
  getCommonScalingEntry,
} from '../get-common-scaling-entry'
import {
  type LatestTvl,
  get7dTokenBreakdown,
} from '../tvl/utils/get-7d-token-breakdown'
import { getAssociatedTokenWarning } from '../tvl/utils/get-associated-token-warning'
import { compareStageAndTvl } from '../utils/compare-stage-and-tvl'
import { isProjectOther } from '../utils/is-project-other'

export async function getScalingSummaryEntries() {
  const projects = [...layer2s, ...layer3s].filter(
    (project) => !project.isUpcoming && !project.isArchived,
  )
  const [projectsChangeReport, tvl, projectsActivity] = await Promise.all([
    getProjectsChangeReport(),
    get7dTokenBreakdown({ type: 'layer2' }),
    getActivityLatestUops(projects),
  ])

  const entries = projects
    .map((project) =>
      getScalingSummaryEntry(
        project,
        projectsChangeReport.getChanges(project.id),
        tvl.projects[project.id.toString()],
        projectsActivity[project.id.toString()],
      ),
    )
    .sort(compareStageAndTvl)

  return groupByTabs(entries)
}

export interface ScalingSummaryEntry extends CommonScalingEntry {
  stage: StageConfig
  category: ScalingProjectCategory
  provider: ScalingProjectStack | undefined
  dataAvailability: ProjectDataAvailability | undefined
  mainPermissions: ScalingProjectDisplay['mainPermissions']
  reasonsForBeingOther: ReasonForBeingInOther[] | undefined
  tvl: {
    breakdown:
      | {
          total: number
          ether: number
          stablecoin: number
          associated: number
        }
      | undefined
    change: number | undefined
    associatedTokensExcludedChange: number | undefined
    associatedTokens: string[]
    warnings: WarningWithSentiment[]
    associatedTokensExcludedWarnings: WarningWithSentiment[]
  }
  activity:
    | {
        pastDayUops: number
        change: number
      }
    | undefined
  tvlOrder: number
  risks: RosetteValue[]
  baseLayerRisks: RosetteValue[] | undefined
}

function getScalingSummaryEntry(
  project: Layer2 | Layer3,
  changes: ProjectChanges,
  latestTvl: LatestTvl['projects'][string] | undefined,
  activity: ActivityLatestUopsData[string] | undefined,
): ScalingSummaryEntry {
  const associatedTokenWarning =
    latestTvl && latestTvl.breakdown.total > 0
      ? getAssociatedTokenWarning({
          associatedRatio:
            latestTvl.breakdown.associated / latestTvl.breakdown.total,
          name: project.display.name,
          associatedTokens: project.config.associatedTokens ?? [],
        })
      : undefined
  const associatedTokensExcludedWarnings = compact([project.display.tvlWarning])

  return {
    ...getCommonScalingEntry({ project, changes, syncStatus: undefined }),
    stage:
      isProjectOther(project) || !project.stage
        ? {
            stage: 'NotApplicable' as const,
          }
        : project.stage,
    category: project.display.category,
    provider: project.display.provider,
    dataAvailability: project.dataAvailability,
    mainPermissions: project.display.mainPermissions,
    reasonsForBeingOther: project.display.reasonsForBeingOther,
    tvl: {
      breakdown: latestTvl?.breakdown,
      change: latestTvl?.change,
      associatedTokensExcludedChange: latestTvl?.associatedTokensExcludedChange,
      associatedTokens: project.config.associatedTokens ?? [],
      warnings: compact([
        ...associatedTokensExcludedWarnings,
        associatedTokenWarning?.sentiment === 'bad' && associatedTokenWarning,
      ]),
      associatedTokensExcludedWarnings,
    },
    activity: activity
      ? {
          pastDayUops: activity.pastDayUops,
          change: activity.change,
        }
      : undefined,
    tvlOrder: latestTvl?.breakdown.total ?? -1,
    ...getRisks(project),
  }
}

export function getRisks(project: Layer2 | Layer3): {
  risks: RosetteValue[]
  baseLayerRisks: RosetteValue[] | undefined
} {
  if (project.type === 'layer2') {
    return {
      risks: getL2Risks(project.riskView),
      baseLayerRisks: undefined,
    }
  }
  const baseLayer = layer2s.find((p) => p.id === project.hostChain)
  const projectRisks = getL2Risks(project.riskView)
  const baseLayerRisks = baseLayer ? getL2Risks(baseLayer.riskView) : undefined
  const stackedRisks =
    project.type === 'layer3' ? project.stackedRiskView : undefined
  return {
    risks: stackedRisks ? getL2Risks(stackedRisks) : projectRisks,
    baseLayerRisks,
  }
}
