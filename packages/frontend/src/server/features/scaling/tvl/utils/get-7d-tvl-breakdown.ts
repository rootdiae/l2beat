import { bridges } from '@l2beat/config'
import { layer2s } from '@l2beat/config/build/src/projects/layer2s'
import { layer3s } from '@l2beat/config/build/src/projects/layer3s'
import { UnixTime } from '@l2beat/shared-pure'
import { unstable_cache as cache } from 'next/cache'
import { env } from '~/env'
import { calculatePercentageChange } from '~/utils/calculate-percentage-change'
import { getTvlBreakdown } from './get-tvl-breakdown'
import { getTvlProjects } from './get-tvl-projects'
import { getTvlValuesForProjects } from './get-tvl-values-for-projects'

export function get7dTvlBreakdown(
  ...parameters: Parameters<typeof getCached7dTokenBreakdown>
) {
  if (env.MOCK) {
    return getMockTvlBreakdownData()
  }
  return getCached7dTokenBreakdown(...parameters)
}

export type SevenDayTvlBreakdown = Awaited<
  ReturnType<typeof getCached7dTokenBreakdown>
>
const getCached7dTokenBreakdown = cache(
  async () => {
    const tvlValues = await getTvlValuesForProjects(
      getTvlProjects(
        (project) => project.type === 'layer2' || project.type === 'layer3',
      ),
      '7d',
    )

    const projects = Object.fromEntries(
      Object.entries(tvlValues).map(([projectId, values]) => {
        const latestTimestamp = Math.max(...Object.keys(values).map(Number))
        const oldestTimestamp = Math.min(...Object.keys(values).map(Number))
        const latestValues = values[latestTimestamp] ?? []
        const oldestValues = values[oldestTimestamp] ?? []
        const breakdown = getTvlBreakdown(latestValues)
        const oldBreakdown = getTvlBreakdown(oldestValues)
        const total =
          breakdown.native + breakdown.canonical + breakdown.external
        const oldTotal =
          oldBreakdown.native + oldBreakdown.canonical + oldBreakdown.external
        return [
          projectId,
          {
            total: total / 100,
            totalChange: calculatePercentageChange(total, oldTotal),
            breakdown: {
              native: breakdown.native / 100,
              canonical: breakdown.canonical / 100,
              external: breakdown.external / 100,
              associated: {
                native: breakdown.associated.native / 100,
                canonical: breakdown.associated.canonical / 100,
                external: breakdown.associated.external / 100,
              },
            },
            change: {
              native: calculatePercentageChange(
                breakdown.native,
                oldBreakdown.native,
              ),
              canonical: calculatePercentageChange(
                breakdown.canonical,
                oldBreakdown.canonical,
              ),
              external: calculatePercentageChange(
                breakdown.external,
                oldBreakdown.external,
              ),
            },
          },
        ]
      }),
    )

    const total = Object.values(projects).reduce(
      (acc, { breakdown }) =>
        acc + breakdown.native + breakdown.canonical + breakdown.external,
      0,
    )

    return {
      total,
      projects,
    }
  },
  ['getCached7dTokenBreakdown'],
  {
    revalidate: 10 * UnixTime.MINUTE,
  },
)

function getMockTvlBreakdownData(): SevenDayTvlBreakdown {
  return {
    total: 1000,
    projects: Object.fromEntries(
      [...layer2s, ...layer3s, ...bridges].map((project) => [
        project.id,
        {
          total: 60,
          totalChange: 0.4,
          breakdown: {
            canonical: 30,
            native: 20,
            external: 10,
            associated: {
              native: 1,
              canonical: 2,
              external: 3,
            },
          },
          change: {
            canonical: 0.5,
            native: 0.25,
            external: 0.25,
          },
        },
      ]),
    ),
  }
}
