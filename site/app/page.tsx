'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';

type Point = [number, number, number];
type RouteData = {
  meta: { title: string; author: string; trackId: string; distance: number; elevationGain: number; elevationLoss: number; pointCount: number };
  fragments: Point[][];
  sideTrips: Record<'gokyoRi' | 'fifthLake', { points: Point[]; distance: number; ascent: number; descent: number }>;
  markers: Array<{ name: string; coordinates: Point; description: string }>;
};
type Day = { key: string; title: string; shortTitle: string; points: Point[]; distance: number; ascent: number; descent: number; note: string; lodgingKey: string; optional?: boolean };

const ROUTE_COLORS = ['#ff6b35', '#00a896', '#f5b700', '#6c63ff', '#ef476f', '#118ab2', '#8f5d2f', '#06d6a0', '#d95d39', '#577590', '#9b5de5', '#2a9d8f', '#e76f51'];

const lodging: Record<string, { elevation: number; summary: string; services: string[]; search: string }> = {
  Phakding: { elevation: 2610, summary: '住宿选择较多，适合作为首日缓冲点。', services: ['餐食', '热水', '充电', 'Wi‑Fi'], search: 'Phakding Nepal lodge' },
  Namche: { elevation: 3440, summary: '全线最大的补给与住宿中心，装备、餐饮和通信最完善。', services: ['客栈多', '餐馆', '装备补给', '药店'], search: 'Namche Bazaar lodge Nepal' },
  Pangboche: { elevation: 3990, summary: '村内有多家山屋，海拔提升比直达丁波切更温和。', services: ['餐食', '热水', '充电', 'Wi‑Fi'], search: 'Pangboche lodge Nepal' },
  Dingboche: { elevation: 4410, summary: 'EBC 主线的重要住宿村，也是前往 Chhukhung 的分岔点。', services: ['客栈多', '餐食', '充电', 'Wi‑Fi'], search: 'Dingboche lodge Nepal' },
  Chhukhung: { elevation: 4730, summary: '住宿规模较小，是 Chhukhung Ri 与孔玛拉方向的基地。', services: ['山屋', '餐食', '充电'], search: 'Chhukhung lodge Nepal' },
  Lobuche: { elevation: 4910, summary: '高海拔住宿点，旺季建议尽早抵达。', services: ['山屋', '餐食', '充电', '热水'], search: 'Lobuche lodge Nepal' },
  Dzongla: { elevation: 4830, summary: '措拉垭口前的关键住宿点，床位数量有限。', services: ['山屋', '餐食', '充电'], search: 'Dzongla lodge Nepal' },
  Gokyo: { elevation: 4790, summary: '湖畔山屋集中，可作为观景、休整和第五湖支线基地。', services: ['湖景山屋', '餐食', '充电', 'Wi‑Fi'], search: 'Gokyo lodge Nepal' },
  Lungden: { elevation: 4368, summary: '翻越仁乔拉后的自然拆分点，住宿数量有限。', services: ['山屋', '餐食', '充电'], search: 'Lungden lodge Nepal' },
  Surke: { elevation: 2274, summary: '公路可达的起终点，住宿与交通需提前核实。', services: ['山屋', '餐食', '公路交通'], search: 'Surke Nepal lodge' },
};

const baseMetrics = {
  day1: { distance: 20.65, ascent: 1846, descent: 700 }, day2: { distance: 19.92, ascent: 1570, descent: 680 },
  day3: { distance: 10, ascent: 1098, descent: 700 }, day4: { distance: 12.7, ascent: 666, descent: 500 },
  day5: { distance: 25.78, ascent: 1221, descent: 1310 }, day6: { distance: 13.35, ascent: 937, descent: 1000 },
  day7: { distance: 30, ascent: 1149, descent: 2500 }, day8: { distance: 20.4, ascent: 700, descent: 1840 },
};

function concat(...groups: Point[][]) { return groups.flatMap((group, index) => index === 0 ? group : group.slice(1)); }
function nearestIndex(points: Point[], target?: Point) {
  if (!target) return Math.floor(points.length / 2);
  let best = 0; let score = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => { const next = (point[0] - target[0]) ** 2 + (point[1] - target[1]) ** 2; if (next < score) { score = next; best = index; } });
  return best;
}
function splitAt(points: Point[], target?: Point): [Point[], Point[]] { const index = nearestIndex(points, target); return [points.slice(0, index + 1), points.slice(index)]; }
function rawWeights(points: Point[]) {
  let ascent = 0; let descent = 0;
  for (let index = 1; index < points.length; index += 1) { const delta = points[index][2] - points[index - 1][2]; if (delta > 0) ascent += delta; else descent -= delta; }
  return { ascent, descent };
}
function allocate(paths: Point[][], total: typeof baseMetrics.day1) {
  const raw = paths.map(rawWeights); const distanceWeights = paths.map((path) => Math.max(path.length, 1));
  const distanceTotal = distanceWeights.reduce((a, b) => a + b, 0); const ascentTotal = raw.reduce((sum, value) => sum + value.ascent, 0) || 1; const descentTotal = raw.reduce((sum, value) => sum + value.descent, 0) || 1;
  return paths.map((_, index) => ({ distance: +(total.distance * distanceWeights[index] / distanceTotal).toFixed(2), ascent: Math.round(total.ascent * raw[index].ascent / ascentTotal), descent: Math.round(total.descent * raw[index].descent / descentTotal) }));
}

function buildItineraries(data: RouteData) {
  const f = data.fragments; const marker = (name: string) => data.markers.find((item) => item.name.includes(name))?.coordinates;
  const [surkePhakding, phakdingNamche] = splitAt(f[0], marker('帕克丁')); const namchePangboche = f[1]; const pangbocheDingboche = f[2];
  const dingbocheChhukhung = f[3]; const chhukhungLobuche = f[4]; const lobucheLoop = f[5]; const lobucheDzongla = f[6];
  const dzonglaGokyo = concat(f[7], f[8], f[9]); const gokyoNamche = concat(f[10], f[11]); const [gokyoLungden, lungdenNamche] = splitAt(gokyoNamche, marker('朗顿')); const namcheSurke = f[12];
  const [m1a, m1b] = allocate([surkePhakding, phakdingNamche], baseMetrics.day1); const [m2a, m2b] = allocate([namchePangboche, pangbocheDingboche], baseMetrics.day2);
  const [m5a, m5b] = allocate([lobucheLoop, lobucheDzongla], baseMetrics.day5); const [m7a, m7b] = allocate([gokyoLungden, lungdenNamche], baseMetrics.day7);
  const make = (key: string, title: string, shortTitle: string, points: Point[], metrics: typeof baseMetrics.day1, note: string, lodgingKey: string, optional = false): Day => ({ key, title, shortTitle, points, ...metrics, note, lodgingKey, optional });
  const gokyoSideTrips = [data.sideTrips.gokyoRi, data.sideTrips.fifthLake];
  const gokyoRestMetrics = gokyoSideTrips.reduce((total, trip) => ({ distance: total.distance + trip.distance, ascent: total.ascent + trip.ascent, descent: total.descent + trip.descent }), { distance: 0, ascent: 0, descent: 0 });
  const s = {
    a: make('surke-phakding', 'Surke → Phakding', '苏克—帕克丁', surkePhakding, m1a, '降低首日强度，在河谷村落提前住宿。', 'Phakding'),
    b: make('phakding-namche', 'Phakding → Namche', '帕克丁—南池', phakdingNamche, m1b, '通过国家公园入口与高吊桥后持续爬升至南池。', 'Namche'),
    ab: make('surke-namche', 'Surke → Namche', '苏克—南池', concat(surkePhakding, phakdingNamche), baseMetrics.day1, '8 天版首日强度很高，累计爬升接近 1,850 米。', 'Namche'),
    c: make('namche-pangboche', 'Namche → Pangboche', '南池—旁波切', namchePangboche, m2a, '途经天波切方向，午后云雾通常上升较快。', 'Pangboche'),
    d: make('pangboche-dingboche', 'Pangboche → Dingboche', '旁波切—丁波切', pangbocheDingboche, m2b, '较短的一天有利于缓解连续快速升高。', 'Dingboche'),
    cd: make('namche-dingboche', 'Namche → Dingboche', '南池—丁波切', concat(namchePangboche, pangbocheDingboche), baseMetrics.day2, '连续上升至 4,400 米区域，需要严密观察高反症状。', 'Dingboche'),
    e: make('dingboche-chhukhung', 'Dingboche → Chhukhung Ri → Chhukhung', '丁波切—朱孔观景台', dingbocheChhukhung, baseMetrics.day3, '观景台最高约 5,385 米；实走下午起雾后返回。', 'Chhukhung'),
    f: make('chhukhung-lobuche', 'Chhukhung → Dingboche → Lobuche', '朱孔—罗波切', chhukhungLobuche, baseMetrics.day4, '大雪和晨雾覆盖路迹，独行时放弃孔玛拉垭口，改走丁波切。', 'Lobuche'),
    g: make('lobuche-loop', 'Lobuche → EBC → Kala Patthar → Lobuche', '罗波切—EBC—卡拉帕塔', lobucheLoop, m5a, '同日完成 EBC 与卡拉帕塔，最高约 5,649 米。', 'Lobuche'),
    h: make('lobuche-dzongla', 'Lobuche → Dzongla', '罗波切—宗拉', lobucheDzongla, m5b, '罗波切休息后继续横切至宗拉。', 'Dzongla'),
    gh: make('lobuche-dzongla-full', 'Lobuche → EBC → Kala Patthar → Dzongla', '罗波切—EBC—宗拉', concat(lobucheLoop, lobucheDzongla), baseMetrics.day5, '全程强度极高，8 天版当日下午抵达宗拉。', 'Dzongla'),
    i: make('dzongla-gokyo', 'Dzongla → Cho La → Gokyo', '宗拉—措拉—高乔', dzonglaGokyo, baseMetrics.day6, '措拉垭口冰雪段需要根据现场情况使用冰爪；实走因雾放弃 Gokyo Ri。', 'Gokyo'),
    j: make('gokyo-lungden', 'Gokyo → Renjo La → Lungden', '高乔—仁乔拉—朗顿', gokyoLungden, m7a, '翻越仁乔拉后在朗顿住宿，避免单日下降至南池。', 'Lungden'),
    k: make('lungden-namche', 'Lungden → Namche', '朗顿—南池', lungdenNamche, m7b, '沿山谷继续下降返回南池。', 'Namche'),
    jk: make('gokyo-namche', 'Gokyo → Renjo La → Namche', '高乔—仁乔拉—南池', gokyoNamche, baseMetrics.day7, '30 公里长距离并累计下降约 2,500 米。', 'Namche'),
    l: make('namche-surke', 'Namche → Surke', '南池—苏克', namcheSurke, baseMetrics.day8, '长距离下降结束全程，注意膝踝与湿滑石阶。', 'Surke'),
    rest: make('gokyo-rest', 'Gokyo → Gokyo Ri → 第五湖 → Gokyo', '高乔观景台—第五湖', concat(data.sideTrips.gokyoRi.points, data.sideTrips.fifthLake.points), gokyoRestMetrics, '两条往返支线均来自补充 KML；可根据天气、体能和能见度只走其中一条。', 'Gokyo'),
  };
  return {
    8: [s.ab, s.cd, s.e, s.f, s.gh, s.i, s.jk, s.l], 9: [s.ab, s.cd, s.e, s.f, s.g, s.h, s.i, s.jk, s.l],
    10: [s.ab, s.cd, s.e, s.f, s.g, s.h, s.i, s.j, s.k, s.l], 11: [s.ab, s.c, s.d, s.e, s.f, s.g, s.h, s.i, s.j, s.k, s.l],
    12: [s.ab, s.c, s.d, s.e, s.f, s.g, s.h, s.i, s.rest, s.j, s.k, s.l], 13: [s.a, s.b, s.c, s.d, s.e, s.f, s.g, s.h, s.i, s.rest, s.j, s.k, s.l],
  } as Record<number, Day[]>;
}

function ElevationChart({ points, hover }: { points: Point[]; hover: (point?: Point) => void }) {
  const chartPoints = useMemo(() => { if (!points.length) return []; const step = Math.max(1, Math.ceil(points.length / 420)); return points.filter((_, index) => index % step === 0 || index === points.length - 1); }, [points]);
  if (!chartPoints.length) return <div className="empty-profile">休整日不计精确距离，支线根据天气现场决定。</div>;
  const min = Math.min(...chartPoints.map((point) => point[2])); const max = Math.max(...chartPoints.map((point) => point[2])); const span = Math.max(max - min, 1);
  const polyline = chartPoints.map((point, index) => `${(index / Math.max(chartPoints.length - 1, 1) * 1000).toFixed(1)},${(170 - (point[2] - min) / span * 130).toFixed(1)}`).join(' ');
  return <div className="profile-wrap"><div className="profile-labels"><span>{Math.round(max)} m</span><span>{Math.round(min)} m</span></div><svg className="profile" viewBox="0 0 1000 190" preserveAspectRatio="none" onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const index = Math.max(0, Math.min(chartPoints.length - 1, Math.round((event.clientX - rect.left) / rect.width * (chartPoints.length - 1)))); hover(chartPoints[index]); }} onPointerLeave={() => hover(undefined)} aria-label={`海拔剖面，最低 ${Math.round(min)} 米，最高 ${Math.round(max)} 米`}><defs><linearGradient id="profileFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff6b35" stopOpacity="0.42" /><stop offset="1" stopColor="#ff6b35" stopOpacity="0.03" /></linearGradient></defs><polygon points={`0,190 ${polyline} 1000,190`} fill="url(#profileFill)" /><polyline points={polyline} fill="none" stroke="#ff6b35" strokeWidth="4" vectorEffect="non-scaling-stroke" /></svg></div>;
}

export default function Home() {
  const [data, setData] = useState<RouteData | null>(null); const [version, setVersion] = useState(8); const [selectedDay, setSelectedDay] = useState(0); const [mapReady, setMapReady] = useState(false);
  const mapContainer = useRef<HTMLDivElement>(null); const mapRef = useRef<MapLibreMap | null>(null); const hoverMarker = useRef<MapLibreMarker | null>(null);
  useEffect(() => { fetch(new URL('route-data.json', document.baseURI)).then((response) => response.json()).then(setData); }, []);
  const itineraries = useMemo(() => data ? buildItineraries(data) : null, [data]);
  const days = useMemo(() => itineraries?.[version] ?? [], [itineraries, version]);
  const day = days[Math.min(selectedDay, Math.max(days.length - 1, 0))];
  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !data) return; let cancelled = false;
    import('maplibre-gl').then(({ Map, NavigationControl, Marker }) => {
      if (cancelled || !mapContainer.current) return;
      const map = new Map({ container: mapContainer.current, center: [86.72, 27.86], zoom: 9.1, style: { version: 8, sources: {}, layers: [{ id: 'terrain-background', type: 'background', paint: { 'background-color': '#dfe4dc' } }] }, attributionControl: false });
      map.addControl(new NavigationControl({ showCompass: true }), 'top-right'); hoverMarker.current = new Marker({ color: '#111827', scale: 0.7 });
      map.on('load', () => {
        map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'route-shadow', type: 'line', source: 'routes', paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.88 } });
        map.addLayer({ id: 'routes', type: 'line', source: 'routes', paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 5, 3], 'line-opacity': ['case', ['get', 'selected'], 1, 0.58] }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        [
          ['帕克丁', '帕克丁'], ['Day1和day7南池住宿', '南池'], ['看到旁波切了', '旁波切'],
          ['Day2丁波切住宿', '丁波切'], ['Day3朱孔住宿', '朱孔'], ['Day4罗波切住宿', '罗波切'],
          ['EBC大本营', 'EBC'], ['Day5宗拉住宿', '宗拉'], ['高桥', '高乔'], ['仁乔拉垭口', '仁乔拉'], ['朗顿', '朗顿'],
        ].forEach(([markerName, displayName]) => {
          const place = data.markers.find((item) => item.name === markerName);
          if (!place) return;
          const element = document.createElement('div');
          element.className = 'place-marker';
          element.textContent = displayName;
          new Marker({ element, anchor: 'bottom' }).setLngLat([place.coordinates[0], place.coordinates[1]]).addTo(map);
        });
        mapRef.current = map;
        setMapReady(true);
      });
    }); return () => { cancelled = true; };
  }, [data]);
  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map || !days.length) return; const source = map.getSource('routes') as { setData: (data: unknown) => void } | undefined;
    source?.setData({ type: 'FeatureCollection', features: days.filter((item) => item.points.length).map((item, index) => ({ type: 'Feature', properties: { color: ROUTE_COLORS[index % ROUTE_COLORS.length], selected: index === selectedDay }, geometry: { type: 'LineString', coordinates: item.points.map((point) => [point[0], point[1]]) } })) });
    if (day?.points.length) { const lngs = day.points.map((point) => point[0]); const lats = day.points.map((point) => point[1]); map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 54, duration: 650, maxZoom: 12.6 }); }
  }, [days, day, selectedDay, mapReady]);
  const summary = useMemo(() => days.reduce((result, item) => ({ distance: result.distance + item.distance, ascent: result.ascent + item.ascent, descent: result.descent + item.descent }), { distance: 0, ascent: 0, descent: 0 }), [days]);
  const selectedLodging = day ? lodging[day.lodgingKey] : undefined; const maxAltitude = day?.points.length ? Math.max(...day.points.map((point) => point[2])) : selectedLodging?.elevation ?? 0; const endAltitude = day?.points.at(-1)?.[2] ?? selectedLodging?.elevation ?? 0;
  const handleHover = (point?: Point) => { if (!mapRef.current || !hoverMarker.current) return; if (!point) { hoverMarker.current.remove(); return; } hoverMarker.current.setLngLat([point[0], point[1]]).addTo(mapRef.current); };
  return <main>
    <header className="topbar"><a className="brand" href="#top" aria-label="返回顶部"><span className="brand-mark">E</span><span><strong>EBC THREE PASSES</strong><small>路线规划器</small></span></a><div className="source-pill">两步路轨迹 #{data?.meta.trackId ?? '—'} · 路飞在路上</div></header>
    <section id="top" className="hero"><div><p className="eyebrow">SURKE · EVEREST BASE CAMP · GOKYO</p><h1>8–13 天 EBC<br /><em>三垭口大环线</em></h1><p className="hero-copy">同一条 152.9 公里实走轨迹，通过合理拆分住宿日降低单日强度。地图、每日数据与海拔剖面来自原始 KML。</p></div><div className="route-summary"><span>当前方案</span><strong>{version}<small> 天</small></strong><dl><div><dt>总距离</dt><dd>{summary.distance.toFixed(1)} km</dd></div><div><dt>累计爬升</dt><dd>{Math.round(summary.ascent).toLocaleString()} m</dd></div><div><dt>累计下降</dt><dd>{Math.round(summary.descent).toLocaleString()} m</dd></div></dl></div></section>
    <nav className="version-switch" aria-label="选择行程版本">{[8, 9, 10, 11, 12, 13].map((item) => <button key={item} className={version === item ? 'active' : ''} onClick={() => { setVersion(item); setSelectedDay(0); }}><strong>{item}</strong><span>天版</span></button>)}</nav>
    <section className="planner"><aside className="day-rail"><div className="section-heading"><span>每日行程</span><small>{days.length} STAGES</small></div><div className="day-list">{days.map((item, index) => <button key={`${version}-${item.key}`} className={selectedDay === index ? 'day-card active' : 'day-card'} onClick={() => setSelectedDay(index)}><span className="day-number">{String(index + 1).padStart(2, '0')}</span><span className="day-name"><strong>{item.shortTitle}</strong><small>{item.optional ? '天气窗口支线' : `${item.distance.toFixed(1)} km · +${item.ascent} m`}</small></span><i style={{ background: ROUTE_COLORS[index % ROUTE_COLORS.length] }} /></button>)}</div></aside><div className="map-panel"><div ref={mapContainer} className="map" aria-label="EBC 徒步路线地图" />{!mapReady && <div className="map-loading">正在加载路线地图…</div>}<div className="map-legend"><span><i className="solid" />当前日</span><span><i className="dashed" />其他行程</span></div><div className="map-title"><small>DAY {String(selectedDay + 1).padStart(2, '0')}</small><strong>{day?.title ?? '加载路线'}</strong></div></div></section>
    {day && <section className="details"><div className="detail-main"><div className="section-heading"><span>当日数据</span><small>基于 KML 与原始记录</small></div><div className="metrics"><div><span>距离</span><strong>{day.distance.toFixed(2)}</strong><small>km</small></div><div><span>爬升</span><strong>{day.ascent}</strong><small>m</small></div><div><span>下降</span><strong>{day.descent}</strong><small>m</small></div><div><span>最高</span><strong>{Math.round(maxAltitude)}</strong><small>m</small></div><div><span>终点</span><strong>{Math.round(endAltitude)}</strong><small>m</small></div></div><ElevationChart points={day.points} hover={handleHover} /><div className="field-note"><span>实走提示</span><p>{day.note}</p></div></div><aside className="lodging-card"><div className="lodging-top"><span>终点住宿</span><strong>{day.lodgingKey}</strong><small>约 {selectedLodging?.elevation ?? Math.round(endAltitude)} m</small></div><p>{selectedLodging?.summary}</p><div className="service-tags">{selectedLodging?.services.map((service) => <span key={service}>{service}</span>)}</div><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedLodging?.search ?? `${day.lodgingKey} lodge Nepal`)}`} target="_blank" rel="noreferrer">在 Google Maps 查看住宿 ↗</a><small className="lodging-disclaimer">营业、价格和床位受季节与天气影响，出发前再次确认。</small></aside></section>}
    <section className="safety"><span className="safety-index">01</span><div><p className="eyebrow">ROUTE PRINCIPLE</p><h2>路线不变，<em>让强度回到可控范围。</em></h2></div><p>8 天版只适合具备多次高海拔重装经验、体能耐力中上且能独立判断天气与撤退时机的人。更长版本通过帕克丁、旁波切、罗波切、朗顿与高乔休整逐步降低单日负担，但不会消除高反、冰雪垭口、迷路和突发天气风险。</p></section>
    <footer><span>EBC ROUTE PLANNER</span><span>数据源：两步路 KML · 作者：路飞在路上</span></footer>
  </main>;
}
