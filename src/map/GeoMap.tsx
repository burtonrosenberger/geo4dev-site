import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Map,
  NavigationControl,
  ScaleControl,
  FullscreenControl,
  GeolocateControl,
  AttributionControl,
  useControl,
} from 'react-map-gl/maplibre'
import type { MapRef } from 'react-map-gl/maplibre'
import type { StyleSpecification } from 'maplibre-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { ScatterplotLayer } from '@deck.gl/layers'
import type { Layer } from '@deck.gl/core'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Dataset } from '../lib/types'

export type GeoDataset = Dataset & { lat: number; lng: number }

function raster(tiles: string[], attribution: string): StyleSpecification {
  return {
    version: 8,
    sources: { base: { type: 'raster', tiles, tileSize: 256, attribution } },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
  }
}
export const BASEMAPS: Record<string, { label: string; style: StyleSpecification }> = {
  dark: { label: 'Dark', style: raster(['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png','https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png','https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'], '© OpenStreetMap © CARTO') },
  light: { label: 'Light', style: raster(['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png','https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png','https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'], '© OpenStreetMap © CARTO') },
  osm: { label: 'OpenStreetMap', style: raster(['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], '© OpenStreetMap contributors') },
  satellite: { label: 'Satellite', style: raster(['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], 'Imagery © Esri, Maxar, Earthstar Geographics') },
}

function DeckOverlay(props: { layers: Layer[] }) {
  const overlay = useControl(() => new MapboxOverlay({ interleaved: false, layers: props.layers }))
  overlay.setProps({ layers: props.layers })
  return null
}

interface Props {
  points: GeoDataset[]
  basemap?: string
  showPoints?: boolean
  pointSize?: number
  outlineWidth?: number
  selectedId?: string | null
  onSelect?: (d: GeoDataset | null) => void
  flyTo?: { lng: number; lat: number; key: number } | null
  embedded?: boolean
  height?: string
  initialZoom?: number
  initialCenter?: [number, number]
}

export default function GeoMap({
  points,
  basemap = 'dark',
  showPoints = true,
  pointSize = 6,
  outlineWidth = 1.4,
  selectedId = null,
  onSelect,
  flyTo = null,
  embedded = false,
  height = '100%',
  initialZoom,
  initialCenter,
}: Props) {
  const mapRef = useRef<MapRef>(null)
  const [loaded, setLoaded] = useState(false)

  // Hold the latest onSelect in a ref so an inline parent callback does not
  // force the layers useMemo (and the whole deck.gl layer) to rebuild every render.
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  const center = initialCenter ?? (points.length === 1 ? [points[0].lng, points[0].lat] : [12, 18])
  const zoom = initialZoom ?? (points.length === 1 ? 4 : 1.3)

  useEffect(() => {
    if (flyTo && mapRef.current) {
      mapRef.current.getMap().flyTo({ center: [flyTo.lng, flyTo.lat], zoom: 5, duration: 1200 })
    }
  }, [flyTo?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const layers = useMemo(() => {
    if (!showPoints) return []
    return [
      new ScatterplotLayer<GeoDataset>({
        id: 'datasets',
        data: points,
        pickable: true,
        stroked: true,
        filled: true,
        radiusUnits: 'pixels',
        getPosition: (d) => [d.lng, d.lat],
        getRadius: (d) => (selectedId && d.id === selectedId ? pointSize + 4 : pointSize),
        getFillColor: (d) => (selectedId && d.id === selectedId ? [59, 130, 246, 255] : [37, 99, 235, 205]),
        getLineColor: (d) => (selectedId && d.id === selectedId ? [255, 255, 255, 255] : [255, 255, 255, 200]),
        lineWidthUnits: 'pixels',
        getLineWidth: outlineWidth,
        onClick: (info) => onSelectRef.current?.((info.object as GeoDataset) ?? null),
        updateTriggers: {
          getRadius: [pointSize, selectedId],
          getLineWidth: outlineWidth,
          getFillColor: selectedId,
          getLineColor: selectedId,
        },
      }),
    ]
  }, [points, showPoints, pointSize, outlineWidth, selectedId])

  return (
    <div className="geomap" style={{ height }}>
      <Map
        ref={mapRef}
        initialViewState={{ longitude: center[0], latitude: center[1], zoom }}
        mapStyle={BASEMAPS[basemap]?.style ?? BASEMAPS.dark.style}
        attributionControl={false}
        onLoad={() => setLoaded(true)}
      >
        <DeckOverlay layers={layers} />
        <NavigationControl position="top-right" visualizePitch />
        {!embedded && <GeolocateControl position="top-right" />}
        {!embedded && <FullscreenControl position="top-right" />}
        <ScaleControl position="bottom-left" />
        <AttributionControl position="bottom-right" compact />
      </Map>

      {!loaded && (
        <div className="map-loading">
          <div className="map-loading-spin" />
          <span>Loading Map Data…</span>
        </div>
      )}
    </div>
  )
}
