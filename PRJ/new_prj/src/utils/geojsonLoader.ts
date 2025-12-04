// src/utils/geojsonLoader.ts
import * as Cesium from 'cesium'

export interface LoadGeoJsonOptions {
  /** 填充颜色（不传则用默认蓝色） */
  fillColor?: Cesium.Color
  /** 边线颜色（不传则用默认蓝色） */
  outlineColor?: Cesium.Color
  /** 边线宽度，单位像素 */
  outlineWidth?: number
}

/**
 * 加载一个 GeoJSON 并应用统一样式
 */
export async function loadGeoJson(
  viewer: Cesium.Viewer,
  url: string,
  options: LoadGeoJsonOptions = {},
): Promise<Cesium.GeoJsonDataSource> {
  // 加载数据源
  const dataSource = await Cesium.GeoJsonDataSource.load(url)
  await viewer.dataSources.add(dataSource)

  // 颜色和宽度配置
  const fillColor =
    options.fillColor ?? Cesium.Color.fromCssColorString('#1a3a6b').withAlpha(0.6)
  const outlineColor =
    options.outlineColor ?? Cesium.Color.fromCssColorString('#4a9eff').withAlpha(0.9)
  const outlineWidth = options.outlineWidth ?? 1.5

  // ✅ 用 MaterialProperty / ConstantProperty 包一层，类型完全匹配
  const fillMaterial = new Cesium.ColorMaterialProperty(fillColor)
  const outlineColorProp = new Cesium.ConstantProperty(outlineColor)
  const outlineWidthProp = new Cesium.ConstantProperty(outlineWidth)
  const outlineEnabledProp = new Cesium.ConstantProperty(true)

  dataSource.entities.values.forEach((entity) => {
    const polygon = entity.polygon
    if (!polygon) return

    polygon.material = fillMaterial                    // MaterialProperty
    polygon.outline = outlineEnabledProp               // Property<boolean>
    polygon.outlineColor = outlineColorProp            // Property<Color>
    polygon.outlineWidth = outlineWidthProp            // Property<number>
  })

  return dataSource
}
