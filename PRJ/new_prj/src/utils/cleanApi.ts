// src/utils/cleanApi.ts
import * as Cesium from 'cesium'

export interface CleanApiOptions {
  kThreshold?: number
  endpoint?: string // 默认 http://localhost:8000/clean
}

export interface CleanResult {
  idsToHide: string[]
}

/**
 * 从 Cesium 的 Viewer + dataSources 中抽取“当前显示的多边形”，
 * 发给后端 Python，让它返回要隐藏的 entity.id 列表
 */
export async function requestCleanFromPython(
  viewer: Cesium.Viewer,
  dataSources: Cesium.DataSource[],
  options: CleanApiOptions = {},
): Promise<CleanResult> {
  const time = viewer.clock.currentTime
  const endpoint = options.endpoint ?? 'http://localhost:8000/clean'
  const kThreshold = options.kThreshold ?? 30

  // 1. 抽取当前显示的多边形，构造成 GeoJSON Polygon
  const features: Array<{ id: string; geometry: any }> = []

  dataSources.forEach((ds) => {
    const entities = (ds as any).entities?.values as Cesium.Entity[] | undefined
    if (!entities) return

    entities.forEach((entity) => {
      if (!entity.polygon || entity.isShowing === false || entity.show === false) return

      const hierarchy = entity.polygon.hierarchy?.getValue(time) as
        | Cesium.PolygonHierarchy
        | undefined
      if (!hierarchy || !hierarchy.positions || hierarchy.positions.length < 3) return

      const coords: [number, number][] = hierarchy.positions.map((pos) => {
        const carto = Cesium.Cartographic.fromCartesian(pos)
        const lon = Cesium.Math.toDegrees(carto.longitude)
        const lat = Cesium.Math.toDegrees(carto.latitude)
        return [lon, lat]
      })

      if (coords.length === 0) {
        return
    }

      // 确保闭合
      const first = coords[0]!
      const last = coords[coords.length - 1]!
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push([first[0], first[1]])
      }

      const geometry = {
        type: 'Polygon',
        coordinates: [coords],
      }

      // 用 entity.id 当后端识别用的 id
      const id = String(entity.id)

      features.push({ id, geometry })
    })
  })

  if (features.length === 0) {
    return { idsToHide: [] }
  }

  // 2. 调用 Python 接口
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      features,
      k_threshold: kThreshold,
    }),
  })

  if (!resp.ok) {
    console.error('调用清洗接口失败', resp.status)
    throw new Error(`Clean API error: ${resp.status}`)
  }

  const data = await resp.json()
  return {
    idsToHide: data.ids_to_hide ?? [],
  }
}
