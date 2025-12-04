# 使用说明

## 一、如何运行

### 后端
1. 克隆项目并进入目录：

   ```bash
   cd backend
   pip install shapely geojson fastapi uvicorn flask
   ```

2. 启动后端：

   ```bash
   uvicorn main:app --reload --port 8000
   ```

### 前端
1. 克隆项目并进入目录：

   ```bash
   cd new_prj
   ```

2. 安装依赖：

   ```bash
   npm install
   npm install cesium vite-plugin-cesium --save
   ```

3. 启动开发环境：

   ```bash
   npm run dev
   ```

   浏览器访问：`http://localhost:5173/`

---



## 二、主要代码说明

### 1. `cesiumBase.ts`

- 负责初始化 Cesium Viewer。
- 设置地形、底图、相机初始视角等基础配置。
- 对外返回 Viewer 等核心对象，给其他模块使用。

### 2. `cleanApi.ts`

- 对 GeoJSON 中的坐标、多边形做「清洗」和规范化：
  - 保证多边形首尾坐标闭合；
  - 对坐标做简单检查或修正。
- 为后续在 Cesium 中稳定渲染提供干净的数据。

### 3. `geojsonLoader.ts`

- 封装加载 GeoJSON 的逻辑：
  - 使用 Cesium 的 `GeoJsonDataSource` 加载文件；
  - 统一设置样式（填充色、边界线等）。
- 支持加载一个或多个 GeoJSON 数据源到 Viewer 中。

### 4. `selectionHandler.ts`

- 处理 Cesium 场景中的鼠标点击事件：
  - 拾取被点击的实体；
  - 读取实体属性，并通过回调传给 Vue 组件。
- 负责高亮当前选中多边形，以及清除高亮状态。

### 5. `CesiumViewer.vue`

- Vue 层的主组件：
  - 提供 Cesium 挂载容器；
  - 显示左侧（或右侧）属性信息面板。
- 在 `onMounted` 中调用：
  - `cesiumBase.ts` 初始化 Viewer；
  - `geojsonLoader.ts` 加载数据；
  - `selectionHandler.ts` 注册点击逻辑。
- 管理 `selectedInfo` 等响应式数据。

### 6. `main.py`

- 根据形状参数剔除奇形怪状的区域
