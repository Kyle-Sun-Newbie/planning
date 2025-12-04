# backend/main.py

# uvicorn main:app --reload --port 8000

from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from shapely.geometry import shape
from shapely.ops import transform
from pyproj import Transformer

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发环境先放开，生产环境再收紧
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# WGS84 -> EPSG:4513
transformer = Transformer.from_crs("EPSG:4326", "EPSG:4513", always_xy=True)


class CleanFeature(BaseModel):
    id: str                     # 前端传来的 entity.id
    geometry: Dict[str, Any]    # GeoJSON 几何（Polygon）


class CleanRequest(BaseModel):
    features: List[CleanFeature]
    k_threshold: Optional[float] = 30.0  # 默认30，前端也可以传


class CleanResponse(BaseModel):
    ids_to_hide: List[str]      # 要隐藏的 id 列表


def compute_k(geom) -> Optional[float]:
    """在 EPSG:4513 下计算 C^2 / A"""
    projected = transform(lambda x, y, z=None: transformer.transform(x, y), geom)
    C = projected.length
    A = projected.area
    if A == 0:
        return None
    return (C * C) / A


@app.post("/clean", response_model=CleanResponse)
def clean(req: CleanRequest):
    ids_to_hide: List[str] = []

    for f in req.features:
        geom = shape(f.geometry)
        k = compute_k(geom)
        if k is not None and k > (req.k_threshold or 30.0):
            ids_to_hide.append(f.id)

    return CleanResponse(ids_to_hide=ids_to_hide)
